import {canonical,digest} from '../review/engine.ts';import {validateModelFinding,type ModelFinding} from './model.ts';
export interface ReproductionNonExecutionProof {
 schemaVersion:'v1alpha1';kind:'reproduction-not-started';id:string;organizationId:string;repository:string;
 findingId:string;subjectDigest:string;queuedVersion:number;queuedFindingDigest:string;planId:string;planDigest:string;reservationOperationId:string;
 status:'cancelled'|'unavailable';reason:'cancelled'|'input-limit';executionReceipt:null;verified:false;
}
export interface UnavailableFindingAction {type:'unavailable';proofId:string}
export function validateNonExecutionProof(value:unknown,finding:Pick<ModelFinding,'id'|'subject'>):ReproductionNonExecutionProof {
 const p=value as ReproductionNonExecutionProof,uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v),hash=(v:unknown)=>typeof v==='string'&&/^sha256:[a-f0-9]{64}$/.test(v);
 if(!p||Object.keys(p).sort().join(',')!=='executionReceipt,findingId,id,kind,organizationId,planDigest,planId,queuedFindingDigest,queuedVersion,reason,repository,reservationOperationId,schemaVersion,status,subjectDigest,verified'||p.schemaVersion!=='v1alpha1'||p.kind!=='reproduction-not-started'||![p.id,p.organizationId,p.planId,p.reservationOperationId].every(uuid)||![p.findingId,p.subjectDigest,p.planDigest,p.queuedFindingDigest].every(hash)||p.organizationId!==finding.subject.organizationId||p.repository!==finding.subject.repository||p.findingId!==finding.id||p.subjectDigest!==digest(canonical(finding.subject))||!Number.isSafeInteger(p.queuedVersion)||p.queuedVersion<2||p.queuedVersion>9999||p.executionReceipt!==null||p.verified!==false||!['cancelled','input-limit'].includes(p.reason)||p.status!==(p.reason==='cancelled'?'cancelled':'unavailable'))throw Error('invalid-non-execution-proof');return structuredClone(p);
}
export function applyNonExecution(value:ModelFinding,action:UnavailableFindingAction,proof:ReproductionNonExecutionProof,expectedVersion:number){
 const before=validateModelFinding(value,value.subject),p=validateNonExecutionProof(proof,before);
 if(!action||Object.keys(action).sort().join(',')!=='proofId,type'||action.type!=='unavailable'||action.proofId!==p.id||before.state!=='reproduction-pending'||before.version!==expectedVersion||p.queuedVersion!==before.version||p.queuedFindingDigest!==digest(canonical(before)))throw Error('invalid-non-execution-transition');
 return validateModelFinding({...before,version:before.version+1,state:'unconfirmed',disposition:{kind:'reproduction',outcome:'error',evidenceDigest:digest(canonical(p)),reason:p.status==='cancelled'?'Cancelled before execution; unverified.':'Input resource limit prevented execution; unverified.'}},before.subject);
}
