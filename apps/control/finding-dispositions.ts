import type {Pool,PoolClient} from 'pg';
import {canonical} from '../../packages/review/engine.ts';
import {nameUuid} from '../../packages/evals/request-id.ts';
import {validateFindingDispositionRequest,type FindingDispositionRequest,operatorDispositionReceiptId} from '../../packages/findings/disposition-transport.ts';
import {FindingHistoryStore,FindingHistoryConflict} from '../../packages/storage/finding-history.ts';
import {OperatorReceipts,OperatorReceiptConflict} from '../../packages/storage/operator-receipts.ts';
import {ModelReviewReads} from '../../packages/storage/model-review-reads.ts';
export class FindingDispositionFailure extends Error {constructor(readonly status:number,readonly code:string){super(code);}}
const fail=(status:number,code:string):never=>{throw new FindingDispositionFailure(status,code);};
/** Called only after scoped operator authentication; receipt/event share one commit. */
export function createFindingDispositions(pool:Pool,scope:{organizationId:string;repository:string}){
 const target={...scope},receipts=new OperatorReceipts(target);
 return async(findingId:string,input:FindingDispositionRequest)=>{
  const request=validateFindingDispositionRequest(input);if(!/^sha256:[a-f0-9]{64}$/.test(findingId))fail(400,'invalid-request');
  if(request.subject.organizationId!==target.organizationId||request.subject.repository!==target.repository)fail(404,'not-found');
  const c=await pool.connect();let broken=false;
  try{
   await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'");await c.query("SET LOCAL statement_timeout='10s'");await c.query("SET LOCAL transaction_timeout='15s'");const deadline=Date.now()+10000;
   const bounded={query:async(text:string,values?:unknown[])=>{const remaining=deadline-Date.now();if(remaining<=0)fail(503,'service-unavailable');await c.query("SELECT set_config('statement_timeout',$1,true)",[`${remaining}ms`]);return c.query(text,values);}} as PoolClient;
   const key=[target.organizationId,target.repository];
   await bounded.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[canonical([...key,'reproduction-operation',request.operationId])]);
   await bounded.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[canonical([...key,findingId])]);
   const review=await new ModelReviewReads(bounded,target).status(request.reviewId);
   if(!review||canonical(review.admission.request.subject)!==canonical(request.subject))fail(404,'not-found');
   const history=new FindingHistoryStore(pool,target,{reviewer:async()=>{throw Error('Disposition cannot ingest reviewer claims');},receipt:(id,subject)=>receipts.read(bounded,id,subject,request)}),records=await history.getInTransaction(bounded,findingId,request.subject);
   const associated=records.find(r=>r.event.operationId===nameUuid(request.reviewId,`agentci:review-finding:v1:${findingId}`));
   if(!associated||review!.summary&&!review!.summary.summary.findings.some(f=>f.id===findingId&&f.digest===associated.digest))fail(404,'not-found');
   const existing=records.find(r=>r.event.operationId===request.operationId),action={type:request.disposition==='resolved'?'resolve' as const:'false-positive' as const,receiptId:operatorDispositionReceiptId(request.operationId)};
   if(existing&&(existing.event.action.type!==action.type||!('receiptId' in existing.event.action)||existing.event.action.receiptId!==action.receiptId))fail(409,'idempotency-conflict');
   if(!existing&&records.at(-1)?.event.finding.version!==request.expectedVersion)fail(409,'version-conflict');
   await receipts.retain(bounded,findingId,request);
   // Exact replay must authenticate history against its retained trusted receipt.
   if(existing)await receipts.read(bounded,action.receiptId,request.subject,request);
   const result=await history.transitionInTransaction(bounded,findingId,request.subject,action,request.expectedVersion,request.operationId);
   if(Date.now()>deadline)fail(503,'service-unavailable');await c.query('COMMIT');return result;
  }catch(error){
   try{await c.query('ROLLBACK');}catch{broken=true;}
   if(error instanceof FindingDispositionFailure)throw error;
   if(error instanceof OperatorReceiptConflict)fail(409,'idempotency-conflict');
   if(error instanceof FindingHistoryConflict)fail(409,'invalid-transition');
   if(['23505','40001'].includes((error as {code?:string}).code??''))fail(409,'version-conflict');
   throw Error('finding-disposition-unavailable');
  }finally{c.release(broken);}
 };
}
