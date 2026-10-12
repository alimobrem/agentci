import {randomUUID} from 'node:crypto';
export function ownedCustomerReservation(review,approval,{canonical,digest}){
 const request={schemaVersion:'v1alpha1',reviewId:review.admission.id,subject:review.admission.subject,expectedVersion:review.current.version,operationId:randomUUID(),approvalId:approval.plan.id,approvalDigest:digest(canonical(approval.plan))};const {schemaVersion,reviewId,...selector}=request;
 const reference={schemaVersion,id:approval.plan.id,operationId:request.operationId,reviewId,subject:request.subject,finding:{id:review.current.id,queuedVersion:review.current.version+1,digest:digest(canonical(approval.plan.finding))},planDigest:request.approvalDigest,requestDigest:digest(canonical(selector))};
 return {review,request,reference,acknowledged:false,absentAfterControllerDrain:false};
}
export async function reserveOwnedCustomerIntent(client,intent,production,record=async()=>{}){
 // Publish the exact operation/approval expectation before any ambiguous network write.
 await record(intent);const reference=await client.reserveReproduction(intent.review.admission,intent.review.current.id,intent.request);
 if(production.canonical(reference)!==production.canonical(intent.reference))throw Error('Owned reservation acknowledgement identity mismatch');intent.acknowledged=true;await record(intent);return reference;
}
export async function reconcileCustomerReservation(client,intent){const status=await client.reproductionStatus(intent.review.admission,intent.reference);intent.acknowledged=true;intent.recoveredAcknowledgement=true;return status;}
