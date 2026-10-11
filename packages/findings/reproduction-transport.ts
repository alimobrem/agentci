import {canonical,digest} from '../review/engine.ts';
import {validateReviewAdmission} from '../reviewers/admission.ts';
import type {ReproductionSelector} from './approval-registry.ts';
import type {ReviewSubject} from '../reviewers/context.ts';
import {validateFindingActionReceipt,type FindingReceipt} from './lifecycle.ts';
import {validateNonExecutionProof,type ReproductionNonExecutionProof} from './non-execution.ts';
import {nameUuid} from '../evals/request-id.ts';
export interface ReproductionReference {
 schemaVersion:'v1alpha1';id:string;operationId:string;reviewId:string;subject:ReviewSubject;
 finding:{id:string;queuedVersion:number;digest:string};planDigest:string;requestDigest:string;
}
export type FindingReproductionAccepted=ReproductionReference;
export interface FindingReproductionCancellation {schemaVersion:'v1alpha1';id:string;cancelRequested:true}
export type ReproductionCancellationCause='user'|'revoked'|'expired'|'permission-denied'|'superseded'|'unavailable';
export interface FindingReproductionStatus extends ReproductionReference {
 dispatch:{state:'queued'|'bound'|'dispatched'|'settled';cancelRequested:boolean;cancellationCause:ReproductionCancellationCause|null};
 receipt:{value:FindingReceipt;digest:string}|null;
 nonExecution:{value:ReproductionNonExecutionProof;digest:string}|null;
 settlement:{kind:'receipt-retained'|'never-staged'|'superseded';findingVersion:number;historyDigest:string;evidenceDigest:string;retainedReceiptDigest:string|null;retainedProofDigest:string|null}|null;
}
export interface ExpectedReproductionIdentity {id:string;reviewId:string;subject:ReviewSubject;operationId?:string;findingId?:string;planDigest?:string;requestDigest?:string;queuedVersion?:number;queuedFindingDigest?:string}
const referenceKeys=['schemaVersion','id','operationId','reviewId','subject','finding','planDigest','requestDigest'];
const exact=(v:any,keys:string[])=>!!v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Object.keys(v).sort().join(',')===keys.sort().join(',');
const hash=(v:unknown)=>typeof v==='string'&&/^sha256:[a-f0-9]{64}$/.test(v);
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const integer=(v:unknown,min:number,max:number)=>Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=max;
const fail=():never=>{throw Error('invalid-finding-reproduction-transport');};
function bounded(value:unknown){let nodes=0;const visit=(v:unknown,depth:number)=>{if(++nodes>50000||depth>32)fail();if(v===null||typeof v==='string'||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v))return;if(!v||typeof v!=='object'||!Array.isArray(v)&&![Object.prototype,null].includes(Object.getPrototypeOf(v)))fail();for(const child of Object.values(v as object))visit(child,depth+1);};visit(value,0);if(Buffer.byteLength(JSON.stringify(value))>4*1024*1024)fail();}
function reference(v:ReproductionReference,expected:ExpectedReproductionIdentity){
 const s=v.subject;
 if(v.schemaVersion!=='v1alpha1'||![v.id,v.operationId,v.reviewId].every(uuid)||!exact(s,['organizationId','repository','pullRequest','baseSha','headSha'])||!uuid(s.organizationId)||typeof s.repository!=='string'||s.repository.length>256||!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(s.repository)||!integer(s.pullRequest,1,Number.MAX_SAFE_INTEGER)||![s.baseSha,s.headSha].every(sha=>typeof sha==='string'&&/^[a-f0-9]{40}$/.test(sha))||s.baseSha===s.headSha||!exact(v.finding,['id','queuedVersion','digest'])||!hash(v.finding.id)||!integer(v.finding.queuedVersion,2,9999)||![v.finding.digest,v.planDigest,v.requestDigest].every(hash))fail();
 if(v.id!==expected.id.toLowerCase()||v.reviewId!==expected.reviewId.toLowerCase()||canonical(s)!==canonical(expected.subject)||expected.operationId!==undefined&&v.operationId!==expected.operationId.toLowerCase()||expected.findingId!==undefined&&v.finding.id!==expected.findingId||expected.planDigest!==undefined&&v.planDigest!==expected.planDigest||expected.requestDigest!==undefined&&v.requestDigest!==expected.requestDigest||expected.queuedVersion!==undefined&&v.finding.queuedVersion!==expected.queuedVersion||expected.queuedFindingDigest!==undefined&&v.finding.digest!==expected.queuedFindingDigest)fail();
}
/** Integrity and expected identity only. Authenticate the service and retained
 * evidence writers separately; neither a digest nor acknowledgement proves execution. */
export function validateFindingReproductionAccepted(value:unknown,expected:ExpectedReproductionIdentity):FindingReproductionAccepted{
 try{bounded(value);if(!exact(value,referenceKeys))fail();reference(value as FindingReproductionAccepted,expected);return structuredClone(value) as FindingReproductionAccepted;}catch{return fail();}
}
export function validateFindingReproductionCancellation(value:unknown,id:string):FindingReproductionCancellation{
 try{bounded(value);const v=value as FindingReproductionCancellation;if(!exact(v,['schemaVersion','id','cancelRequested'])||v.schemaVersion!=='v1alpha1'||!uuid(v.id)||v.id!==id.toLowerCase()||v.cancelRequested!==true)fail();return structuredClone(v);}catch{return fail();}
}
export function validateFindingReproductionStatus(value:unknown,expected:ExpectedReproductionIdentity):FindingReproductionStatus{
 try{
  bounded(value);const v=value as FindingReproductionStatus;if(!exact(v,[...referenceKeys,'dispatch','receipt','nonExecution','settlement']))fail();reference(v,expected);
  const d=v.dispatch;if(!exact(d,['state','cancelRequested','cancellationCause'])||!['queued','bound','dispatched','settled'].includes(d.state)||typeof d.cancelRequested!=='boolean'||d.cancellationCause!==null&&(!d.cancelRequested||!['user','revoked','expired','permission-denied','superseded','unavailable'].includes(d.cancellationCause)))fail();
  const identity={id:v.finding.id,subject:v.subject};
  if(v.receipt!==null){if(!exact(v.receipt,['value','digest'])||v.receipt.digest!==digest(canonical(v.receipt.value))||d.state==='queued')fail();validateFindingActionReceipt({type:'reproduce',receiptId:v.id},v.receipt.value,identity);}
  if(v.nonExecution!==null){if(v.receipt!==null||!exact(v.nonExecution,['value','digest'])||v.nonExecution.digest!==digest(canonical(v.nonExecution.value)))fail();const p=validateNonExecutionProof(v.nonExecution.value,identity);if(p.id!==nameUuid(v.id,'agentci:non-execution:v1')||p.planId!==v.id||p.planDigest!==v.planDigest||p.reservationOperationId!==v.operationId||p.queuedVersion!==v.finding.queuedVersion||p.queuedFindingDigest!==v.finding.digest||p.reason==='cancelled'&&!d.cancelRequested)fail();}
  if((d.state==='settled')!==(v.settlement!==null))fail();
  if(v.settlement!==null){const s=v.settlement;if(!exact(s,['kind','findingVersion','historyDigest','evidenceDigest','retainedReceiptDigest','retainedProofDigest'])||!['receipt-retained','never-staged','superseded'].includes(s.kind)||!integer(s.findingVersion,v.finding.queuedVersion+1,10000)||![s.historyDigest,s.evidenceDigest].every(hash)||s.retainedReceiptDigest!==(v.receipt?.digest??null)||s.retainedProofDigest!==(v.nonExecution?.digest??null)||s.kind==='receipt-retained'&&!v.receipt||s.kind==='never-staged'&&!v.nonExecution)fail();if(s.kind==='receipt-retained'&&s.evidenceDigest!==v.receipt!.digest||s.kind==='never-staged'&&s.evidenceDigest!==v.nonExecution!.digest)fail();}
  return structuredClone(v);
 }catch{return fail();}
}

export interface FindingReproductionRequest extends ReproductionSelector {schemaVersion:'v1alpha1';reviewId:string}
/** Public selection only; execution details remain in operator-owned approved plans. */
export function validateFindingReproductionRequest(value:unknown):FindingReproductionRequest {
 try {bounded(value);if(!exact(value,['schemaVersion','reviewId','subject','expectedVersion','operationId','approvalId','approvalDigest']))fail();
 const v=value as FindingReproductionRequest;if(v.schemaVersion!=='v1alpha1'||![v.reviewId,v.operationId,v.approvalId].every(uuid)||!hash(v.approvalDigest)||!integer(v.expectedVersion,1,9998))fail();
 validateReviewAdmission({schemaVersion:'v1alpha1',id:v.reviewId,subject:v.subject,profile:{id:'subject-validation',revision:v.approvalDigest},mode:'synthetic'});
 if(Buffer.byteLength(canonical(value))>4096)fail();return structuredClone(v);
 }catch{return fail();}
}
