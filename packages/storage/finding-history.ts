import type {Pool,PoolClient} from 'pg';
import {canonical,digest} from '../review/engine.ts';
import {validateModelFinding,findingsFromReviewer,deduplicateFindings,type ModelFinding} from '../findings/model.ts';
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
}
export interface FindingHistoryEvent {
 schemaVersion:'v1alpha1';operationId:string;inputDigest:string;previousDigest:string|null;
 action:{type:'create'}|FindingAction;receipt:FindingReceipt|null;finding:ModelFinding;
}
export interface FindingHistoryRecord {digest:string;event:FindingHistoryEvent}
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
   const event=row.event as FindingHistoryEvent;
   if(!event||Object.keys(event).sort().join(',')!=='action,finding,inputDigest,operationId,previousDigest,receipt,schemaVersion'||event.schemaVersion!=='v1alpha1'||!uuid.test(event.operationId)||!sha.test(event.inputDigest)||row.operation_id!==event.operationId||row.digest!==digest(canonical(event)))conflict();
   let finding:ModelFinding;try{finding=validateModelFinding(event.finding,subject);}catch{conflict();}
   if(finding!.id!==id||Number(row.version)!==finding!.version)conflict();
   const prior=records.at(-1);
   const expectedInput=prior?{id,subject,action:event.action,expectedVersion:prior.event.finding.version}:{type:'create',finding:finding!};
   if(event.inputDigest!==digest(canonical(expectedInput)))conflict();
   if(!prior){
    if(event.previousDigest!==null||canonical(event.action)!==canonical({type:'create'})||event.receipt!==null||finding!.state!=='deduplicated'||finding!.version!==1)conflict();
   }else{
    if(event.previousDigest!==prior.digest||event.action.type==='create')conflict();
    const action=event.action as FindingAction;
    if(action.type==='queue'&&event.receipt!==null||action.type!=='queue'&&event.receipt===null)conflict();
    try{
     const next=await createFindingTransitions(async()=>event.receipt!)(prior.event.finding,action,prior.event.finding.version);
     if(canonical(next.finding)!==canonical(finding!))conflict();
    }catch{conflict();}
   }
   records.push({digest:row.digest,event:structuredClone(event)});
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
 async create(value:unknown,subject:ReviewSubject,operationId:string):Promise<FindingHistoryRecord>{
  subject=structuredClone(subject);
  let finding:ModelFinding;try{finding=validateModelFinding(value,subject);}catch{conflict();}
  this.subject(subject,finding!.id);if(!uuid.test(operationId)||finding!.state!=='deduplicated'||finding!.version!==1)conflict();
  const inputDigest=digest(canonical({type:'create',finding:finding!}));
  return this.transaction(async client=>{
   const existing=await this.existing(client,operationId,inputDigest,finding!.id,subject);if(existing)return existing;
   if((await this.history(client,finding!.id,subject)).length)conflict();
   // Reconstruct from authenticated retained reviewer results, not caller claims.
   const proposals:ModelFinding[]=[];
   for(const requestId of new Set(finding!.sources.map(source=>source.requestId))){
    const retained=await this.readers.reviewer(requestId,structuredClone(subject));
    let normalized:ModelFinding[];try{normalized=findingsFromReviewer(retained.result,subject,retained.documents);}catch{conflict();}
    if(normalized!.some(f=>f.sources.some(s=>s.requestId!==requestId)))conflict();
    proposals.push(...normalized!.filter(f=>f.id===finding!.id));
   }
   let reconstructed:ModelFinding|undefined;try{reconstructed=deduplicateFindings(proposals,subject)[0];}catch{conflict();}
   if(!reconstructed||canonical(reconstructed)!==canonical(finding!))conflict();
   return this.append(client,{schemaVersion:'v1alpha1',operationId,inputDigest,previousDigest:null,action:{type:'create'},receipt:null,finding:finding!});
  });
 }
 async transition(id:string,subject:ReviewSubject,action:FindingAction,expectedVersion:number,operationId:string):Promise<FindingHistoryRecord>{
  subject=structuredClone(subject);
  this.subject(subject,id);if(!uuid.test(operationId)||!Number.isSafeInteger(expectedVersion)||expectedVersion<1)conflict();
  // Snapshot caller-owned input before any asynchronous reads.
  let selected:FindingAction;try{selected=structuredClone(action);}catch{conflict();}
  const inputDigest=digest(canonical({id,subject,action:selected!,expectedVersion}));
  return this.transaction(async client=>{
   const existing=await this.existing(client,operationId,inputDigest,id,subject);if(existing)return existing;
   const records=await this.history(client,id,subject),prior=records.at(-1);
   if(!prior||records.length>=10000||prior.event.finding.version!==expectedVersion)conflict();
   let receipt:FindingReceipt|null=null;
   const transition=createFindingTransitions(async receiptId=>{receipt=structuredClone(await this.readers.receipt(receiptId,structuredClone(subject)));return receipt;});
   let next;try{next=await transition(prior!.event.finding,selected!,expectedVersion);}catch(error){if((error as Error).message==='finding-receipt-unavailable')throw new FindingHistoryUnavailable();conflict();}
   return this.append(client,{schemaVersion:'v1alpha1',operationId,inputDigest,previousDigest:prior!.digest,action:selected!,receipt,finding:next!.finding});
  });
 }
 async get(id:string,subject:ReviewSubject):Promise<FindingHistoryRecord[]>{
  subject=structuredClone(subject);
  this.subject(subject,id);return this.transaction(client=>this.history(client,id,subject));
 }
}
