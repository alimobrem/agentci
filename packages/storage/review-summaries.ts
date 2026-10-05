import type {Pool,PoolClient} from 'pg';
import {canonical,digest} from '../review/engine.ts';
import {nameUuid} from '../evals/request-id.ts';
import {validateReviewExecutionSummary} from '../reviewers/summary.ts';
import {validateReviewAdmission} from '../reviewers/admission.ts';
import {prepareReviewerRequest} from '../reviewers/request.ts';
import {bindReviewerProfile} from '../reviewers/profile.ts';
import {buildReviewContext} from '../reviewers/context.ts';
import {validateReviewerResult} from '../reviewers/result.ts';
import {findingsFromReviewer,deduplicateFindings,type ModelFinding} from '../findings/model.ts';
export class ReviewSummaryConflict extends Error {constructor(){super('review-summary-conflict');}}
export class ReviewSummaryUnavailable extends Error {constructor(){super('review-summary-unavailable');}}
const fail=():never=>{throw new ReviewSummaryConflict();};
/** Controller-only immutable summary. Save reconstructs every finding from
 * retained results and exact context; missing roles/findings cannot be hidden.
 * Documents are verified against retained context digests and are not stored here.
 */
export class ReviewSummaryStore {
 private scope:{organizationId:string;repository:string};
 constructor(private pool:Pool,scope:{organizationId:string;repository:string}){
  if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(scope.organizationId)||typeof scope.repository!=='string'||scope.repository.length>256||!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(scope.repository))fail();this.scope={organizationId:scope.organizationId.toLowerCase(),repository:scope.repository};
 }
 private key(id:string){if(typeof id!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id))fail();return [this.scope.organizationId,this.scope.repository,id];}
 private async tx<T>(fn:(c:PoolClient)=>Promise<T>):Promise<T>{
  let c:PoolClient;try{c=await this.pool.connect();}catch{throw new ReviewSummaryUnavailable();}let broken=false;
  try{await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'");await c.query("SET LOCAL statement_timeout='10s'");const value=await fn(c);await c.query('COMMIT');return value;}
  catch(e){try{await c.query('ROLLBACK');}catch{broken=true;}if(e instanceof ReviewSummaryConflict)throw e;throw new ReviewSummaryUnavailable();}finally{c.release(broken);}
 }
 private decode(row:any){let summary;try{summary=validateReviewExecutionSummary(row.summary);}catch{return fail();}if(summary.admissionId!==row.id||row.digest!==digest(canonical(summary)))fail();return {summary,digest:row.digest as string};}
 async get(id:string){const key=this.key(id);return this.tx(async c=>{const row=(await c.query('SELECT id,digest,summary FROM agentci_review_execution_summaries WHERE organization_id=$1 AND repository=$2 AND id=$3',key)).rows[0];return row?this.decode(row):undefined;});}
 async save(value:unknown,documentsValue:unknown){
  let s;try{s=validateReviewExecutionSummary(value);}catch{return fail();}const key=this.key(s.admissionId),hash=digest(canonical(s));let documents:unknown;try{documents=structuredClone(documentsValue);}catch{return fail();}
  return this.tx(async c=>{
   const prior=(await c.query('SELECT id,digest,summary FROM agentci_review_execution_summaries WHERE organization_id=$1 AND repository=$2 AND id=$3',key)).rows[0];if(prior){if(prior.digest!==hash)fail();return this.decode(prior);}
   const admission=(await c.query('SELECT request,digest,floor(extract(epoch FROM created_at)*1000)::text AS admitted_ms FROM agentci_review_admissions WHERE organization_id=$1 AND repository=$2 AND id=$3',key)).rows[0];if(!admission)fail();
   try{
    const request=validateReviewAdmission(admission.request);if(request.subject.organizationId!==this.scope.organizationId||request.subject.repository!==this.scope.repository||admission.digest!==digest(canonical(request))||s.admissionDigest!==admission.digest||s.mode!==request.mode||s.profileRevision!==request.profile.revision)fail();
    const profile=(await c.query('SELECT profile FROM agentci_reviewer_profiles WHERE organization_id=$1 AND repository=$2 AND id=$3 AND revision=$4',[...key.slice(0,2),request.profile.id,request.profile.revision])).rows[0];if(!profile)fail();
    const bound=bindReviewerProfile(request,profile.profile,Number(admission.admitted_ms)),context=buildReviewContext(request.subject,documents);
    if(context.digest!==s.contextDigest||s.coverage.selectedFiles!==context.documents.length||s.roles.length!==bound.roles.length||canonical(context.documents.map(({kind,side,path})=>({kind,side,path})))!==canonical(bound.profile.selection))fail();
    const proposals:ModelFinding[]=[];
    for(let i=0;i<bound.roles.length;i++){
     const role=bound.roles[i]!,ref=s.roles[i]!;if(ref.role!==role.config.role||ref.requestId!==role.requestId)fail();
     const row=(await c.query('SELECT result,digest,budget_id FROM agentci_reviewer_results WHERE organization_id=$1 AND repository=$2 AND request_id=$3',[...key.slice(0,2),ref.requestId])).rows[0];if(!row||row.digest!==ref.digest||row.budget_id!==bound.profile.budget.id)fail();
     const result=validateReviewerResult(row.result,request.subject);if(digest(canonical(result))!==ref.digest||result.status!==ref.status||result.role!==ref.role||result.requestId!==ref.requestId||result.contextDigest!==s.contextDigest||result.mode!==(s.mode==='live'?'external':'synthetic'))fail();
     const prepared=prepareReviewerRequest(role.requestId,role.config,request.subject,context.documents);prepared.request.metadata.authorizationDigest=result.authorizationDigest;
     if(result.configDigest!==prepared.configDigest||result.promptDigest!==prepared.promptDigest||result.requestDigest!==digest(canonical(prepared.request))||result.independence.differentProvider!==bound.profile.differentProvider)fail();
     proposals.push(...findingsFromReviewer(result,request.subject,context.documents));
    }
    const expected=deduplicateFindings(proposals,request.subject);if(expected.length!==s.findings.length)fail();
    for(let i=0;i<expected.length;i++){
     const finding=expected[i]!,ref=s.findings[i]!;if(ref.id!==finding.id)fail();
     const row=(await c.query('SELECT event,digest FROM agentci_finding_events WHERE organization_id=$1 AND repository=$2 AND operation_id=$3',[...key.slice(0,2),nameUuid(s.admissionId,`agentci:review-finding:v1:${finding.id}`)])).rows[0];if(!row||row.digest!==ref.digest||digest(canonical(row.event))!==ref.digest)fail();
     const original=row.event.action.type==='create'?row.event.finding:row.event.action.type==='evidence'?row.event.action.finding:null;if(canonical(original)!==canonical(finding))fail();
    }
   }catch(e){if(e instanceof ReviewSummaryConflict)throw e;if((e as {code?:string})?.code)throw e;return fail();}
   await c.query('INSERT INTO agentci_review_execution_summaries(organization_id,repository,id,digest,summary) VALUES($1,$2,$3,$4,$5) ON CONFLICT(organization_id,repository,id) DO NOTHING',[...key,hash,s]);
   const row=(await c.query('SELECT id,digest,summary FROM agentci_review_execution_summaries WHERE organization_id=$1 AND repository=$2 AND id=$3',key)).rows[0];if(!row||row.digest!==hash)fail();return this.decode(row);
  });
 }
}
