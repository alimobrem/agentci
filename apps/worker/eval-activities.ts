import type {Octokit} from '@octokit/rest';
import {ApplicationFailure} from '@temporalio/activity';
import {remoteSnapshot,currentPullRequest,publishCheck} from '../../packages/github/client.ts';
import type {ReviewJob} from '../../packages/github/webhook.ts';
import {planComparison} from '../../packages/evals/plan.ts';
import {compileEvalUnits,EvalPlanConfigurationError,type EvalPlanPolicy} from '../../packages/evals/orchestration.ts';
import type {Store} from '../../packages/storage/postgres.ts';
import {ImmutableEvalConflict,type EvalStore} from '../../packages/storage/evals.ts';
import {evalCheckEvidence,evalPublicationKey,publishEvalCheck,publishEvalUnavailable,publishEvalProgress} from '../../packages/github/eval-check.ts';

/** Fetch data only in the App controller; evaluator workflow history receives identifiers only. */
export function createEvalReviewActivities(client:Octokit,store:Store,evals:EvalStore,config:{repository:string;installationId:number;appId?:number;publicUrl?:string},policy:EvalPlanPolicy){
  const scoped=(job:ReviewJob)=>job.repository===config.repository&&job.installationId===config.installationId&&evals.repository===config.repository&&store.repository===config.repository&&store.organizationId===evals.organizationId&&Number.isSafeInteger(job.pullRequest)&&job.pullRequest>0&&/^[a-f0-9]{40}$/.test(job.baseSha)&&/^[a-f0-9]{40}$/.test(job.headSha)&&job.baseSha!==job.headSha;
  const validAttempt=(id:string)=>/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id);
  const canPublish=()=>Number.isSafeInteger(config.appId)&&config.appId!>0&&!!config.publicUrl;
  return {
    async startEvalReview(job:ReviewJob,attemptId:string,reviewId:string,comparisonId:string):Promise<'published'|'superseded'>{
      if(!scoped(job)||!validAttempt(attemptId)||!validAttempt(reviewId)||!validAttempt(comparisonId)||!canPublish())throw ApplicationFailure.nonRetryable('Invalid eval publication identity or configuration','EvalReviewIdentity');
      try{return await store.withPublicationLock(evalPublicationKey(job),async()=>{
        const items=evals.exportComparison(comparisonId);let first;try{first=await items.next();}finally{await items.return(undefined);}
        if(first.done||first.value.type!=='header'||first.value.data.reviewId!==reviewId||first.value.data.organizationId!==store.organizationId)throw new Error('Unknown scoped comparison header');
        return publishEvalProgress(client,config.appId!,job,attemptId,first.value.data,config.publicUrl!);
      });}catch{throw ApplicationFailure.retryable('Eval progress publication unavailable','EvalReviewUnavailable');}
    },
    async publishSemanticEvalReview(job:ReviewJob,reviewId:string):Promise<'published'|'superseded'>{
      if(!scoped(job)||!validAttempt(reviewId)||!canPublish())throw ApplicationFailure.nonRetryable('Invalid semantic publication identity or configuration','EvalReviewIdentity');
      try{
        const record=await store.evidence(reviewId);
        if(!record||record.evidence.subject.pullRequest!==job.pullRequest||record.analysis.baseSha!==job.baseSha||record.analysis.headSha!==job.headSha)throw new Error('Semantic review identity mismatch');
        return await store.withPublicationLock(`${job.repository}:${job.pullRequest}:${job.baseSha}:${job.headSha}`,async()=>{
          if(!await currentPullRequest(client,job))return 'superseded';
          return publishCheck(client,config.appId!,job,record.analysis,`${config.publicUrl}/v1/evidence/${reviewId}`,'agentci/evals');
        });
      }catch{throw ApplicationFailure.retryable('Semantic review publication unavailable','EvalReviewUnavailable');}
    },
    async publishEvalReview(job:ReviewJob,attemptId:string,reviewId:string,comparisonId:string):Promise<'published'|'superseded'>{
      if(!scoped(job)||!validAttempt(attemptId)||!validAttempt(reviewId)||!validAttempt(comparisonId)||!canPublish())throw ApplicationFailure.nonRetryable('Invalid eval publication identity or configuration','EvalReviewIdentity');
      try{
        return await store.withPublicationLock(evalPublicationKey(job),async()=>{
          const evidence=await evalCheckEvidence(evals.exportComparison(comparisonId),comparisonId,{organizationId:store.organizationId,reviewId,attemptId,repository:job.repository,pullRequest:job.pullRequest,baseSha:job.baseSha,headSha:job.headSha});
          if(!await currentPullRequest(client,job))return 'superseded';
          return publishEvalCheck(client,config.appId!,job,attemptId,evidence,config.publicUrl!);
        });
      }catch{throw ApplicationFailure.retryable('Eval publication unavailable','EvalReviewUnavailable');}
    },
    async failEvalReview(job:ReviewJob,attemptId:string):Promise<'published'|'superseded'>{
      if(!scoped(job)||!validAttempt(attemptId)||!canPublish())throw ApplicationFailure.nonRetryable('Invalid eval publication identity or configuration','EvalReviewIdentity');
      try{return await store.withPublicationLock(evalPublicationKey(job),async()=>{
        const plan=await evals.recoveryPlan(attemptId);let retained;
        if(plan){
          const items=evals.exportComparison(plan.id);let first;
          try{first=await items.next();}finally{await items.return(undefined);}
          if(first.done||first.value.type!=='header')throw new Error('Retained comparison unavailable');
          retained={header:first.value.data,publicUrl:config.publicUrl!};
        }
        return publishEvalUnavailable(client,config.appId!,job,attemptId,'unavailable',retained);
      });}
      catch{throw ApplicationFailure.retryable('Eval failure publication unavailable','EvalReviewUnavailable');}
    },
    async isEvalCurrent(job:ReviewJob):Promise<boolean>{
      if(!scoped(job))throw ApplicationFailure.nonRetryable('Invalid scoped eval review identity','EvalReviewIdentity');
      try{return await currentPullRequest(client,job);}catch{throw ApplicationFailure.retryable('PR identity lookup unavailable','EvalReviewUnavailable');}
    },
    async cancelEvalReview(job:ReviewJob,attemptId:string,comparisonId:string):Promise<void>{
      if(!scoped(job)||!validAttempt(attemptId)||!validAttempt(comparisonId))throw ApplicationFailure.nonRetryable('Invalid scoped eval review identity','EvalReviewIdentity');
      try{
        // Read only the header, then close the snapshot transaction before the cancellation write.
        const items=evals.exportComparison(comparisonId);let first;
        try{first=await items.next();}finally{await items.return(undefined);}
        if(first.done||first.value.type!=='header')throw ApplicationFailure.nonRetryable('Unknown eval comparison identity','EvalReviewIdentity');
        const header=first.value.data;
        if(header.attemptId!==attemptId||header.subject.repository!==job.repository||header.subject.pullRequest!==job.pullRequest||header.subject.baseSha!==job.baseSha||header.subject.headSha!==job.headSha)throw ApplicationFailure.nonRetryable('Eval comparison identity mismatch','EvalReviewIdentity');
        await store.withPublicationLock(evalPublicationKey(job),async()=>{
          await evals.cancel(comparisonId);
          if(canPublish())await publishEvalUnavailable(client,config.appId!,job,attemptId,'cancelled',{header,publicUrl:config.publicUrl!});
        });
      }catch(error){if(error instanceof ApplicationFailure)throw error;throw ApplicationFailure.retryable('Eval cancellation unavailable','EvalReviewUnavailable');}
    },
    async stageEvalReview(job:ReviewJob,attemptId:string):Promise<{reviewId:string;comparisonId:string;unitIds:string[]}>{
      if(!scoped(job)||!validAttempt(attemptId))throw ApplicationFailure.nonRetryable('Invalid scoped eval review identity','EvalReviewIdentity');
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
