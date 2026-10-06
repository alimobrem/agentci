import type {Pool,PoolClient} from 'pg';import {canonical,digest} from '../review/engine.ts';import {nameUuid} from '../evals/request-id.ts';import type {ReviewSubject} from '../reviewers/context.ts';
import {validateNonExecutionProof,type ReproductionNonExecutionProof} from '../findings/non-execution.ts';import {validateFindingHistoryLink,type FindingHistoryRecord} from '../findings/history.ts';
import {ReproductionEvalInputLimit} from './reproduction-evals.ts';
const fail=():never=>{throw Error('reproduction-non-execution-conflict');};
/** Controller-only non-execution authority. The proof never stands in for a
 * reproduction receipt and is unavailable once any evaluator job was staged. */
export class ReproductionNonExecutionStore {
 constructor(private pool:Pool,private scope:{organizationId:string;repository:string}){this.scope={...scope};}
 private key(id:string){if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id))fail();return [this.scope.organizationId,this.scope.repository,id];}
 private async authority(c:Pool|PoolClient,id:string){const r=(await c.query('SELECT p.plan,p.digest,o.operation_id,o.request,o.request_digest,o.result,o.result_digest,o.finding_id FROM agentci_reproduction_plans p JOIN agentci_reproduction_operations o ON o.organization_id=p.organization_id AND o.repository=p.repository AND o.reproduction_id=p.id WHERE p.organization_id=$1 AND p.repository=$2 AND p.id=$3',this.key(id))).rows[0];if(!r||r.digest!==digest(canonical(r.plan))||r.request_digest!==digest(canonical(r.request))||r.result_digest!==digest(canonical(r.result))||r.result.planDigest!==r.digest||r.result.operationId!==r.operation_id||r.result.findingId!==r.finding_id||r.result.reproductionId!==id||r.plan.finding.subject.organizationId!==this.scope.organizationId||r.plan.finding.subject.repository!==this.scope.repository)fail();return r;}
 async read(id:string,subject:ReviewSubject):Promise<ReproductionNonExecutionProof>{
  subject=structuredClone(subject);if(subject.organizationId!==this.scope.organizationId||subject.repository!==this.scope.repository)fail();const row=(await this.pool.query('SELECT digest,proof FROM agentci_reproduction_non_execution WHERE organization_id=$1 AND repository=$2 AND id=$3',this.key(id))).rows[0];if(!row||row.digest!==digest(canonical(row.proof)))fail();const a=await this.authority(this.pool,row.proof.planId);if(canonical(a.plan.finding.subject)!==canonical(subject))fail();const p=validateNonExecutionProof(row.proof,a.plan.finding);
  if(p.planDigest!==a.digest||p.reservationOperationId!==a.operation_id||p.queuedFindingDigest!==digest(canonical(a.plan.finding))||p.queuedVersion!==a.plan.finding.version||p.id!==nameUuid(p.planId,'agentci:non-execution:v1'))fail();
  if((await this.pool.query('SELECT 1 FROM agentci_eval_jobs WHERE source_organization_id=$1 AND repository=$2 AND source_operation_id=$3',[this.scope.organizationId,this.scope.repository,a.operation_id])).rowCount||(await this.pool.query('SELECT 1 FROM agentci_reproduction_receipts WHERE organization_id=$1 AND repository=$2 AND id=$3',this.key(p.planId))).rowCount)fail();return p;
 }
 async cancelled(planId:string){return this.retain(planId,'cancelled');}
 async inputLimit(planId:string,error:unknown){if(!(error instanceof ReproductionEvalInputLimit))fail();return this.retain(planId,'input-limit');}
 private async retain(id:string,reason:'cancelled'|'input-limit'){
  const c=await this.pool.connect();let broken=false;const lost=()=>{broken=true;};c.on('error',lost);try{
   await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'");await c.query("SET LOCAL statement_timeout='10s'");await c.query("SET LOCAL transaction_timeout='15s'");
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[canonical([...this.key(id),'eval-stage'])]);const a=await this.authority(c,id);
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[canonical([this.scope.organizationId,this.scope.repository,a.finding_id])]);
   const proof:ReproductionNonExecutionProof={schemaVersion:'v1alpha1',kind:'reproduction-not-started',id:nameUuid(id,'agentci:non-execution:v1'),...this.scope,findingId:a.finding_id,subjectDigest:digest(canonical(a.plan.finding.subject)),queuedVersion:a.plan.finding.version,queuedFindingDigest:digest(canonical(a.plan.finding)),planId:id,planDigest:a.digest,reservationOperationId:a.operation_id,status:reason==='cancelled'?'cancelled':'unavailable',reason,executionReceipt:null,verified:false};
   const prior=(await c.query('SELECT digest,proof FROM agentci_reproduction_non_execution WHERE organization_id=$1 AND repository=$2 AND id=$3',this.key(proof.id))).rows[0];
   if(prior){if(prior.digest!==digest(canonical(proof))||canonical(prior.proof)!==canonical(proof))fail();await c.query('COMMIT');return proof;}
   const budget=(await c.query('SELECT count(*) AS count,coalesce(sum(octet_length(event::text)),0) AS bytes FROM agentci_finding_events WHERE organization_id=$1 AND repository=$2 AND finding_id=$3',[this.scope.organizationId,this.scope.repository,a.finding_id])).rows[0];if(Number(budget.count)>10000||Number(budget.bytes)>32*1024*1024)fail();
   let previous:FindingHistoryRecord|undefined;const rows=(await c.query('SELECT digest,event FROM agentci_finding_events WHERE organization_id=$1 AND repository=$2 AND finding_id=$3 ORDER BY version LIMIT 10001',[this.scope.organizationId,this.scope.repository,a.finding_id])).rows;if(rows.length>10000)fail();
   for(const row of rows)previous=await validateFindingHistoryLink(row,a.plan.finding.subject,previous);if(!previous||canonical(previous.event.finding)!==canonical(a.plan.finding))fail();
   await c.query('INSERT INTO agentci_reproduction_non_execution(organization_id,repository,id,plan_id,operation_id,digest,proof) VALUES($1,$2,$3,$4,$5,$6,$7)',[...this.key(proof.id),id,a.operation_id,digest(canonical(proof)),proof]);await c.query('COMMIT');return proof;
  }catch(e){try{await c.query('ROLLBACK');}catch{broken=true;}if((e as Error)?.message==='reproduction-non-execution-conflict')throw e;throw Error('reproduction-non-execution-unavailable');}finally{c.release(broken);c.off('error',lost);}
 }
}
