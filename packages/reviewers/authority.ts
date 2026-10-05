import type {Pool} from 'pg';
import type {Octokit} from '@octokit/rest';
import {canonical,digest} from '../review/engine.ts';
import {currentPullRequest} from '../github/client.ts';
import {validateReviewAdmission,type ReviewAdmissionRequest} from './admission.ts';
import {validateReviewerProfile} from './profile.ts';
import {validateReviewerRuntime,type ReviewerRuntimeDefinition} from '../runtime/reviewers.ts';
import {ReviewerProfileStore,ReviewerProfileRevoked} from '../storage/reviewer-profiles.ts';
import {ReviewAdmissionStore,ReviewAdmissionDenied} from '../storage/review-admissions.ts';
/** Shared admission authority. Provider clients/keys and activity construction are
 * deliberately absent; the injected GitHub reader uses the approved scoped App.
 * Only workers register profiles; configured profiles do not imply a live worker.
 */
export async function initializeReviewerAuthority(pool:Pool,github:Octokit,config:{organizationId:string;repository:string;installationId:number},supplied:ReviewerRuntimeDefinition,registerProfiles=false){
 await reviewerStorageReady(pool);
 const definition=validateReviewerRuntime(supplied),scope={organizationId:config.organizationId.toLowerCase(),repository:config.repository};
 const policyDigest=digest(canonical({scope,installationId:config.installationId,runtimePolicy:digest(canonical(definition))}));
 const profiles=new ReviewerProfileStore(pool,scope),allowed=new Set<string>();
 for(const value of definition.profiles){const record=validateReviewerProfile(value);if(registerProfiles)await profiles.put(record.profile);allowed.add(canonical([record.profile.id,record.revision]));}
 const authorize=async(value:ReviewAdmissionRequest)=>{
  const request=validateReviewAdmission(value);
  if(request.subject.organizationId!==scope.organizationId||request.subject.repository!==scope.repository||!allowed.has(canonical([request.profile.id,request.profile.revision])))throw new ReviewAdmissionDenied();
  let profile;try{profile=await profiles.resolve(request.profile.id,request.profile.revision);}catch(error){if(error instanceof ReviewerProfileRevoked)throw new ReviewAdmissionDenied();throw error;}
  if(profile.profile.mode!==request.mode||validateReviewerProfile(profile.profile).revision!==request.profile.revision)throw new ReviewAdmissionDenied();
  if(!await currentPullRequest(github,{...request.subject,installationId:config.installationId}))throw new ReviewAdmissionDenied();return request;
 };
 const admissions=new ReviewAdmissionStore(pool,scope,{approve:async value=>{const request=await authorize(value);return {requestDigest:digest(canonical(request)),policyDigest,profileRevision:request.profile.revision,mode:request.mode};}});
 return {scope,definition,policyDigest,profiles,authorize,admissions};
}
export async function reviewerStorageReady(pool:Pool){
 try{await pool.query(`SELECT a.request,a.approval,o.run_id,o.dispatched_at,
  o.cancel_requested_at,o.terminal_status,o.terminal_digest,o.lease_token,o.lease_until,o.recovery_after,
  p.profile,p.revoked_at,s.summary,s.digest,r.result,r.budget_id,f.event,b.limit_usd_micros,m.state,m.actual_usd_micros
  FROM agentci_review_admissions a,agentci_review_admission_outbox o,agentci_reviewer_profiles p,
  agentci_review_execution_summaries s,agentci_reviewer_results r,agentci_finding_events f,
  agentci_model_budgets b,agentci_model_attempts m LIMIT 0`);
 }catch{throw Error('reviewer-runtime-storage-unavailable');}
}
