import type {Pool} from 'pg';
import type {Octokit} from '@octokit/rest';
import {canonical,digest} from '../../packages/review/engine.ts';
import {currentPullRequest,createRemoteSnapshotReader} from '../../packages/github/client.ts';
import {validateReviewAdmission,type ReviewAdmissionRequest} from '../../packages/reviewers/admission.ts';
import {validateReviewerProfile} from '../../packages/reviewers/profile.ts';
import type {createReviewerRuntime} from '../../packages/runtime/reviewers.ts';
import {ReviewerProfileStore,ReviewerProfileRevoked} from '../../packages/storage/reviewer-profiles.ts';
import {ReviewAdmissionStore,ReviewAdmissionDenied} from '../../packages/storage/review-admissions.ts';
import {ReviewDispatchStore} from '../../packages/storage/review-dispatch.ts';
import {ReviewSummaryStore} from '../../packages/storage/review-summaries.ts';
import {createAdmittedReviewExecution} from './reviewer-execution.ts';
import {createAdmittedReviewActivities} from './reviewer-activities.ts';
/** Shared controller construction. Request transport must authenticate callers
 * separately; only this operator-owned runtime supplies authorization/readers.
 */
export async function initializeReviewerController(pool:Pool,github:Octokit,config:{organizationId:string;repository:string;installationId:number},runtime:ReturnType<typeof createReviewerRuntime>){
 const scope={organizationId:config.organizationId.toLowerCase(),repository:config.repository},definition=structuredClone(runtime.definition),policyDigest=digest(canonical({scope,installationId:config.installationId,runtimePolicy:runtime.policyDigest}));
 const profiles=new ReviewerProfileStore(pool,scope),allowed=new Set<string>();
 for(const supplied of definition.profiles){const record=await profiles.put(supplied);allowed.add(canonical([record.profile.id,record.revision]));}
 const authorize=async(value:ReviewAdmissionRequest)=>{
  const request=validateReviewAdmission(value);
  if(request.subject.organizationId!==scope.organizationId||request.subject.repository!==scope.repository||!allowed.has(canonical([request.profile.id,request.profile.revision])))throw new ReviewAdmissionDenied();
  let profile;try{profile=await profiles.resolve(request.profile.id,request.profile.revision);}catch(error){if(error instanceof ReviewerProfileRevoked)throw new ReviewAdmissionDenied();throw error;}if(profile.profile.mode!==request.mode||validateReviewerProfile(profile.profile).revision!==request.profile.revision)throw new ReviewAdmissionDenied();
  if(!await currentPullRequest(github,{...request.subject,installationId:config.installationId}))throw new ReviewAdmissionDenied();
  return request;
 };
 const admissions=new ReviewAdmissionStore(pool,scope,{approve:async value=>{const request=await authorize(value);return {requestDigest:digest(canonical(request)),policyDigest,profileRevision:request.profile.revision,mode:request.mode};}});
 const dispatch=new ReviewDispatchStore(pool,scope),summaries=new ReviewSummaryStore(pool,scope),readSnapshot=createRemoteSnapshotReader(github);
 const execute=createAdmittedReviewExecution({pool,scope,admissions,registrations:runtime.registrations,readSnapshot,authorize:async admission=>{
  if(admission.approval.policyDigest!==policyDigest)throw new ReviewAdmissionDenied();
  const request=await authorize(admission.request);return definition.codingProvenance.find(p=>p.headSha===request.subject.headSha)??null;
 }});
 return {admissions,dispatch,summaries,profiles,activities:createAdmittedReviewActivities({dispatch,summaries,execute}),policyDigest};
}
