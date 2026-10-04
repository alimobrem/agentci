import type {Octokit} from '@octokit/rest';import {ApplicationFailure} from '@temporalio/activity';
import type {ReviewJob} from '../../packages/github/webhook.ts';import {verifyExport} from '../../packages/github/dogfood.ts';import {evalCheckEvidence} from '../../packages/github/eval-check.ts';
import type {Store} from '../../packages/storage/postgres.ts';import type {EvalStore} from '../../packages/storage/evals.ts';import type {EvalPlanPolicy} from '../../packages/evals/orchestration.ts';import {createEvalReviewActivities,type EvalReviewActivities} from './eval-activities.ts';
/** Same parent lifecycle; terminal publication is deferred until the official artifact upload. */
export function createHostedReviewActivities(client:Octokit,store:Store,evals:EvalStore,config:{repository:string;installationId:number},policy:EvalPlanPolicy):EvalReviewActivities{
 const base=createEvalReviewActivities(client,store,evals,config,policy);
 const unavailable=()=>ApplicationFailure.retryable('Hosted evidence preparation unavailable','HostedReviewUnavailable');
 return {...base,
  async publishSemanticEvalReview(job:ReviewJob,id:string){
   try{if(!await base.isEvalCurrent(job))return 'superseded';const record=await store.evidence(id);if(!record)throw new Error();verifyExport(job,record,config.repository,config.installationId);return 'published';}catch{throw unavailable();}
  },
  async startEvalReview(job:ReviewJob){return await base.isEvalCurrent(job)?'published':'superseded';},
  async publishEvalReview(job:ReviewJob,attemptId:string,reviewId:string,comparisonId:string){
   try{if(!await base.isEvalCurrent(job))return 'superseded';await evalCheckEvidence(evals.exportComparison(comparisonId),comparisonId,{organizationId:store.organizationId,reviewId,attemptId,repository:job.repository,pullRequest:job.pullRequest,baseSha:job.baseSha,headSha:job.headSha});return 'published';}catch{throw unavailable();}
  },
  async failEvalReview(job:ReviewJob){return await base.isEvalCurrent(job)?'published':'superseded';},
 };
}
