import type {ReproductionEvalStore} from './reproduction-evals.ts';
import type {Pool,PoolClient} from 'pg';
import {canonical,digest} from '../review/engine.ts';
import type {Snapshot} from '../review/types.ts';
import type {ReviewSubject} from '../reviewers/context.ts';
import {validateModelFinding} from '../findings/model.ts';
import {compileFindingReproduction,reproductionReceipt,verifyReproductionUnit,type ReproductionPlan} from '../findings/reproduction.ts';
import type {FindingReceipt} from '../findings/lifecycle.ts';
import {FindingHistoryStore} from './finding-history.ts';
import {EvalStore} from './evals.ts';
export class FindingReproductionConflict extends Error {constructor(){super('finding-reproduction-conflict');}}
export class FindingReproductionUnavailable extends Error {constructor(){super('finding-reproduction-unavailable');}}
const uuid=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const fail=():never=>{throw new FindingReproductionConflict();};
/** Controller-owned authorization must bind the ENTIRE plan, including assertion
 * bytes, source digests, resource limits and finding version. Never return a
 * caller/model-supplied plan from this reader. Evaluator SQL grants stay unchanged. */
export interface ReproductionAuthorizer {approvedPlan(id:string,subject:ReviewSubject):Promise<ReproductionPlan>}
export class FindingReproductionStore {
 private readonly scope:{organizationId:string;repository:string};
 constructor(private readonly pool:Pool,scope:{organizationId:string;repository:string},private readonly history:FindingHistoryStore,private readonly evals:EvalStore,private readonly authorizer:ReproductionAuthorizer,private readonly admittedEvals?:ReproductionEvalStore){
  if(!uuid(scope.organizationId)||scope.repository!==evals.repository||scope.organizationId!==evals.organizationId)fail();this.scope={...scope};
 }
 private subject(subject:ReviewSubject){if(subject.organizationId!==this.scope.organizationId||subject.repository!==this.scope.repository)fail();}
 private async transaction<T>(run:(client:PoolClient)=>Promise<T>):Promise<T>{
  let client:PoolClient;try{client=await this.pool.connect();}catch{throw new FindingReproductionUnavailable();}
  let broken=false;try{await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='10s'");const result=await run(client);await client.query('COMMIT');return result;}
  catch(error){try{await client.query('ROLLBACK');}catch{broken=true;}if(error instanceof FindingReproductionConflict)throw error;if(['23505','40001'].includes((error as {code?:string})?.code??''))fail();throw new FindingReproductionUnavailable();}
  finally{client.release(broken);}
 }
 private decode(row:any):ReproductionPlan{
  try{const plan=row.plan as ReproductionPlan;if(!plan||plan.schemaVersion!=='v1alpha1'||!uuid(plan.id)||row.id!==plan.id||row.finding_id!==plan.finding.id||row.finding_version!==plan.finding.version||row.digest!==digest(canonical(plan))||Buffer.byteLength(canonical(plan))>4*1024*1024)fail();this.subject(plan.finding.subject);validateModelFinding(plan.finding,plan.finding.subject);return structuredClone(plan);}catch{return fail();}
 }
 async get(id:string):Promise<ReproductionPlan|undefined>{
  if(!uuid(id))fail();return this.transaction(async client=>{const row=(await client.query('SELECT * FROM agentci_reproduction_plans WHERE organization_id=$1 AND repository=$2 AND id=$3',[this.scope.organizationId,this.scope.repository,id])).rows[0];return row?this.decode(row):undefined;});
 }
 async reserve(value:ReproductionPlan,base:Snapshot,head:Snapshot):Promise<ReproductionPlan>{
  let plan:ReproductionPlan;try{plan=compileFindingReproduction(value.finding,value.approval,base,head,value.runner,value.limits);if(canonical(plan)!==canonical(value))fail();this.subject(plan.finding.subject);}catch{fail();}
  let approved:ReproductionPlan;try{approved=await this.authorizer.approvedPlan(plan!.id,structuredClone(plan!.finding.subject));}catch{throw new FindingReproductionUnavailable();}
  if(canonical(approved)!==canonical(plan!))fail();
  const hash=digest(canonical(plan!));
  return this.transaction(async client=>{
   await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[canonical([this.scope.organizationId,this.scope.repository,plan!.finding.id])]);
   const prior=(await client.query('SELECT * FROM agentci_reproduction_plans WHERE organization_id=$1 AND repository=$2 AND id=$3',[this.scope.organizationId,this.scope.repository,plan!.id])).rows[0];
   if(prior){if(prior.digest!==hash)fail();return this.decode(prior);}
   const current=(await client.query('SELECT digest,event FROM agentci_finding_events WHERE organization_id=$1 AND repository=$2 AND finding_id=$3 ORDER BY version DESC LIMIT 1',[this.scope.organizationId,this.scope.repository,plan!.finding.id])).rows[0];
   if(!current||current.digest!==digest(canonical(current.event))||canonical(current.event.finding)!==canonical(plan!.finding))fail();
   const count=Number((await client.query('SELECT count(*) AS count FROM agentci_reproduction_plans WHERE organization_id=$1 AND repository=$2 AND finding_id=$3',[this.scope.organizationId,this.scope.repository,plan!.finding.id])).rows[0].count);
   if(count>=plan!.limits.maxAttempts)fail();
   await client.query('INSERT INTO agentci_reproduction_plans(organization_id,repository,id,finding_id,finding_version,digest,plan) VALUES($1,$2,$3,$4,$5,$6,$7)',[this.scope.organizationId,this.scope.repository,plan!.id,plan!.finding.id,plan!.finding.version,hash,plan!]);
   return plan!;
  });
 }
 private async recovery(id:string){
  if(!this.admittedEvals)return this.evals.recoveryPlan(id);
  const r=await this.admittedEvals.recoveryPlan(id);return r?{...r,reviewId:r.source.admissionId}:undefined;
 }
 private async staged(plan:ReproductionPlan){
  const job=await this.recovery(plan.id);if(!job||job.unitIds.length!==1||job.reviewId!==plan.approval.reviewId||canonical(job.subject)!==canonical({repository:plan.finding.subject.repository,pullRequest:plan.finding.subject.pullRequest,baseSha:plan.finding.subject.baseSha,headSha:plan.finding.subject.headSha}))fail();
  const unit=await this.evals.unit(job!.unitIds[0]!);if(!unit||unit.jobId!==job!.id)fail();
  try{verifyReproductionUnit(plan,unit!);}catch{fail();}return {job:job!,unit:unit!};
 }
 private async cancelled(id:string):Promise<boolean>{
  return this.transaction(async client=>(await client.query('SELECT 1 FROM agentci_reproduction_cancellations WHERE organization_id=$1 AND repository=$2 AND id=$3',[this.scope.organizationId,this.scope.repository,id])).rowCount===1);
 }
 async stage(id:string,base:Snapshot,head:Snapshot){
  const plan=await this.get(id);if(!plan)fail();
  try{if(canonical(compileFindingReproduction(plan!.finding,plan!.approval,base,head,plan!.runner,plan!.limits))!==canonical(plan))fail();}catch{fail();}
  if(await this.cancelled(id))fail();
  if(!await this.recovery(id)){
   const history=await this.history.get(plan!.finding.id,plan!.finding.subject);
   if(canonical(history.at(-1)?.event.finding)!==canonical(plan!.finding))fail();
   if(this.admittedEvals)await this.admittedEvals.stage(id,base,head);
   else await this.evals.stage(plan!.approval.reviewId,id,base,head,[plan!.definition],{suiteChanges:[],coverageGaps:[],selectionGaps:[]});
  }
  const {job,unit}=await this.staged(plan!);
  // A cancellation may commit while the immutable eval job is being staged.
  // No unit identifier escapes this method until the second fence is checked.
  if(await this.cancelled(id)){await this.evals.cancel(job.id);fail();}
  return {jobId:job.id,unitId:unit.id};
 }
 async readReceipt(id:string,subject:ReviewSubject):Promise<FindingReceipt>{
  this.subject(subject);const plan=await this.get(id);if(!plan||canonical(plan.finding.subject)!==canonical(subject))fail();
  const {unit}=await this.staged(plan!);let expected:FindingReceipt;try{expected=reproductionReceipt(plan!,unit);}catch{fail();}
  return this.transaction(async client=>{const row=(await client.query('SELECT unit_id,digest,receipt FROM agentci_reproduction_receipts WHERE organization_id=$1 AND repository=$2 AND id=$3',[this.scope.organizationId,this.scope.repository,id])).rows[0];
   if(!row||row.unit_id!==unit.id||row.digest!==digest(canonical(row.receipt))||canonical(row.receipt)!==canonical(expected!))fail();return structuredClone(row.receipt);});
 }
 async finalize(id:string){
  const plan=await this.get(id);if(!plan)fail();const {unit}=await this.staged(plan!);let receipt:FindingReceipt;try{receipt=reproductionReceipt(plan!,unit);}catch{fail();}
  await this.transaction(async client=>{
   const hash=digest(canonical(receipt!));
   await client.query('INSERT INTO agentci_reproduction_receipts(organization_id,repository,id,unit_id,digest,receipt) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(organization_id,repository,id) DO NOTHING',[this.scope.organizationId,this.scope.repository,id,unit.id,hash,receipt!]);
   const row=(await client.query('SELECT unit_id,digest,receipt FROM agentci_reproduction_receipts WHERE organization_id=$1 AND repository=$2 AND id=$3',[this.scope.organizationId,this.scope.repository,id])).rows[0];
   if(!row||row.unit_id!==unit.id||row.digest!==hash||canonical(row.receipt)!==canonical(receipt!))fail();
  });
  // Receipt commit precedes transition: a crash between them is safely retryable.
  return this.history.transition(plan!.finding.id,plan!.finding.subject,{type:'reproduce',receiptId:id},plan!.finding.version,id);
 }
 async cancel(id:string){
  const plan=await this.get(id);if(!plan)fail();
  await this.transaction(async client=>{await client.query('INSERT INTO agentci_reproduction_cancellations(organization_id,repository,id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[this.scope.organizationId,this.scope.repository,id]);});
  if(!await this.recovery(id))return {jobId:null,unitIds:[] as string[]};
  const {job}=await this.staged(plan!);await this.evals.cancel(job.id);
  const {unit}=await this.staged(plan!);
  return {jobId:job.id,unitIds:unit.status==='cancelled'?[unit.id]:[]};
 }
}
