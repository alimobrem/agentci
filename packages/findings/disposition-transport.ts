import {canonical,digest} from '../review/engine.ts';
import {validateReviewAdmission} from '../reviewers/admission.ts';
import type {ReviewSubject} from '../reviewers/context.ts';
import {nameUuid} from '../evals/request-id.ts';
import {validateFindingActionReceipt,type FindingReceipt} from './lifecycle.ts';
export interface FindingDispositionRequest {schemaVersion:'v1alpha1';reviewId:string;subject:ReviewSubject;expectedVersion:number;operationId:string;disposition:'false-positive'|'resolved';reason:string;evidenceDigest:string}
export class InvalidFindingDisposition extends Error {constructor(){super('invalid-finding-disposition');}}
const fail=():never=>{throw new InvalidFindingDisposition();};
export function validateFindingDispositionRequest(value:unknown):FindingDispositionRequest {
 try{const v=value as FindingDispositionRequest;if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join(',')!=='disposition,evidenceDigest,expectedVersion,operationId,reason,reviewId,schemaVersion,subject'||v.schemaVersion!=='v1alpha1'||!['false-positive','resolved'].includes(v.disposition)||!Number.isSafeInteger(v.expectedVersion)||v.expectedVersion<1||v.expectedVersion>=10000||![v.reviewId,v.operationId].every(id=>typeof id==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id))||typeof v.evidenceDigest!=='string'||!/^sha256:[a-f0-9]{64}$/.test(v.evidenceDigest)||typeof v.reason!=='string'||!v.reason.trim()||Buffer.byteLength(v.reason)>4096||Buffer.byteLength(canonical(v))>8192)fail();
  const admission=validateReviewAdmission({schemaVersion:'v1alpha1',id:v.reviewId,subject:v.subject,profile:{id:'disposition-subject',revision:v.evidenceDigest},mode:'synthetic'});if(canonical(admission.subject)!==canonical(v.subject))fail();return structuredClone(v);
 }catch{return fail();}
}
/** Only an authenticated operator writer may persist this attestation. A digest is not authority. */
export function operatorDispositionReceipt(request:FindingDispositionRequest,findingId:string):FindingReceipt {
 const v=validateFindingDispositionRequest(request),receipt:FindingReceipt={findingId,subjectDigest:digest(canonical(v.subject)),assertionDigest:null,evidenceDigest:v.evidenceDigest,actor:'operator',outcome:v.disposition,reason:v.reason};
 validateFindingActionReceipt({type:v.disposition==='resolved'?'resolve':'false-positive',receiptId:operatorDispositionReceiptId(v.operationId)},receipt,{id:findingId,subject:v.subject});return receipt;
}
export function operatorDispositionReceiptId(operationId:string){return nameUuid(operationId,'agentci:operator-disposition:v1');}
