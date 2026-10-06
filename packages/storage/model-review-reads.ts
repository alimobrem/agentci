import type {Pool} from 'pg';
import {canonical,digest} from '../review/engine.ts';
import {validateReviewAdmissionApproval} from '../reviewers/admission.ts';
import {validateReviewerProfile,type ReviewerProfile} from '../reviewers/profile.ts';
import {validateModelReviewStatus,validateReviewerProfileList} from '../reviewers/transport.ts';
/** One SQL statement gives status a coherent PostgreSQL snapshot, including
 * terminal commitment and retained summary. Never stitch separately timed gets.
 */
export class ModelReviewReads {
 private scope:{organizationId:string;repository:string};
 constructor(private pool:Pool,scope:{organizationId:string;repository:string}){this.scope={...scope,organizationId:scope.organizationId.toLowerCase()};}
 async status(id:string){
  const row=(await this.pool.query(`SELECT a.request,a.digest,a.approval,a.approval_digest,
   o.run_id IS NOT NULL OR o.dispatched_at IS NOT NULL AS dispatched,o.cancel_requested_at IS NOT NULL AS cancelled,
   o.terminal_status,o.terminal_digest,s.summary,s.digest AS summary_digest
   FROM agentci_review_admissions a JOIN agentci_review_admission_outbox o USING(organization_id,repository,id)
   LEFT JOIN agentci_review_execution_summaries s USING(organization_id,repository,id)
   WHERE a.organization_id=$1 AND a.repository=$2 AND a.id=$3`,[this.scope.organizationId,this.scope.repository,id])).rows[0];
  if(!row)return undefined;
  const result=validateModelReviewStatus({schemaVersion:'v1alpha1',admission:{request:row.request,digest:row.digest},execution:{state:row.terminal_status??(row.dispatched?'dispatched':'queued'),cancelRequested:row.cancelled,terminalDigest:row.terminal_digest},summary:row.summary?{summary:row.summary,digest:row.summary_digest}:null});
  if(result.admission.request.id!==id||result.admission.request.subject.organizationId!==this.scope.organizationId||result.admission.request.subject.repository!==this.scope.repository||digest(canonical(validateReviewAdmissionApproval(row.approval,result.admission.request)))!==row.approval_digest)throw Error('model-review-read-unavailable');return result;
 }
 async profiles(configured:ReviewerProfile[]){
  if(!configured.length)return validateReviewerProfileList({schemaVersion:'v1alpha1',profiles:[]});
  const selected=configured.map(validateReviewerProfile);
  const rows=(await this.pool.query(`SELECT p.id,p.revision,p.profile,p.revoked_at FROM agentci_reviewer_profiles p JOIN jsonb_to_recordset($3::jsonb) AS chosen(id text,revision text) ON p.id=chosen.id AND p.revision=chosen.revision WHERE p.organization_id=$1 AND p.repository=$2`,[this.scope.organizationId,this.scope.repository,JSON.stringify(selected.map(p=>({id:p.profile.id,revision:p.revision})))])).rows;
  const profiles=selected.map(expected=>{const row=rows.find(r=>r.id===expected.profile.id&&r.revision===expected.revision);if(!row||canonical(validateReviewerProfile(row.profile))!==canonical(expected))throw Error('model-review-read-unavailable');return {id:row.id,revision:row.revision,mode:expected.profile.mode,revoked:row.revoked_at!==null};}).sort((a,b)=>canonical([a.id,a.revision])<canonical([b.id,b.revision])?-1:1);
  return validateReviewerProfileList({schemaVersion:'v1alpha1',profiles});
 }
}
