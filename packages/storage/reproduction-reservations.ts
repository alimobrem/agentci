import type {Pool,PoolClient} from 'pg';
import {canonical,digest} from '../review/engine.ts';
import {nameUuid} from '../evals/request-id.ts';
import {validateFindingHistoryLink,type FindingHistoryRecord,type FindingHistoryEvent} from '../findings/history.ts';
import type {ReproductionApprovalRegistry,ReproductionSelector} from '../findings/approval-registry.ts';
import {ModelReviewReads} from './model-review-reads.ts';
export class ReproductionReservationConflict extends Error {constructor(readonly code='reproduction-reservation-conflict'){super(code);}}
export interface ReproductionReservation {operationId:string;reproductionId:string;planDigest:string;findingId:string;queuedVersion:number;reviewId:string;requestDigest:string}
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const fail=(code?:string):never=>{throw new ReproductionReservationConflict(code);};
/** Internal storage only: transports authenticate every call, and a future
 * dispatcher must independently recheck authority and reconcile Temporal starts. */
export class ReproductionReservations {
 private readonly scope:{organizationId:string;repository:string};
 constructor(private readonly pool:Pool,scope:{organizationId:string;repository:string},private readonly registry:ReproductionApprovalRegistry){
  if(!uuid(scope.organizationId)||! /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(scope.repository)||scope.repository.length>256)fail();this.scope={...scope};
 }
 private async tx<T>(run:(c:PoolClient)=>Promise<T>){
  let c:PoolClient;try{c=await this.pool.connect();}catch{throw Error('reproduction-reservation-unavailable');}let broken=false;
  const connectionFailed=()=>{broken=true;};c.on('error',connectionFailed);
  try{await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'");await c.query("SET LOCAL statement_timeout='10s'");await c.query("SET LOCAL transaction_timeout='15s'");const value=await run(c);await c.query('COMMIT');return value;}
  catch(error){try{await c.query('ROLLBACK');}catch{broken=true;}if(error instanceof ReproductionReservationConflict)throw error;if((error as {code?:string})?.code==='23505')fail('version-conflict');throw Error('reproduction-reservation-unavailable');}
  finally{c.release(broken);c.off('error',connectionFailed);}
 }
 async reserve(findingId:string,value:unknown):Promise<ReproductionReservation>{
  let request:ReproductionSelector;
  try{if(Buffer.byteLength(canonical(value))>8192)fail();request=structuredClone(value) as ReproductionSelector;
   if(!/^sha256:[a-f0-9]{64}$/.test(findingId)||!uuid(request?.operationId)||!uuid(request?.approvalId)||!Number.isSafeInteger(request?.expectedVersion)||request.expectedVersion<1||request.expectedVersion>9998||request.subject?.organizationId!==this.scope.organizationId||request.subject.repository!==this.scope.repository)fail();
  }catch{return fail('invalid-request');}
  const key=[this.scope.organizationId,this.scope.repository],hash=digest(canonical(request));
  return this.tx(async c=>{
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[canonical([...key,'reproduction-operation',request.operationId])]);
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[canonical([...key,findingId])]);
   const existing=(await c.query('SELECT * FROM agentci_reproduction_operations WHERE organization_id=$1 AND repository=$2 AND operation_id=$3',[...key,request.operationId])).rows[0];
   if(existing&&(existing.request_digest!==hash||canonical(existing.request)!==canonical(request)||existing.finding_id!==findingId))fail('idempotency-conflict');
   const budget=(await c.query('SELECT count(*) AS count,coalesce(sum(octet_length(event::text)),0) AS bytes FROM agentci_finding_events WHERE organization_id=$1 AND repository=$2 AND finding_id=$3',[...key,findingId])).rows[0];
   if(Number(budget.count)>10000||Number(budget.bytes)>32*1024*1024)fail();
   const rows=(await c.query('SELECT version,operation_id,digest,event FROM agentci_finding_events WHERE organization_id=$1 AND repository=$2 AND finding_id=$3 ORDER BY version LIMIT 10001',[...key,findingId])).rows;
   let prior:FindingHistoryRecord|undefined,selectedCurrent:FindingHistoryRecord|undefined;const validated:FindingHistoryRecord[]=[];
   for(const row of rows){let record:FindingHistoryRecord;try{record=await validateFindingHistoryLink({digest:row.digest,event:row.event},request.subject,prior);}catch{return fail();}
    if(record.event.finding.id!==findingId||record.event.finding.version!==row.version||record.event.operationId!==row.operation_id)fail();prior=record;validated.push(record);if(row.version===request.expectedVersion)selectedCurrent=record;}
   if(!selectedCurrent||!prior)fail('version-conflict');
   if(!existing&&prior!.event.finding.version!==request.expectedVersion)fail('version-conflict');
   let selected;try{selected=this.registry.select(request,selectedCurrent!.event.finding);}catch{return fail('approval-conflict');}
   const plan=selected.plan,review=await new ModelReviewReads(c,this.scope).status(plan.approval.reviewId);
   const associated=validated.find(r=>r.event.operationId===nameUuid(plan.approval.reviewId,`agentci:review-finding:v1:${findingId}`));
   if(!review||canonical(review.admission.request.subject)!==canonical(request.subject)||!associated||review.summary&&!review.summary.summary.findings.some(f=>f.id===findingId&&f.digest===associated.digest))fail('admission-conflict');
   const result:ReproductionReservation={operationId:request.operationId,reproductionId:plan.id,planDigest:selected.planDigest,findingId,queuedVersion:plan.finding.version,reviewId:plan.approval.reviewId,requestDigest:hash};
   if(existing){
    const retained=(await c.query('SELECT digest,plan FROM agentci_reproduction_plans WHERE organization_id=$1 AND repository=$2 AND id=$3',[...key,plan.id])).rows[0];
    const intent=(await c.query('SELECT workflow_id FROM agentci_reproduction_dispatch_intents WHERE organization_id=$1 AND repository=$2 AND operation_id=$3',[...key,request.operationId])).rows[0];
    const queued=validated.find(r=>r.event.operationId===request.operationId);
    if(existing.result_digest!==digest(canonical(result))||canonical(existing.result)!==canonical(result)||retained?.digest!==selected.planDigest||canonical(retained?.plan)!==canonical(plan)||intent?.workflow_id!==`agentci:reproduction:${plan.id}`||!queued||canonical(queued.event.finding)!==canonical(plan.finding))fail();
    return result;
   }
   const count=Number((await c.query('SELECT count(*) AS count FROM agentci_reproduction_plans WHERE organization_id=$1 AND repository=$2 AND finding_id=$3',[...key,findingId])).rows[0].count);if(count>=plan.limits.maxAttempts)fail('attempt-limit');
   const event:FindingHistoryEvent={schemaVersion:'v1alpha1',operationId:request.operationId,inputDigest:digest(canonical({id:findingId,subject:request.subject,action:{type:'queue'},expectedVersion:request.expectedVersion})),previousDigest:prior!.digest,action:{type:'queue'},receipt:null,finding:plan.finding};
   await validateFindingHistoryLink({event,digest:digest(canonical(event))},request.subject,prior);
   const eventBytes=Number((await c.query('SELECT octet_length($1::jsonb::text) AS bytes',[event])).rows[0].bytes);
   if(Buffer.byteLength(canonical(event))>2*1024*1024||Number(budget.bytes)+eventBytes>32*1024*1024)fail();
   await c.query('INSERT INTO agentci_finding_events(organization_id,repository,finding_id,version,operation_id,digest,event) VALUES($1,$2,$3,$4,$5,$6,$7)',[...key,findingId,plan.finding.version,request.operationId,digest(canonical(event)),event]);
   await c.query('INSERT INTO agentci_reproduction_plans(organization_id,repository,id,finding_id,finding_version,digest,plan) VALUES($1,$2,$3,$4,$5,$6,$7)',[...key,plan.id,findingId,plan.finding.version,selected.planDigest,plan]);
   await c.query('INSERT INTO agentci_reproduction_operations(organization_id,repository,operation_id,finding_id,reproduction_id,request_digest,request,result_digest,result) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[...key,request.operationId,findingId,plan.id,hash,request,digest(canonical(result)),result]);
   await c.query('INSERT INTO agentci_reproduction_dispatch_intents(organization_id,repository,operation_id,workflow_id) VALUES($1,$2,$3,$4)',[...key,request.operationId,`agentci:reproduction:${plan.id}`]);
   return result;
  });
 }
}
