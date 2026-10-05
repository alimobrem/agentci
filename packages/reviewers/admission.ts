import {canonical,digest} from '../review/engine.ts';
import type {ReviewSubject} from './context.ts';
export interface ReviewAdmissionRequest {
 schemaVersion:'v1alpha1';id:string;subject:ReviewSubject;
 profile:{id:string;revision:string};mode:'synthetic'|'live';
}
/** Evidence of controller authorization, never authorization merely by possession. */
export interface ReviewAdmissionApproval {
 requestDigest:string;policyDigest:string;profileRevision:string;mode:'synthetic'|'live';
}
export class InvalidReviewAdmission extends Error {constructor(){super('invalid-review-admission');}}
const fail=():never=>{throw new InvalidReviewAdmission();};
const record=(value:unknown,keys:string[]):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value))&&Object.keys(value).sort().join(',')===keys.sort().join(',');
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const sha=(value:unknown,size:number)=>typeof value==='string'&&new RegExp(`^[a-f0-9]{${size}}$`).test(value);
const hash=(value:unknown)=>typeof value==='string'&&/^sha256:[a-f0-9]{64}$/.test(value);
export function validateReviewAdmission(value:unknown):ReviewAdmissionRequest {
 try{
  if(!record(value,['schemaVersion','id','subject','profile','mode'])||value.schemaVersion!=='v1alpha1'||!uuid(value.id)||!['synthetic','live'].includes(value.mode as string))fail();
  const v=value as Record<string,unknown>,s=v.subject,p=v.profile;
  if(!record(s,['organizationId','repository','pullRequest','baseSha','headSha'])||!uuid(s.organizationId)||typeof s.repository!=='string'||s.repository.length>256||!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(s.repository)||!Number.isSafeInteger(s.pullRequest)||(s.pullRequest as number)<1||!sha(s.baseSha,40)||!sha(s.headSha,40)||s.baseSha===s.headSha)fail();
  if(!record(p,['id','revision'])||typeof p.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(p.id)||!hash(p.revision))fail();
  const result=structuredClone(value) as ReviewAdmissionRequest;
  result.id=result.id.toLowerCase();result.subject.organizationId=result.subject.organizationId.toLowerCase();
  if(Buffer.byteLength(canonical(result))>4096)fail();return result;
 }catch{return fail();}
}
export function validateReviewAdmissionApproval(value:unknown,request:ReviewAdmissionRequest):ReviewAdmissionApproval {
 try{
 const normalized=validateReviewAdmission(request);
 if(!record(value,['requestDigest','policyDigest','profileRevision','mode'])||value.requestDigest!==digest(canonical(normalized))||!hash(value.policyDigest)||value.profileRevision!==normalized.profile.revision||value.mode!==normalized.mode)fail();
 return structuredClone(value) as ReviewAdmissionApproval;
 }catch{return fail();}
}
