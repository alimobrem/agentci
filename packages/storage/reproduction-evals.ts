import type {Pool,PoolClient} from 'pg';import {randomUUID} from 'node:crypto';
import {canonical,digest} from '../review/engine.ts';import type {Snapshot} from '../review/types.ts';
import {projectEvalInputs} from '../evals/runner.ts';import {validateReproductionEvalSource,type ReproductionEvalSource} from '../evals/source.ts';
import {compileFindingReproduction,type ReproductionPlan} from '../findings/reproduction.ts';import type {ReproductionApprovalRegistry} from '../findings/approval-registry.ts';
import {EvalStore,definition,validateInputs} from './evals.ts';import {ReproductionReservations} from './reproduction-reservations.ts';
const fail=():never=>{throw Error('reproduction-eval-conflict');};
export interface ReproductionEvalRecovery {id:string;source:ReproductionEvalSource;unitIds:string[];completedUnitIds:string[];subject:{repository:string;pullRequest:number;baseSha:string;headSha:string}}
/** Controller-only staging. Evaluation continues through the unchanged restricted
 * EvalStore unit/lease/trial methods; no provider or App credential enters a job. */
export class ReproductionEvalStore {
 private evals:EvalStore;private reservations:ReproductionReservations;private scope:{organizationId:string;repository:string};
 constructor(private pool:Pool,scope:{organizationId:string;repository:string},registry:ReproductionApprovalRegistry){this.scope={...scope};this.evals=new EvalStore(pool,scope.organizationId,scope.repository);this.reservations=new ReproductionReservations(pool,scope,registry);}
 private key(id:string){if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id))fail();return [this.scope.organizationId,this.scope.repository,id];}
 async ready(){await this.evals.ready();await this.pool.query('SELECT source,source_payload_canonical FROM agentci_eval_jobs LIMIT 0');}
 private async authority(c:Pool|PoolClient,id:string){
  const r=(await c.query('SELECT p.plan,p.digest,o.operation_id,o.request,o.request_digest,o.result,o.result_digest,o.finding_id FROM agentci_reproduction_plans p JOIN agentci_reproduction_operations o ON o.organization_id=p.organization_id AND o.repository=p.repository AND o.reproduction_id=p.id WHERE p.organization_id=$1 AND p.repository=$2 AND p.id=$3',this.key(id))).rows[0];
  if(!r||r.digest!==digest(canonical(r.plan))||r.request_digest!==digest(canonical(r.request))||r.result_digest!==digest(canonical(r.result))||r.result.planDigest!==r.digest||r.result.reproductionId!==id||r.result.operationId!==r.operation_id||r.result.findingId!==r.finding_id)fail();return r!;
 }
 async stage(id:string,base:Snapshot,head:Snapshot){
  await this.ready();const retained=await this.authority(this.pool,id);
  const reservation=await this.reservations.reserve(retained.finding_id,retained.request);
  const plan=retained.plan as ReproductionPlan;
  if(canonical(compileFindingReproduction(plan.finding,plan.approval,base,head,plan.runner,plan.limits))!==canonical(plan)||reservation.planDigest!==retained.digest)fail();
  const def=definition(plan.definition),b=projectEvalInputs(base),h=projectEvalInputs(head),inputs={base:{snapshot:b.snapshot,omitted:b.omitted},head:{snapshot:h.snapshot,omitted:h.omitted}};validateInputs(inputs);
  const source:ReproductionEvalSource={schemaVersion:'v1alpha1',kind:'finding-reproduction',organizationId:this.scope.organizationId,admissionId:plan.approval.reviewId,operationId:retained.operation_id,planId:id,planDigest:retained.digest,requestDigest:retained.request_digest,inputDigests:plan.inputs,definitionDigest:digest(canonical(def))};
  const storedPlan={units:[def],suiteChanges:[],coverageGaps:[],selectionGaps:[]},payload={source,attemptKey:id,repository:this.scope.repository,pullRequest:plan.finding.subject.pullRequest,inputs,plan:storedPlan},hash=digest(canonical(payload));
  const c=await this.pool.connect();let broken=false;const lost=()=>{broken=true;};c.on('error',lost);
  try{
   await c.query('BEGIN');await c.query("SET LOCAL statement_timeout='10s'");await c.query("SET LOCAL lock_timeout='5s'");await c.query("SET LOCAL transaction_timeout='15s'");
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[canonical([...this.key(id),'eval-stage'])]);
   if((await c.query('SELECT 1 FROM agentci_reproduction_cancellations WHERE organization_id=$1 AND repository=$2 AND id=$3',this.key(id))).rowCount)fail();
   const again=await this.authority(c,id);if(canonical(again)!==canonical(retained))fail();
   const prior=(await c.query('SELECT id,digest,source FROM agentci_eval_jobs WHERE source_organization_id=$1 AND repository=$2 AND source_operation_id=$3',[this.scope.organizationId,this.scope.repository,retained.operation_id])).rows[0];
   if(prior){if(prior.digest!==hash||canonical(prior.source)!==canonical(source))fail();}
   else{
    const jobId=randomUUID();await c.query('INSERT INTO agentci_eval_jobs(id,review_id,attempt_key,repository,pull_request,base_sha,head_sha,digest,inputs,plan,source,source_base_canonical,source_head_canonical,source_definition_canonical,source_payload_canonical) VALUES($1,NULL,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',[jobId,id,this.scope.repository,plan.finding.subject.pullRequest,base.sha,head.sha,hash,inputs,storedPlan,source,canonical(b.snapshot.files),canonical(h.snapshot.files),canonical(def),canonical(payload)]);
    await c.query('INSERT INTO agentci_eval_units(id,job_id,suite_id,model_key,side,definition,digest) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),jobId,def.suite.metadata.id,'',def.side,def,source.definitionDigest]);
   }
   await c.query('COMMIT');
  }catch(e){try{await c.query('ROLLBACK');}catch{broken=true;}if(e instanceof Error&&e.message==='reproduction-eval-conflict')throw e;throw Error('reproduction-eval-unavailable');}finally{c.release(broken);c.off('error',lost);}
  const recovery=await this.recoveryPlan(id);if(!recovery)fail();
  // Cancellation can commit while the staging transaction is still invisible.
  if((await this.pool.query('SELECT 1 FROM agentci_reproduction_cancellations WHERE organization_id=$1 AND repository=$2 AND id=$3',this.key(id))).rowCount){await this.evals.cancel(recovery!.id);fail();}
  return {jobId:recovery!.id,unitId:recovery!.unitIds[0]!};
 }
 async recoveryPlan(id:string):Promise<ReproductionEvalRecovery|undefined>{
  await this.ready();const authority=await this.authority(this.pool,id);
  const row=(await this.pool.query('SELECT * FROM agentci_eval_jobs WHERE source_organization_id=$1 AND repository=$2 AND source_operation_id=$3',[this.scope.organizationId,this.scope.repository,authority.operation_id])).rows[0];if(!row)return undefined;
  const source=validateReproductionEvalSource(row.source),plan=authority.plan as ReproductionPlan;
  if(source.planId!==id||source.admissionId!==plan.approval.reviewId||source.operationId!==authority.operation_id||source.planDigest!==authority.digest||source.requestDigest!==authority.request_digest||source.organizationId!==this.scope.organizationId||row.review_id!==null||row.attempt_key!==id||row.base_sha!==plan.finding.subject.baseSha||row.head_sha!==plan.finding.subject.headSha||row.pull_request!==plan.finding.subject.pullRequest||row.repository!==this.scope.repository||canonical(source.inputDigests)!==canonical(plan.inputs)||source.definitionDigest!==digest(canonical(plan.definition)))fail();
  const rows=(await this.pool.query('SELECT id FROM agentci_eval_units WHERE job_id=$1',[row.id])).rows;if(rows.length!==1)fail();const unit=await this.evals.unit(rows[0].id);if(!unit||unit.jobId!==row.id||canonical(unit.definition)!==canonical(plan.definition)||canonical(compileFindingReproduction(plan.finding,plan.approval,unit.inputs.base.snapshot,unit.inputs.head.snapshot,plan.runner,plan.limits))!==canonical(plan))fail();
  return {id:row.id,source,unitIds:[unit!.id],completedUnitIds:unit!.status==='completed'?[unit!.id]:[],subject:{repository:row.repository,pullRequest:row.pull_request,baseSha:row.base_sha,headSha:row.head_sha}};
 }
}
