import {applyNonExecution,type ReproductionNonExecutionProof,type UnavailableFindingAction} from '../findings/non-execution.ts';
import type {Pool,PoolClient} from 'pg';
import {canonical,digest} from '../review/engine.ts';
import {validateModelFinding,findingsFromReviewer,deduplicateFindings,mergeFindingEvidence,type ModelFinding} from '../findings/model.ts';
import {createFindingTransitions,type FindingAction,type FindingReceipt} from '../findings/lifecycle.ts';
import type {ReviewSubject} from '../reviewers/context.ts';

export class FindingHistoryConflict extends Error {constructor(){super('finding-history-conflict');}}
export class FindingHistoryUnavailable extends Error {constructor(){super('finding-history-unavailable');}}
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const sha=/^sha256:[a-f0-9]{64}$/;
const conflict=():never=>{throw new FindingHistoryConflict();};
export interface FindingHistoryReaders {
 /** Controller-owned readers authenticate retained evidence and enforce scope.
  * Never implement these with model-supplied maps or arbitrary remote URLs. */
 reviewer(requestId:string,subject:ReviewSubject):Promise<{result:unknown;documents:unknown}>;
 receipt(receiptId:string,subject:ReviewSubject):Promise<FindingReceipt>;
 nonExecution?(proofId:string,subject:ReviewSubject):Promise<ReproductionNonExecutionProof>;
}
export type {FindingHistoryEvent,FindingHistoryRecord} from '../findings/history.ts';
import {validateFindingHistoryLink,type FindingHistoryEvent,type FindingHistoryRecord} from '../findings/history.ts';
/** Internal, deployment-scoped persistence. Every change is an immutable event;
 * no mutable latest-state row can overwrite earlier evidence. */
export class FindingHistoryStore {
 private readonly scope:{organizationId:string;repository:string};
 constructor(private readonly pool:Pool,scope:{organizationId:string;repository:string},private readonly readers:FindingHistoryReaders){
  if(!uuid.test(scope.organizationId)||! /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(scope.repository)||scope.repository.length>256)conflict();
  this.scope={...scope};
 }
 private subject(subject:ReviewSubject,id:string){
  if(!subject||subject.organizationId!==this.scope.organizationId||subject.repository!==this.scope.repository||!sha.test(id))conflict();
 }
 private async transaction<T>(operation:(client:PoolClient)=>Promise<T>):Promise<T>{
  let client:PoolClient;try{client=await this.pool.connect();}catch{throw new FindingHistoryUnavailable();}
  let broken=false;
  try{
   await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
   await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='10s'");
   const value=await operation(client);await client.query('COMMIT');return value;
  }catch(error){
   try{await client.query('ROLLBACK');}catch{broken=true;}
   if(error instanceof FindingHistoryConflict)throw error;
   if(['23505','40001'].includes((error as {code?:string})?.code??''))throw new FindingHistoryConflict();
   throw new FindingHistoryUnavailable();
  }finally{client.release(broken);}
 }
 private async history(client:PoolClient,id:string,subject:ReviewSubject):Promise<FindingHistoryRecord[]>{
  const budget=(await client.query(`SELECT count(*) AS count,coalesce(sum(octet_length(event::text)),0) AS bytes FROM agentci_finding_events WHERE organization_id=$1 AND repository=$2 AND finding_id=$3`,[this.scope.organizationId,this.scope.repository,id])).rows[0];
  if(Number(budget.count)>10000||Number(budget.bytes)>32*1024*1024)conflict();
  const rows=(await client.query(`SELECT operation_id,version,digest,event FROM agentci_finding_events
   WHERE organization_id=$1 AND repository=$2 AND finding_id=$3 ORDER BY version LIMIT 10001`,[this.scope.organizationId,this.scope.repository,id])).rows;
  if(rows.length>10000)conflict();
  const records:FindingHistoryRecord[]=[];
  for(const row of rows){
   let record:FindingHistoryRecord;
   try{record=await validateFindingHistoryLink({digest:row.digest,event:row.event},subject,records.at(-1));}catch{return conflict();}
   if(record.event.operationId!==row.operation_id||record.event.finding.id!==id||record.event.finding.version!==Number(row.version))conflict();
   records.push(record);
  }
  return records;
 }
 private async existing(client:PoolClient,operationId:string,inputDigest:string,id:string,subject:ReviewSubject){
  const row=(await client.query(`SELECT finding_id FROM agentci_finding_events WHERE organization_id=$1 AND repository=$2 AND operation_id=$3`,[this.scope.organizationId,this.scope.repository,operationId])).rows[0];
  if(!row)return undefined;if(row.finding_id!==id)conflict();
  const records=await this.history(client,id,subject),found=records.find(r=>r.event.operationId===operationId);
  if(!found||found.event.inputDigest!==inputDigest)conflict();return found;
 }
 private async append(client:PoolClient,event:FindingHistoryEvent):Promise<FindingHistoryRecord>{
  const budget=(await client.query(`SELECT coalesce(sum(octet_length(event::text)),0)+octet_length($4::jsonb::text) AS bytes FROM agentci_finding_events WHERE organization_id=$1 AND repository=$2 AND finding_id=$3`,[this.scope.organizationId,this.scope.repository,event.finding.id,event])).rows[0];
  if(Number(budget.bytes)>32*1024*1024)conflict();
  const hash=digest(canonical(event));
  await client.query(`INSERT INTO agentci_finding_events(organization_id,repository,finding_id,version,operation_id,digest,event)
   VALUES($1,$2,$3,$4,$5,$6,$7)`,[this.scope.organizationId,this.scope.repository,event.finding.id,event.finding.version,event.operationId,hash,event]);
  return {digest:hash,event:structuredClone(event)};
 }
 private async authenticateFinding(finding:ModelFinding,subject:ReviewSubject){
   // Reconstruct from authenticated retained reviewer results, not caller claims.
   const proposals:ModelFinding[]=[];
   for(const requestId of new Set(finding.sources.map(source=>source.requestId))){
    const retained=await this.readers.reviewer(requestId,structuredClone(subject));
    let normalized:ModelFinding[];try{normalized=findingsFromReviewer(retained.result,subject,retained.documents);}catch{conflict();}
    if(normalized!.some(f=>f.sources.some(s=>s.requestId!==requestId)))conflict();
    proposals.push(...normalized!.filter(f=>f.id===finding.id));
   }
   let reconstructed:ModelFinding|undefined;try{reconstructed=deduplicateFindings(proposals,subject)[0];}catch{conflict();}
   if(!reconstructed||canonical(reconstructed)!==canonical(finding))conflict();
 }
 /** Append authenticated reviewer evidence without changing reproduction disposition.
  * Idempotency binds the incoming evidence, not the latest finding version.
  */
 async ingest(value:unknown,subject:ReviewSubject,operationId:string):Promise<FindingHistoryRecord>{
  subject=structuredClone(subject);let incoming:ModelFinding;
  try{incoming=validateModelFinding(value,subject);}catch{return conflict();}
  this.subject(subject,incoming.id);if(!uuid.test(operationId)||incoming.state!=='deduplicated'||incoming.version!==1)conflict();
  return this.transaction(async client=>{
   const row=(await client.query('SELECT finding_id FROM agentci_finding_events WHERE organization_id=$1 AND repository=$2 AND operation_id=$3',[this.scope.organizationId,this.scope.repository,operationId])).rows[0];
   if(row&&row.finding_id!==incoming.id)conflict();
   const records=await this.history(client,incoming.id,subject),existing=records.find(r=>r.event.operationId===operationId);
   if(existing){const original=existing.event.action.type==='create'?existing.event.finding:existing.event.action.type==='evidence'?existing.event.action.finding:null;if(canonical(original)!==canonical(incoming))conflict();return existing;}
   await this.authenticateFinding(incoming,subject);
   const prior=records.at(-1);
   if(!prior)return this.append(client,{schemaVersion:'v1alpha1',operationId,inputDigest:digest(canonical({type:'create',finding:incoming})),previousDigest:null,action:{type:'create'},receipt:null,finding:incoming});
   let finding:ModelFinding;try{finding=mergeFindingEvidence(prior.event.finding,incoming);}catch{return conflict();}
   const action={type:'evidence' as const,finding:incoming};
   return this.append(client,{schemaVersion:'v1alpha1',operationId,inputDigest:digest(canonical({id:incoming.id,subject,action,expectedVersion:prior.event.finding.version})),previousDigest:prior.digest,action,receipt:null,finding});
  });
 }
 async create(value:unknown,subject:ReviewSubject,operationId:string):Promise<FindingHistoryRecord>{
  subject=structuredClone(subject);
  let finding:ModelFinding;try{finding=validateModelFinding(value,subject);}catch{conflict();}
  this.subject(subject,finding!.id);if(!uuid.test(operationId)||finding!.state!=='deduplicated'||finding!.version!==1)conflict();
  const inputDigest=digest(canonical({type:'create',finding:finding!}));
  return this.transaction(async client=>{
   const existing=await this.existing(client,operationId,inputDigest,finding!.id,subject);if(existing)return existing;
   if((await this.history(client,finding!.id,subject)).length)conflict();
   await this.authenticateFinding(finding!,subject);
   return this.append(client,{schemaVersion:'v1alpha1',operationId,inputDigest,previousDigest:null,action:{type:'create'},receipt:null,finding:finding!});
  });
 }
 async transition(id:string,subject:ReviewSubject,action:FindingAction,expectedVersion:number,operationId:string):Promise<FindingHistoryRecord>{
  return this.transaction(c=>this.transitionInTransaction(c,id,subject,action,expectedVersion,operationId));
 }
 /** External controller transaction owns both authenticated receipt and event. */
 async transitionInTransaction(client:PoolClient,id:string,subject:ReviewSubject,action:FindingAction,expectedVersion:number,operationId:string):Promise<FindingHistoryRecord>{
  subject=structuredClone(subject);
  this.subject(subject,id);if(!uuid.test(operationId)||!Number.isSafeInteger(expectedVersion)||expectedVersion<1)conflict();
  // Snapshot caller-owned input before any asynchronous reads.
  let selected:FindingAction;try{selected=structuredClone(action);}catch{conflict();}
  const inputDigest=digest(canonical({id,subject,action:selected!,expectedVersion}));
  return (async()=>{
   const existing=await this.existing(client,operationId,inputDigest,id,subject);if(existing)return existing;
   const records=await this.history(client,id,subject),prior=records.at(-1);
   if(!prior||records.length>=10000||prior.event.finding.version!==expectedVersion)conflict();
   let receipt:FindingReceipt|null=null;
   const transition=createFindingTransitions(async receiptId=>{receipt=structuredClone(await this.readers.receipt(receiptId,structuredClone(subject)));return receipt;});
   let next;try{next=await transition(prior!.event.finding,selected!,expectedVersion);}catch(error){if((error as Error).message==='finding-receipt-unavailable')throw new FindingHistoryUnavailable();conflict();}
   return this.append(client,{schemaVersion:'v1alpha1',operationId,inputDigest,previousDigest:prior!.digest,action:selected!,receipt,finding:next!.finding});
  })();
 }
 /** Separate authenticated reader: never routes non-execution through execution receipts. */
 async unavailable(id:string,subject:ReviewSubject,action:UnavailableFindingAction,expectedVersion:number,operationId:string):Promise<FindingHistoryRecord>{
  subject=structuredClone(subject);action=structuredClone(action);this.subject(subject,id);if(!uuid.test(operationId)||!Number.isSafeInteger(expectedVersion)||expectedVersion<1||!this.readers.nonExecution)conflict();
  const inputDigest=digest(canonical({id,subject,action,expectedVersion}));return this.transaction(async c=>{
   const existing=await this.existing(c,operationId,inputDigest,id,subject);if(existing)return existing;const records=await this.history(c,id,subject),prior=records.at(-1);if(!prior||records.length>=10000)conflict();
   const proof=await this.readers.nonExecution!(action.proofId,subject);let finding:ModelFinding;try{finding=applyNonExecution(prior!.event.finding,action,proof,expectedVersion);}catch{return conflict();}
   return this.append(c,{schemaVersion:'v1alpha2',operationId,inputDigest,previousDigest:prior!.digest,action,receipt:null,nonExecution:proof,finding});
  });
 }
 async getInTransaction(c:PoolClient,id:string,subject:ReviewSubject){subject=structuredClone(subject);this.subject(subject,id);return this.history(c,id,subject);}
 async get(id:string,subject:ReviewSubject):Promise<FindingHistoryRecord[]>{
  subject=structuredClone(subject);
  this.subject(subject,id);return this.transaction(client=>this.history(client,id,subject));
 }
}
