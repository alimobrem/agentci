import {createHash} from 'node:crypto';
import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {safePath} from './delivery.ts';
export const evidenceBoundaries=['local-feedback','ci','publication','download'] as const;
export interface EvidenceIdentity {
 sourceCommit:string;artifactDigest:string;platform:string;verifierRevision:string;
 subject:string;boundary:typeof evidenceBoundaries[number];coverage:string[];
}
export interface EvidenceRecord extends EvidenceIdentity {
 id:string;recordedAt:string;result:'passed'|'failed';reason:string|null;
 proof:{path:string;sha256:string};seconds:number|null;cache:'cold'|'warm'|'unknown';
}
export interface EvidenceInvalidation {recordId:string;at:string;reason:string}
const digest=(value:unknown)=>typeof value==='string'&&/^sha256:[a-f0-9]{64}$/.test(value);
export function validateEvidenceIdentity(value:EvidenceIdentity){
 if(!value||!/^[a-f0-9]{40}$/.test(value.sourceCommit)||!digest(value.artifactDigest)||!digest(value.verifierRevision)||!['linux/amd64','linux/arm64','darwin/arm64','darwin/amd64','platform-independent'].includes(value.platform)||!evidenceBoundaries.includes(value.boundary)||!/^[-a-zA-Z0-9_.:/]{1,120}$/.test(value.subject)||!Array.isArray(value.coverage)||!value.coverage.length||value.coverage.length>200||new Set(value.coverage).size!==value.coverage.length||value.coverage.some(id=>typeof id!=='string'||!/^[-a-zA-Z0-9_.:/]{1,120}$/.test(id)))throw new Error('Invalid evidence identity or coverage');
}
export function evidenceKey(value:EvidenceIdentity){
 validateEvidenceIdentity(value);
 const {sourceCommit,artifactDigest,platform,verifierRevision,subject,boundary}=value;
 return 'sha256:'+createHash('sha256').update(JSON.stringify({sourceCommit,artifactDigest,platform,verifierRevision,subject,boundary})).digest('hex');
}
export function validateEvidenceRecord(record:EvidenceRecord){
 validateEvidenceIdentity(record);
 if(Object.keys(record).sort().join(',')!==['sourceCommit','artifactDigest','platform','verifierRevision','subject','boundary','coverage','id','recordedAt','result','reason','proof','seconds','cache'].sort().join(',')||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(record.id)||!record.recordedAt||!Number.isFinite(Date.parse(record.recordedAt))||!['passed','failed'].includes(record.result)||record.reason!==null&&(typeof record.reason!=='string'||!record.reason.trim()||record.reason.length>1000)||!record.proof||Object.keys(record.proof).sort().join(',')!=='path,sha256'||!safePath(record.proof.path)||! /^(?:releases|delivery\/acceptance|docs)\//.test(record.proof.path)||! /\.(?:json|md)$/.test(record.proof.path)||!/^[a-f0-9]{64}$/.test(record.proof.sha256)||record.seconds!==null&&(!Number.isFinite(record.seconds)||record.seconds<0)||!['cold','warm','unknown'].includes(record.cache))throw new Error('Invalid evidence result, proof or measurements');
}
export function validateEvidenceHistory(records:EvidenceRecord[],invalidations:EvidenceInvalidation[]=[]){
 const ids=new Set<string>(),previous=new Map<string,EvidenceRecord>();
 for(const record of records){
  validateEvidenceRecord(record);if(ids.has(record.id))throw new Error('Duplicate evidence record');ids.add(record.id);
  const key=evidenceKey(record),prior=previous.get(key);
  if(prior&&!record.reason?.trim())throw new Error('Repeated verification requires an invalidation/rerun reason');
  if(prior&&Date.parse(record.recordedAt)<Date.parse(prior.recordedAt))throw new Error('Evidence record order regressed');
  previous.set(key,record);
 }
 for(const invalidation of invalidations){
  const record=records.find(r=>r.id===invalidation.recordId);
  if(!record||typeof invalidation.reason!=='string'||!invalidation.reason.trim()||invalidation.reason.length>1000||!Number.isFinite(Date.parse(invalidation.at))||Date.parse(invalidation.at)<Date.parse(record.recordedAt))throw new Error('Invalid evidence invalidation');
 }
}
export function reusableEvidence(request:EvidenceIdentity,records:EvidenceRecord[],invalidations:EvidenceInvalidation[]=[]):EvidenceRecord|null{
 validateEvidenceHistory(records,invalidations);const key=evidenceKey(request);
 const latest=records.filter(record=>evidenceKey(record)===key).at(-1);
 if(!latest||latest.result!=='passed'||invalidations.some(event=>event.recordId===latest.id)||request.coverage.some(id=>!latest.coverage.includes(id)))return null;
 return latest;
}
export async function verifyEvidenceProof(record:EvidenceRecord){
 validateEvidenceRecord(record);
 const file=await open(record.proof.path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const stat=await file.stat();if(!stat.isFile()||stat.size>4194304)throw new Error('Proof must be a bounded regular JSON/Markdown record');
  const bytes=Buffer.alloc(4194305);let size=0;
  while(size<bytes.length){const read=await file.read(bytes,size,bytes.length-size,null);if(!read.bytesRead)break;size+=read.bytesRead;}
  if(size>4194304||createHash('sha256').update(bytes.subarray(0,size)).digest('hex')!==record.proof.sha256)throw new Error('Evidence proof bytes changed');
 }finally{await file.close();}
}
export function evidenceMeasurements(records:EvidenceRecord[]){
 validateEvidenceHistory(records);
 const groups=new Map<string,{subject:string;boundary:string;platform:string;verifierRevision:string;coverage:string[];cache:string;attempts:number;failures:number;seconds:number[]}>();
 for(const record of records){
  // Never combine coverage, verifier, platform or cache cohorts to claim speedup.
  const coverage=[...record.coverage].sort(),key=JSON.stringify([record.subject,record.boundary,record.platform,record.verifierRevision,coverage,record.cache]);
  const group=groups.get(key)??{subject:record.subject,boundary:record.boundary,platform:record.platform,verifierRevision:record.verifierRevision,coverage,cache:record.cache,attempts:0,failures:0,seconds:[]};
  group.attempts++;if(record.result==='failed')group.failures++;if(record.seconds!==null)group.seconds.push(record.seconds);groups.set(key,group);
 }
 return {cohorts:[...groups.values()],interpretation:'Observed verification attempts only. Cycle time, blockers, intervention and rework remain separate delivery events. No total development acceleration is inferred.'};
}
