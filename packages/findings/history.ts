import {applyNonExecution,validateNonExecutionProof,type ReproductionNonExecutionProof,type UnavailableFindingAction} from './non-execution.ts';
import {canonical,digest} from '../review/engine.ts';
import {validateModelFinding,mergeFindingEvidence,type ModelFinding} from './model.ts';
import {createFindingTransitions,validateFindingActionReceipt,type FindingAction,type FindingReceipt} from './lifecycle.ts';
import type {ReviewSubject} from '../reviewers/context.ts';
export interface FindingHistoryEvent {
 schemaVersion:'v1alpha1'|'v1alpha2';nonExecution?:ReproductionNonExecutionProof;operationId:string;inputDigest:string;previousDigest:string|null;
 action:{type:'create'}|{type:'evidence';finding:ModelFinding}|FindingAction|UnavailableFindingAction;receipt:FindingReceipt|null;finding:ModelFinding;
}
export interface FindingHistoryRecord {digest:string;event:FindingHistoryEvent}
/** Validates one retained event. A digest proves integrity, not writer authority.
 * Use validateFindingHistoryLink for the transition from its predecessor. */
export function validateFindingHistoryRecord(value:unknown,subject:ReviewSubject):FindingHistoryRecord {
 const fail=():never=>{throw Error('invalid-finding-history');};
 const record=value as FindingHistoryRecord,event=record?.event;
 if(!record||Object.keys(record).sort().join(',')!=='digest,event'||!event||Object.keys(event).sort().join(',')!==(event.schemaVersion==='v1alpha2'?'action,finding,inputDigest,nonExecution,operationId,previousDigest,receipt,schemaVersion':'action,finding,inputDigest,operationId,previousDigest,receipt,schemaVersion')||!['v1alpha1','v1alpha2'].includes(event.schemaVersion)||! /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(event.operationId)||! /^sha256:[a-f0-9]{64}$/.test(event.inputDigest)||record.digest!==digest(canonical(event)))fail();
 const finding=validateModelFinding(event.finding,subject);if(finding.version<1||finding.version>10000)fail();
 if(!event.action||typeof event.action!=='object'||Array.isArray(event.action))fail();
 const input=finding.version===1?{type:'create',finding}:{id:finding.id,subject,action:event.action,expectedVersion:finding.version-1};
 if(event.inputDigest!==digest(canonical(input)))fail();
 if(finding.version===1){if(event.previousDigest!==null||canonical(event.action)!==canonical({type:'create'})||event.receipt!==null||finding.state!=='deduplicated')fail();}
 else if(! /^sha256:[a-f0-9]{64}$/.test(event.previousDigest??'')||event.action.type==='create')fail();
 if((event.schemaVersion==='v1alpha2')!==(event.action.type==='unavailable'))fail();
 if(event.action.type==='unavailable'){
  const p=validateNonExecutionProof(event.nonExecution,finding);if(event.receipt!==null||Object.keys(event.action).sort().join(',')!=='proofId,type'||event.action.proofId!==p.id||finding.version!==p.queuedVersion+1||finding.state!=='unconfirmed'||canonical(finding.disposition)!==canonical({kind:'reproduction',outcome:'error',evidenceDigest:digest(canonical(p)),reason:p.status==='cancelled'?'Cancelled before execution; unverified.':'Input resource limit prevented execution; unverified.'}))fail();
 }else if(event.action.type==='evidence'){
  if(Object.keys(event.action).sort().join(',')!=='finding,type'||event.receipt!==null)fail();const incoming=validateModelFinding(event.action.finding,subject);if(incoming.id!==finding.id||incoming.version!==1||incoming.state!=='deduplicated')fail();
 }else if(event.action.type!=='create'){
  validateFindingActionReceipt(event.action,event.receipt,finding);
  if(event.action.type==='queue'){if(finding.state!=='reproduction-pending'||finding.disposition!==null)fail();}
  else {const r=event.receipt!;const state=event.action.type==='reproduce'?(r.outcome==='reproduced'?'confirmed':'unconfirmed'):event.action.type==='resolve'?'resolved':'false-positive';if(finding.state!==state||canonical(finding.disposition)!==canonical({kind:r.actor,evidenceDigest:r.evidenceDigest,reason:r.reason,outcome:r.outcome}))fail();}
 }
 return structuredClone(record);
}
export async function validateFindingHistoryLink(record:FindingHistoryRecord,subject:ReviewSubject,prior?:FindingHistoryRecord):Promise<FindingHistoryRecord>{
 const r=validateFindingHistoryRecord(record,subject),e=r.event;
 if(!prior){if(e.finding.version!==1)throw Error('invalid-finding-history');return r;}
 if(e.previousDigest!==prior.digest||e.finding.id!==prior.event.finding.id||e.finding.version!==prior.event.finding.version+1)throw Error('invalid-finding-history');
 let next:ModelFinding;
 if(e.action.type==='unavailable'){
  next=applyNonExecution(prior.event.finding,e.action,e.nonExecution!,prior.event.finding.version);
 }else if(e.action.type==='evidence'){
  if(Object.keys(e.action).sort().join(',')!=='finding,type'||e.receipt!==null)throw Error('invalid-finding-history');
  next=mergeFindingEvidence(prior.event.finding,e.action.finding);
 }else{
  if(e.action.type==='create'||e.action.type==='queue'&&e.receipt!==null||e.action.type!=='queue'&&e.receipt===null)throw Error('invalid-finding-history');
  next=(await createFindingTransitions(async()=>e.receipt!)(prior.event.finding,e.action,prior.event.finding.version)).finding;
 }
 if(canonical(next)!==canonical(e.finding))throw Error('invalid-finding-history');return r;
}
