import {initializeReviewerAuthority} from '../../packages/reviewers/authority.ts';
import type {Pool} from 'pg';
import type {Octokit} from '@octokit/rest';
import {createRemoteSnapshotReader} from '../../packages/github/client.ts';
import type {createReviewerRuntime} from '../../packages/runtime/reviewers.ts';
import {ReviewAdmissionDenied} from '../../packages/storage/review-admissions.ts';
import {ReviewDispatchStore} from '../../packages/storage/review-dispatch.ts';
import {ReviewSummaryStore} from '../../packages/storage/review-summaries.ts';
import {createAdmittedReviewExecution} from './reviewer-execution.ts';
import {createAdmittedReviewActivities} from './reviewer-activities.ts';
/** Shared controller construction. Request transport must authenticate callers
 * separately; only this operator-owned runtime supplies authorization/readers.
 */
export async function initializeReviewerController(pool:Pool,github:Octokit,config:{organizationId:string;repository:string;installationId:number},runtime:ReturnType<typeof createReviewerRuntime>){
 const {scope,definition,policyDigest,profiles,authorize,admissions}=await initializeReviewerAuthority(pool,github,config,runtime.definition,true);
 const dispatch=new ReviewDispatchStore(pool,scope),summaries=new ReviewSummaryStore(pool,scope),readSnapshot=createRemoteSnapshotReader(github);
 const execute=createAdmittedReviewExecution({pool,scope,admissions,registrations:runtime.registrations,readSnapshot,authorize:async admission=>{
  if(admission.approval.policyDigest!==policyDigest)throw new ReviewAdmissionDenied();
  const request=await authorize(admission.request);return definition.codingProvenance.find(p=>p.headSha===request.subject.headSha)??null;
 }});
 return {admissions,dispatch,summaries,profiles,activities:createAdmittedReviewActivities({dispatch,summaries,execute}),policyDigest};
}
