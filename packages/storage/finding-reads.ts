import type {Pool,PoolClient} from 'pg';
import {nameUuid} from '../evals/request-id.ts';
import {validateFindingHistoryLink,validateFindingHistoryRecord,type FindingHistoryRecord} from '../findings/history.ts';
import {validateModelReviewFindings,validateModelFindingHistory,type ModelReviewFindings,type ModelFindingHistory} from '../reviewers/finding-transport.ts';
import {ModelReviewReads} from './model-review-reads.ts';
import {FindingCursors,FindingReadFailure,type FindingCursor} from './finding-cursor.ts';
import type {ReviewSubject} from '../reviewers/context.ts';
export interface FindingPageOptions {limit?:number;cursor?:string}
function fail(status:number,code:string):never{throw new FindingReadFailure(status,code);}
const MAX_PAGE=4*1024*1024;
export class FindingReads {
 private cursors:FindingCursors;
 constructor(private pool:Pool,private scope:{organizationId:string;repository:string},cursorKey:string,private now=()=>Date.now()){this.scope={...scope,organizationId:scope.organizationId.toLowerCase()};this.cursors=new FindingCursors(cursorKey,this.now);}
 private async snapshot<T>(operation:(client:PoolClient)=>Promise<T>):Promise<T>{
  const c=await this.pool.connect();let broken=false;
  try{
   await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await c.query("SET LOCAL statement_timeout='10s'");const deadline=this.now()+10000;
   // Every statement shares the same response budget, including prefix replay.
   const bounded={query:async(text:string,values?:unknown[])=>{const remaining=deadline-this.now();if(remaining<=0)fail(503,'service-unavailable');await c.query("SELECT set_config('statement_timeout',$1,true)",[`${remaining}ms`]);return c.query(text,values);}} as PoolClient;
   const value=await operation(bounded);if(this.now()>deadline)fail(503,'service-unavailable');await c.query('COMMIT');return value;
  }
  catch(e){try{await c.query('ROLLBACK');}catch{broken=true;}throw e;}finally{c.release(broken);}
 }
 private limit(options:FindingPageOptions){const n=options.limit??25;if(!Number.isInteger(n)||n<1||n>100)fail(400,'invalid-request');return n;}
 private binding(route:'findings'|'history',reviewId:string,findingId:string|null){return {...this.scope,route,reviewId,findingId};}
 async findings(reviewId:string,options:FindingPageOptions={}):Promise<ModelReviewFindings>{
  const limit=this.limit(options),binding=this.binding('findings',reviewId,null),cursor=options.cursor?this.cursors.decode(options.cursor,binding):null;
  return this.snapshot(async c=>{
   const status=await new ModelReviewReads(c,this.scope).status(reviewId);if(!status)fail(404,'not-found');if(!status.summary)fail(409,'review-not-complete');
   const summary=status.summary!,refs=[...summary.summary.findings].sort((a,b)=>a.id<b.id?-1:1);
   if(cursor&&(cursor.summaryDigest!==summary.digest||cursor.throughVersion!==null||cursor.previousDigest!==null||cursor.next>=refs.length))fail(400,'invalid-cursor');
   const start=cursor?.next??0,selected=refs.slice(start,start+limit),items=[];
   for(const ref of selected){
    const row=(await c.query('SELECT version,operation_id FROM agentci_finding_events WHERE organization_id=$1 AND repository=$2 AND finding_id=$3 AND digest=$4',[this.scope.organizationId,this.scope.repository,ref.id,ref.digest])).rows;
    if(row.length!==1||row[0].operation_id!==nameUuid(reviewId,`agentci:review-finding:v1:${ref.id}`))throw Error('invalid-retained-finding-reference');
    items.push({...ref,version:Number(row[0].version)});
   }
   const next=start+items.length;
   return validateModelReviewFindings({schemaVersion:'v1alpha1',reviewId,summaryDigest:summary.digest,items,nextCursor:next<refs.length?this.cursors.encode({...binding,summaryDigest:summary.digest,throughVersion:null,previousDigest:null,next}):null});
  });
 }
 private async association(c:PoolClient,reviewId:string,id:string){
  const status=await new ModelReviewReads(c,this.scope).status(reviewId);if(!status)fail(404,'not-found');
  const row=(await c.query('SELECT version,digest FROM agentci_finding_events WHERE organization_id=$1 AND repository=$2 AND finding_id=$3 AND operation_id=$4',[this.scope.organizationId,this.scope.repository,id,nameUuid(reviewId,`agentci:review-finding:v1:${id}`)])).rows[0];
  if(!row)fail(404,'not-found');
  if(status.summary&&!status.summary.summary.findings.some(f=>f.id===id&&f.digest===row.digest))throw Error('invalid-retained-finding-reference');
  return status.admission.request.subject;
 }
 /** Authenticate complete prefix incrementally, keeping only a bounded page and
  * its predecessor. Do not materialize every finding's full history in memory. */
 private async read(c:PoolClient,id:string,subject:ReviewSubject,through:number,start:number,limit:number,prior?:FindingHistoryRecord){
  const items:FindingHistoryRecord[]=[];let size=4096,next=prior?start:1;
  while(next<=through){
   const rows=(await c.query(`SELECT version,operation_id,digest,event FROM (
    SELECT version,operation_id,digest,event,sum(octet_length(event::text)) OVER(ORDER BY version) AS bytes
    FROM (SELECT version,operation_id,digest,event FROM agentci_finding_events WHERE organization_id=$1 AND repository=$2 AND finding_id=$3 AND version>=$4 AND version<=$5 ORDER BY version LIMIT 25) batch
   ) bounded WHERE bytes<=$6 OR version=$4 ORDER BY version`,[this.scope.organizationId,this.scope.repository,id,next,through,MAX_PAGE])).rows;
   if(!rows.length)throw Error('missing-finding-history');
   for(const row of rows){
    const responseBytes=Buffer.byteLength(JSON.stringify({digest:row.digest,event:row.event}))+1;
    if(next>=start&&responseBytes+4096>MAX_PAGE)fail(413,'response-too-large');
    const record=await validateFindingHistoryLink({digest:row.digest,event:row.event},subject,prior);
    if(record.event.finding.id!==id||record.event.finding.version!==next||Number(row.version)!==next||record.event.operationId!==row.operation_id)throw Error('invalid-finding-history');
    if(next>=start){const bytes=Buffer.byteLength(JSON.stringify(record))+1;if(size+bytes>MAX_PAGE){if(!items.length)fail(413,'response-too-large');return items;}items.push(record);size+=bytes;if(items.length===limit)return items;}
    prior=record;next++;
   }
  }
  return items;
 }
 private async watermark(c:PoolClient,id:string){
  const row=(await c.query('SELECT count(*) AS count,max(version) AS version,coalesce(sum(octet_length(event::text)),0) AS bytes FROM agentci_finding_events WHERE organization_id=$1 AND repository=$2 AND finding_id=$3',[this.scope.organizationId,this.scope.repository,id])).rows[0];
  const n=Number(row.version);if(n<1||n>10000||Number(row.count)!==n||Number(row.bytes)>32*1024*1024)throw Error('invalid-finding-history');return n;
 }
 async finding(reviewId:string,id:string,version?:number):Promise<FindingHistoryRecord>{
  if(version!==undefined&&(!Number.isInteger(version)||version<1||version>10000))fail(400,'invalid-request');
  return this.snapshot(async c=>{const subject=await this.association(c,reviewId,id),through=await this.watermark(c,id),target=version??through;if(target>through)fail(404,'not-found');return (await this.read(c,id,subject,target,target,1))[0]!;});
 }
 async history(reviewId:string,id:string,options:FindingPageOptions={}):Promise<ModelFindingHistory>{
  const limit=this.limit(options),binding=this.binding('history',reviewId,id),cursor=options.cursor?this.cursors.decode(options.cursor,binding):null;
  return this.snapshot(async c=>{
   const subject=await this.association(c,reviewId,id),latest=cursor?.throughVersion??await this.watermark(c,id),through=cursor?.throughVersion??latest,start=cursor?.next??1;
   if(cursor&&(cursor.summaryDigest!==null||!/^sha256:[a-f0-9]{64}$/.test(cursor.previousDigest??'')||!Number.isInteger(through)||through<1||through>10000||through>latest||start<2||start>through))fail(400,'invalid-cursor');
   let prior:FindingHistoryRecord|undefined;
   if(cursor){const row=(await c.query('SELECT digest,event FROM agentci_finding_events WHERE organization_id=$1 AND repository=$2 AND finding_id=$3 AND version=$4',[this.scope.organizationId,this.scope.repository,id,start-1])).rows[0];if(!row||row.digest!==cursor.previousDigest)throw Error('invalid-finding-anchor');prior=validateFindingHistoryRecord(row,subject);if(prior.event.finding.id!==id||prior.event.finding.version!==start-1)throw Error('invalid-finding-anchor');}
   const items=await this.read(c,id,subject,through,start,limit,prior),next=items.at(-1)!.event.finding.version+1;
   return validateModelFindingHistory({schemaVersion:'v1alpha1',reviewId,findingId:id,throughVersion:through,items,nextCursor:next<=through?this.cursors.encode({...binding,summaryDigest:null,throughVersion:through,previousDigest:items.at(-1)!.digest,next}):null},subject);
  });
 }
}
