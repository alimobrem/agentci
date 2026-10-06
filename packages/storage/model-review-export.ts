import type {Pool,PoolClient} from 'pg';
import {ModelReviewReads} from './model-review-reads.ts';import {FindingReadFailure} from './finding-cursor.ts';
import {bindReviewerProfile} from '../reviewers/profile.ts';import {canonical,digest} from '../review/engine.ts';import {nameUuid} from '../evals/request-id.ts';import {validateReviewerResult} from '../reviewers/result.ts';import {findingsFromRetainedReviewer} from '../findings/model.ts';
import {validateModelReviewExportHeader,ModelReviewExportVerifier,modelReviewExportFrame,MAX_MODEL_EXPORT_BYTES,MAX_MODEL_EXPORT_FRAME_BYTES,type ModelReviewExportHeader,type ModelReviewExportFrame,type ModelReviewExportItem} from '../reviewers/export.ts';
export interface PreparedModelReviewExport {header:ModelReviewExportHeader;frames(signal?:AbortSignal):AsyncGenerator<ModelReviewExportFrame>}
const tooLarge=():never=>{throw new FindingReadFailure(413,'response-too-large');};
export class ModelReviewExports {
 constructor(private pool:Pool,private scope:{organizationId:string;repository:string}){this.scope={...scope,organizationId:scope.organizationId.toLowerCase()};}
 async prepare(id:string):Promise<PreparedModelReviewExport>{
  const client=await this.pool.connect();let broken=false;
  let captured!:{header:ModelReviewExportHeader;roles:{digest:string;result:ReturnType<typeof validateReviewerResult>}[]};
  try{
   await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await client.query("SET LOCAL statement_timeout='10s'");const deadline=Date.now()+10000;
   const c={query:async(text:string,values?:unknown[])=>{const remaining=deadline-Date.now();if(remaining<=0)throw Error('export-snapshot-unavailable');await client.query("SELECT set_config('statement_timeout',$1,true)",[`${remaining}ms`]);return client.query(text,values);}} as PoolClient;
   const review=await new ModelReviewReads(c,this.scope).status(id);if(!review)throw new FindingReadFailure(404,'not-found');const request=review.admission.request,key=[this.scope.organizationId,this.scope.repository];
   const row=(await c.query(`SELECT p.profile,floor(extract(epoch FROM a.created_at)*1000)::text AS admitted_ms FROM agentci_review_admissions a JOIN agentci_reviewer_profiles p ON p.organization_id=a.organization_id AND p.repository=a.repository AND p.id=a.request->'profile'->>'id' AND p.revision=a.request->'profile'->>'revision' WHERE a.organization_id=$1 AND a.repository=$2 AND a.id=$3`,[...key,id])).rows[0];
   if(!row)throw Error('export-profile-unavailable');const bound=bindReviewerProfile(request,row.profile,Number(row.admitted_ms)),configuredRoles=bound.roles.map(r=>({requestId:r.requestId,role:r.config.role}));
   const roles:typeof captured.roles=[];const candidateIds=new Set<string>();let bytes=0,contextDigest:string|undefined;
   for(const role of bound.roles){
    const stored=(await c.query('SELECT request_id,attempt_id,budget_id,result,digest,octet_length(result::text) AS bytes FROM agentci_reviewer_results WHERE organization_id=$1 AND repository=$2 AND request_id=$3',[...key,role.requestId])).rows[0];if(!stored)continue;
    if(Number(stored.bytes)+512>MAX_MODEL_EXPORT_FRAME_BYTES)tooLarge();
    const result=validateReviewerResult(stored.result,request.subject);
    if(stored.request_id!==result.requestId||stored.attempt_id!==result.attemptId||stored.budget_id!==bound.profile.budget.id||result.role!==role.config.role||result.provider!==role.config.provider||result.model!==role.config.model||result.mode!==(request.mode==='live'?'external':'synthetic')||result.configDigest!==digest(canonical(role.config))||result.independence.differentProvider!==bound.profile.differentProvider||digest(canonical(result))!==stored.digest||contextDigest!==undefined&&contextDigest!==result.contextDigest)throw Error('export-role-unavailable');
    contextDigest=result.contextDigest;bytes+=Number(stored.bytes)+512;roles.push({digest:stored.digest,result});for(const finding of findingsFromRetainedReviewer(result,request.subject))candidateIds.add(finding.id);
   }
   const candidates=[...candidateIds].sort().map(findingId=>({id:findingId,operation:nameUuid(id,`agentci:review-finding:v1:${findingId}`)}));
   const associated=(await c.query(`SELECT e.finding_id,e.version,e.digest FROM agentci_finding_events e JOIN jsonb_to_recordset($3::jsonb) AS candidate(id text,operation uuid) ON candidate.id=e.finding_id AND candidate.operation=e.operation_id WHERE e.organization_id=$1 AND e.repository=$2 ORDER BY e.finding_id`,[...key,JSON.stringify(candidates)])).rows;
   if(associated.length>64)tooLarge();const findings:ModelReviewExportHeader['findings']=[];
   for(const a of associated){
    const stats=(await c.query(`SELECT count(*) AS count,max(version) AS version,sum(octet_length(event::text)+512) AS bytes,max(octet_length(event::text)+512) AS frame_bytes FROM agentci_finding_events WHERE organization_id=$1 AND repository=$2 AND finding_id=$3`,[...key,a.finding_id])).rows[0],version=Number(stats.version);
    if(version<1||version>10000||Number(stats.count)!==version)throw Error('export-history-unavailable');if(Number(stats.bytes)>32*1024*1024+512*version||Number(stats.frame_bytes)>MAX_MODEL_EXPORT_FRAME_BYTES)tooLarge();
    const last=(await c.query('SELECT digest FROM agentci_finding_events WHERE organization_id=$1 AND repository=$2 AND finding_id=$3 AND version=$4',[...key,a.finding_id,version])).rows[0];if(!last)throw Error('export-history-unavailable');
    findings.push({id:a.finding_id,throughVersion:version,lastDigest:last.digest});bytes+=Number(stats.bytes);
    if(review.summary&&!review.summary.summary.findings.some(ref=>ref.id===a.finding_id&&ref.digest===a.digest))throw Error('export-original-reference-unavailable');
   }
   const retainedRoles=roles.map(r=>({requestId:r.result.requestId,digest:r.digest})),snapshot={schemaVersion:'v1alpha1' as const,review,configuredRoles,retainedRoles,missingRoleIds:configuredRoles.filter(r=>!retainedRoles.some(s=>s.requestId===r.requestId)).map(r=>r.requestId),findings,reviewerCount:roles.length,eventCount:findings.reduce((n,f)=>n+f.throughVersion,0)};
   const header=validateModelReviewExportHeader({...snapshot,snapshotDigest:digest(canonical(snapshot))});if(bytes+Buffer.byteLength(JSON.stringify(header))+1024>MAX_MODEL_EXPORT_BYTES)tooLarge();
   if(Date.now()>deadline)throw Error('export-snapshot-unavailable');await client.query('COMMIT');captured={header,roles};
  }catch(error){try{await client.query('ROLLBACK');}catch{broken=true;}throw error;}finally{client.release(broken);}
  const pool=this.pool,scope={...this.scope},header=structuredClone(captured.header),roles=captured.roles;
  return {header:structuredClone(header),async *frames(signal?:AbortSignal){
   const verifier=new ModelReviewExportVerifier(header.review.admission.request);let sequence=0,previous='sha256:'+'0'.repeat(64);
   const frame=async(item:ModelReviewExportItem)=>{signal?.throwIfAborted();const value=modelReviewExportFrame(item,sequence++,previous);await verifier.push(value);previous=value.digest;return value;};
   yield await frame({type:'header',data:header});for(const role of roles)yield await frame({type:'reviewer',data:role});
   for(const finding of header.findings){let next=1;while(next<=finding.throughVersion){
    signal?.throwIfAborted();const query={text:`SELECT version,digest,event FROM (
     SELECT version,digest,event,sum(octet_length(event::text)+512) OVER(ORDER BY version) AS bytes FROM (
      SELECT version,digest,event FROM agentci_finding_events WHERE organization_id=$1 AND repository=$2 AND finding_id=$3 AND version>=$4 AND version<=$5 ORDER BY version LIMIT 25
     ) batch) bounded WHERE bytes<=$6 OR version=$4 ORDER BY version`,values:[scope.organizationId,scope.repository,finding.id,next,finding.throughVersion,MAX_MODEL_EXPORT_FRAME_BYTES],query_timeout:10000};
    const c=await pool.connect();let broken=false;let rows;
    try{await c.query('BEGIN READ ONLY');await c.query("SET LOCAL statement_timeout='10s'");signal?.throwIfAborted();rows=(await c.query(query)).rows;await c.query('COMMIT');}
    catch(error){try{await c.query('ROLLBACK');}catch{broken=true;}throw error;}finally{c.release(broken);}
    // No transaction or connection is held while waiting for network consumers.
    if(!rows.length)throw Error('export-history-unavailable');for(const row of rows){if(Number(row.version)!==next)throw Error('export-history-unavailable');yield await frame({type:'finding',data:{digest:row.digest,event:row.event}});next++;}
   }}
   yield await frame({type:'end',data:{snapshotDigest:header.snapshotDigest,reviewerCount:header.reviewerCount,eventCount:header.eventCount,lastContentDigest:previous}});verifier.finish();
  }};
 }
}
