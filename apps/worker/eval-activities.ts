import type {Octokit} from '@octokit/rest';
import {ApplicationFailure} from '@temporalio/activity';
import {remoteSnapshot} from '../../packages/github/client.ts';
import type {ReviewJob} from '../../packages/github/webhook.ts';
import {planComparison} from '../../packages/evals/plan.ts';
import {compileEvalUnits,EvalPlanConfigurationError,type EvalPlanPolicy} from '../../packages/evals/orchestration.ts';
import type {Store} from '../../packages/storage/postgres.ts';
import {ImmutableEvalConflict,type EvalStore} from '../../packages/storage/evals.ts';

/** Fetch data only in the App controller; evaluator workflow history receives identifiers only. */
export function createEvalReviewActivities(client:Octokit,store:Store,evals:EvalStore,config:{repository:string;installationId:number},policy:EvalPlanPolicy){
  return {
    async stageEvalReview(job:ReviewJob,attemptId:string):Promise<{reviewId:string;comparisonId:string;unitIds:string[]}>{
      if(job.repository!==config.repository||job.installationId!==config.installationId||evals.repository!==config.repository||store.repository!==config.repository||store.organizationId!==evals.organizationId||!Number.isSafeInteger(job.pullRequest)||job.pullRequest<1||! /^[a-f0-9]{40}$/.test(job.baseSha)||! /^[a-f0-9]{40}$/.test(job.headSha)||job.baseSha===job.headSha||! /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(attemptId))throw ApplicationFailure.nonRetryable('Invalid scoped eval review identity','EvalReviewIdentity');
      try{
        const base=await remoteSnapshot(client,job.repository,job.baseSha),head=await remoteSnapshot(client,job.repository,job.headSha);
        const plan=planComparison({repository:job.repository,base,head}),units=compileEvalUnits(plan,base,head,policy);
        const review=await store.save(plan.analysis,job.pullRequest);
        const comparison=await evals.stage(review.id,attemptId,base,head,units,{suiteChanges:plan.suiteChanges,coverageGaps:plan.coverageGaps,selectionGaps:plan.selectionGaps});
        return {reviewId:review.id,comparisonId:comparison.id,unitIds:comparison.unitIds};
      }catch(error){
        if(error instanceof EvalPlanConfigurationError||error instanceof ImmutableEvalConflict)throw ApplicationFailure.nonRetryable('Eval staging configuration or immutable attempt conflict','EvalReviewConfiguration');
        // SDK failure history must never retain Octokit requests, headers or raw repository content.
        throw ApplicationFailure.retryable('Eval review staging unavailable','EvalReviewUnavailable');
      }
    },
  };
}
export type EvalReviewActivities=ReturnType<typeof createEvalReviewActivities>;
