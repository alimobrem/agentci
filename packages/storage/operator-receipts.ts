import {validateFindingHistoryRecord} from '../findings/history.ts';
import type {PoolClient} from 'pg';
import {canonical,digest} from '../review/engine.ts';
import {validateFindingDispositionRequest,operatorDispositionReceipt,operatorDispositionReceiptId,type FindingDispositionRequest} from '../findings/disposition-transport.ts';
import type {ReviewSubject} from '../reviewers/context.ts';
export class OperatorReceiptConflict extends Error {constructor(){super('operator-receipt-conflict');}}
const fail=():never=>{throw new OperatorReceiptConflict();};
/** Controller-owned writer/reader. Never exposes arbitrary receipt insertion to models or readers. */
export class OperatorReceipts {
 private scope:{organizationId:string;repository:string};
 constructor(scope:{organizationId:string;repository:string}){this.scope={...scope};}
 private validate(row:any,subject:ReviewSubject){
  const request=validateFindingDispositionRequest(row.request),receipt=operatorDispositionReceipt(request,row.finding_id);
  if(request.subject.organizationId!==this.scope.organizationId||request.subject.repository!==this.scope.repository||canonical(request.subject)!==canonical(subject)||row.id!==operatorDispositionReceiptId(request.operationId)||row.operation_id!==request.operationId||row.review_id!==request.reviewId||Number(row.finding_version)!==request.expectedVersion||row.request_digest!==digest(canonical(request))||row.receipt_digest!==digest(canonical(receipt))||canonical(row.receipt)!==canonical(receipt))throw Error('operator-receipt-unavailable');
  return {request,receipt};
 }
 async read(c:PoolClient,id:string,subject:ReviewSubject,pending?:FindingDispositionRequest){
  const row=(await c.query('SELECT * FROM agentci_operator_receipts WHERE organization_id=$1 AND repository=$2 AND id=$3',[this.scope.organizationId,this.scope.repository,id])).rows[0];if(!row)throw Error('operator-receipt-unavailable');const retained=this.validate(row,subject);
  const event=(await c.query('SELECT event,digest FROM agentci_finding_events WHERE organization_id=$1 AND repository=$2 AND operation_id=$3',[this.scope.organizationId,this.scope.repository,row.operation_id])).rows[0];
  if(event){const record=validateFindingHistoryRecord(event,subject);if(record.event.operationId!==retained.request.operationId||record.event.finding.id!==row.finding_id||record.event.finding.version!==Number(row.finding_version)+1||!('receiptId' in record.event.action)||record.event.action.receiptId!==id||canonical(record.event.receipt)!==canonical(retained.receipt))throw Error('operator-receipt-unavailable');}
  else if(!pending||canonical(validateFindingDispositionRequest(pending))!==canonical(retained.request))throw Error('operator-receipt-unavailable');
  return structuredClone(retained.receipt);
 }
 async retain(c:PoolClient,findingId:string,input:FindingDispositionRequest){
  const request=validateFindingDispositionRequest(input);if(request.subject.organizationId!==this.scope.organizationId||request.subject.repository!==this.scope.repository)fail();
  const id=operatorDispositionReceiptId(request.operationId),receipt=operatorDispositionReceipt(request,findingId),prior=(await c.query('SELECT * FROM agentci_operator_receipts WHERE organization_id=$1 AND repository=$2 AND operation_id=$3',[this.scope.organizationId,this.scope.repository,request.operationId])).rows[0];
  if(prior){const retained=this.validate(prior,request.subject);if(prior.finding_id!==findingId||canonical(retained.request)!==canonical(request))fail();return {id,receipt:retained.receipt};}
  await c.query('INSERT INTO agentci_operator_receipts(organization_id,repository,id,review_id,finding_id,finding_version,operation_id,request_digest,receipt_digest,request,receipt) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[this.scope.organizationId,this.scope.repository,id,request.reviewId,findingId,request.expectedVersion,request.operationId,digest(canonical(request)),digest(canonical(receipt)),request,receipt]);return {id,receipt};
 }
}
