import type {Pool,PoolClient} from 'pg';
import {canonical,digest} from '../review/engine.ts';
import {nameUuid} from '../evals/request-id.ts';
import {validateFindingHistoryLink,type FindingHistoryRecord} from '../findings/history.ts';
import {validateFindingReproductionStatus,validateFindingReproductionCancellation,type FindingReproductionStatus} from '../findings/reproduction-transport.ts';
import {FindingReadFailure} from './finding-cursor.ts';
import {ModelReviewReads} from './model-review-reads.ts';
import {ReproductionDispatchStore} from './reproduction-dispatch.ts';
import {EvalStore} from './evals.ts';
import {reproductionReceipt} from '../findings/reproduction.ts';
const uuid=(s:string)=>/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(s);
const fail=():never=>{throw Error('reproduction-read-unavailable');};
/** Customer projection of retained evidence. No configuration, snapshots,
 * command bytes, internal workflow identity or credentials leave this reader. */
export class ReproductionReads {
 private scope:{organizationId:string;repository:string};
 constructor(private pool:Pool,scope:{organizationId:string;repository:string}){this.scope={...scope};}
 private async snapshot<T>(run:(c:PoolClient)=>Promise<T>){
  const c=await this.pool.connect();let broken=false;const deadline=Date.now()+10000;
  try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const bounded={query:async(text:string,values?:unknown[])=>{const left=deadline-Date.now();if(left<=0)fail();await c.query("SELECT set_config('statement_timeout',$1,true)",[`${left}ms`]);return c.query(text,values);}} as PoolClient;
   const result=await run(bounded);if(Date.now()>deadline)fail();await c.query('COMMIT');return result;
  }catch(e){try{await c.query('ROLLBACK');}catch{broken=true;}throw e;}finally{c.release(broken);}
 }
 async status(id:string,reviewId:string):Promise<FindingReproductionStatus|undefined>{
  if(!uuid(id)||!uuid(reviewId))throw new FindingReadFailure(400,'invalid-request');
  return this.snapshot(async c=>{
   const keys=[this.scope.organizationId,this.scope.repository,id];
   const op=(await c.query('SELECT operation_id FROM agentci_reproduction_operations WHERE organization_id=$1 AND repository=$2 AND reproduction_id=$3',keys)).rows;
   if(!op.length)return undefined;if(op.length!==1)fail();
   const retained=await new ReproductionDispatchStore(this.pool,this.scope).readRetained(c,op[0].operation_id);if(!retained)fail();
   const {dispatch,plan,request,result}=retained!,subject=plan.finding.subject;
   // Conceal other review associations even within the same repository.
   if(plan.approval.reviewId!==reviewId)return undefined;
   const review=await new ModelReviewReads(c,this.scope).status(reviewId);
   if(!review||canonical(review.admission.request.subject)!==canonical(subject))fail();
   const findingId=plan.finding.id,binding=[...keys.slice(0,2),findingId];
   const budget=(await c.query('SELECT count(*) AS count,max(version) AS version,coalesce(sum(octet_length(event::text)),0) AS bytes FROM agentci_finding_events WHERE organization_id=$1 AND repository=$2 AND finding_id=$3',binding)).rows[0];
   const through=Number(budget.version);if(through<plan.finding.version||through>10000||Number(budget.count)!==through||Number(budget.bytes)>32*1024*1024)fail();
   let prior:FindingHistoryRecord|undefined,queued:FindingHistoryRecord|undefined,association:FindingHistoryRecord|undefined,settled:FindingHistoryRecord|undefined;
   for(let next=1;next<=through;){
    const rows=(await c.query(`SELECT version,operation_id,digest,event FROM (
     SELECT version,operation_id,digest,event,sum(octet_length(event::text)) OVER(ORDER BY version) AS bytes
     FROM (SELECT version,operation_id,digest,event FROM agentci_finding_events WHERE organization_id=$1 AND repository=$2 AND finding_id=$3 AND version>=$4 AND version<=$5 ORDER BY version LIMIT 25) batch
    ) bounded WHERE bytes<=4194304 OR version=$4 ORDER BY version`,[...binding,next,through])).rows;
    if(!rows.length)fail();
    for(const row of rows){const record=await validateFindingHistoryLink({digest:row.digest,event:row.event},subject,prior);
     if(record.event.finding.id!==findingId||record.event.finding.version!==next||Number(row.version)!==next||record.event.operationId!==row.operation_id)fail();
     if(record.event.operationId===nameUuid(reviewId,`agentci:review-finding:v1:${findingId}`))association=record;
     if(next===plan.finding.version)queued=record;
     if(next===dispatch.settlement?.findingVersion)settled=record;
     prior=record;next++;
    }
   }
   if(!association||review!.summary&&!review!.summary.summary.findings.some(f=>f.id===findingId&&f.digest===association!.digest)||!queued||queued.event.operationId!==request.operationId||canonical(queued.event.finding)!==canonical(plan.finding))fail();
   const receipts=(await c.query('SELECT unit_id,digest,receipt FROM agentci_reproduction_receipts WHERE organization_id=$1 AND repository=$2 AND id=$3',keys)).rows;
   const proofs=(await c.query('SELECT id,operation_id,digest,proof FROM agentci_reproduction_non_execution WHERE organization_id=$1 AND repository=$2 AND plan_id=$3',keys)).rows;
   if(receipts.length>1||proofs.length>1||receipts.length&&proofs.length)fail();
   const receipt=receipts[0]?{value:receipts[0].receipt,digest:receipts[0].digest}:null,nonExecution=proofs[0]?{value:proofs[0].proof,digest:proofs[0].digest}:null;
   if(receipt&&(receipt.value.assertionDigest!==plan.assertionDigest||!(await c.query('SELECT 1 FROM agentci_eval_jobs j JOIN agentci_eval_units u ON u.job_id=j.id WHERE j.source_organization_id=$1 AND j.repository=$2 AND j.source_operation_id=$3 AND u.id=$4',[...keys.slice(0,2),request.operationId,receipts[0].unit_id])).rowCount))fail();
   if(receipt){const unit=await new EvalStore(this.pool,this.scope.organizationId,this.scope.repository).unit(receipts[0].unit_id,c);if(!unit||canonical(reproductionReceipt(plan,unit))!==canonical(receipt.value))fail();}
   if(nonExecution&&(proofs[0].id!==nonExecution.value.id||proofs[0].operation_id!==request.operationId))fail();
   if(nonExecution&&(await c.query('SELECT 1 FROM agentci_eval_jobs WHERE source_organization_id=$1 AND repository=$2 AND source_operation_id=$3',[...keys.slice(0,2),request.operationId])).rowCount)fail();
   let settlement:FindingReproductionStatus['settlement']=null;
   if(dispatch.settlement){const s=dispatch.settlement;if(!settled||s.findingId!==findingId||s.historyDigest!==settled.digest)fail();
    const e=settled!.event;
    if(s.kind==='receipt-retained'&&(e.action.type!=='reproduce'||e.action.receiptId!==id||e.operationId!==id||canonical(e.receipt)!==canonical(receipt?.value))||s.kind==='never-staged'&&(e.action.type!=='unavailable'||canonical(e.nonExecution)!==canonical(nonExecution?.value))||s.kind==='superseded'&&(!['resolve','false-positive'].includes(e.action.type)||e.receipt?.actor!=='operator'||s.evidenceDigest!==e.receipt.evidenceDigest))fail();
    settlement={kind:s.kind,findingVersion:s.findingVersion,historyDigest:s.historyDigest,evidenceDigest:s.evidenceDigest,retainedReceiptDigest:s.retainedReceiptDigest,retainedProofDigest:s.retainedProofDigest};
   }
   const reference={schemaVersion:'v1alpha1',id,operationId:request.operationId,reviewId,subject,finding:{id:findingId,queuedVersion:plan.finding.version,digest:digest(canonical(plan.finding))},planDigest:digest(canonical(plan)),requestDigest:result.requestDigest};
   return validateFindingReproductionStatus({...reference,dispatch:{state:settlement?'settled':dispatch.acknowledged?'dispatched':dispatch.binding?'bound':'queued',cancelRequested:dispatch.cancellation!==null,cancellationCause:dispatch.cancellation?.cause??null},receipt,nonExecution,settlement},{...reference,findingId,queuedVersion:plan.finding.version,queuedFindingDigest:reference.finding.digest});
  });
 }
 async cancel(id:string){
  if(!uuid(id))throw new FindingReadFailure(400,'invalid-request');
  const rows=(await this.pool.query('SELECT operation_id,request,result,request_digest,result_digest FROM agentci_reproduction_operations WHERE organization_id=$1 AND repository=$2 AND reproduction_id=$3',[this.scope.organizationId,this.scope.repository,id])).rows;
  if(!rows.length)return undefined;if(rows.length!==1)fail();const r=rows[0];
  if(r.request_digest!==digest(canonical(r.request))||r.result_digest!==digest(canonical(r.result))||r.request.operationId!==r.operation_id||r.result.operationId!==r.operation_id||r.result.reproductionId!==id)fail();
  // Validate full retained status before mutating; no configuration/current
  // approval read is required to stop already-reserved work after revocation.
  if(!await this.status(id,r.result.reviewId))fail();
  await new ReproductionDispatchStore(this.pool,this.scope).requestCancellation(r.operation_id,'user');
  return validateFindingReproductionCancellation({schemaVersion:'v1alpha1',id,cancelRequested:true},id);
 }
}
