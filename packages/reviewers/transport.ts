import {canonical,digest} from '../review/engine.ts';
import {validateReviewAdmission,type ReviewAdmissionRequest} from './admission.ts';
import {validateReviewExecutionSummary,type ReviewExecutionSummary} from './summary.ts';
export interface ModelReviewAccepted {schemaVersion:'v1alpha1';id:string;requestDigest:string}
export interface ModelReviewCancellation {schemaVersion:'v1alpha1';id:string;cancelRequested:true}
export interface ReviewerProfileList {schemaVersion:'v1alpha1';profiles:{id:string;revision:string;mode:'synthetic'|'live';revoked:boolean}[]}
export interface ModelReviewStatus {
 schemaVersion:'v1alpha1';admission:{request:ReviewAdmissionRequest;digest:string};
 execution:{state:'queued'|'dispatched'|'completed'|'failed'|'cancelled'|'terminated'|'timed-out';cancelRequested:boolean;terminalDigest:string|null};
 summary:{summary:ReviewExecutionSummary;digest:string}|null;
}
const exact=(v:any,keys:string[])=>v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const sha=(v:unknown)=>typeof v==='string'&&/^sha256:[a-f0-9]{64}$/.test(v);
function invalid():never{throw Error('invalid-model-review-transport');}
function bounded(v:unknown){try{if(Buffer.byteLength(JSON.stringify(v))>4*1024*1024)invalid();}catch{invalid();}}
export function validateModelReviewAccepted(value:unknown):ModelReviewAccepted{
 const v=value as ModelReviewAccepted;if(!exact(v,['schemaVersion','id','requestDigest'])||v.schemaVersion!=='v1alpha1'||!uuid(v.id)||!sha(v.requestDigest))invalid();return structuredClone(v);
}
export function validateModelReviewCancellation(value:unknown):ModelReviewCancellation{
 const v=value as ModelReviewCancellation;if(!exact(v,['schemaVersion','id','cancelRequested'])||v.schemaVersion!=='v1alpha1'||!uuid(v.id)||v.cancelRequested!==true)invalid();return structuredClone(v);
}
export function validateReviewerProfileList(value:unknown):ReviewerProfileList{
 bounded(value);const v=value as ReviewerProfileList;
 if(!exact(v,['schemaVersion','profiles'])||v.schemaVersion!=='v1alpha1'||!Array.isArray(v.profiles)||v.profiles.length>64)invalid();
 let previous='';for(const p of v.profiles){if(!exact(p,['id','revision','mode','revoked'])||typeof p.id!=='string'||!/^[A-Za-z0-9._-]{1,128}$/.test(p.id)||!sha(p.revision)||!['synthetic','live'].includes(p.mode)||typeof p.revoked!=='boolean')invalid();const key=canonical([p.id,p.revision]);if(key<=previous)invalid();previous=key;}
 return structuredClone(v);
}
export function validateModelReviewStatus(value:unknown):ModelReviewStatus{
 try{
  bounded(value);const v=value as ModelReviewStatus;if(!exact(v,['schemaVersion','admission','execution','summary'])||v.schemaVersion!=='v1alpha1'||!exact(v.admission,['request','digest'])||!exact(v.execution,['state','cancelRequested','terminalDigest']))invalid();
  const request=validateReviewAdmission(v.admission.request);if(canonical(request)!==canonical(v.admission.request)||v.admission.digest!==digest(canonical(request)))invalid();
  const e=v.execution,terminal=!['queued','dispatched'].includes(e.state);
  if(!['queued','dispatched','completed','failed','cancelled','terminated','timed-out'].includes(e.state)||typeof e.cancelRequested!=='boolean'||(terminal?!sha(e.terminalDigest):e.terminalDigest!==null))invalid();
  if(v.summary!==null){if(!exact(v.summary,['summary','digest']))invalid();const s=validateReviewExecutionSummary(v.summary.summary);if(s.admissionId!==request.id||s.admissionDigest!==v.admission.digest||s.profileRevision!==request.profile.revision||s.mode!==request.mode||v.summary.digest!==digest(canonical(s))||(terminal&&e.state!=='completed'))invalid();}
  if(e.state==='completed'&&(!v.summary||e.terminalDigest!==v.summary.digest))invalid();
  return structuredClone(v);
 }catch{return invalid();}
}
