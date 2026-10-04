import {proxyActivities,CancellationScope,ActivityCancellationType,ChildWorkflowCancellationType,ParentClosePolicy,executeChild,isCancellation,sleep} from '@temporalio/workflow';
import type {ReviewJob} from '../../packages/github/webhook.ts';
import type {EvalReviewActivities} from './eval-activities.ts';
const activities=proxyActivities<EvalReviewActivities>({startToCloseTimeout:'10 minutes',cancellationType:ActivityCancellationType.WAIT_CANCELLATION_COMPLETED,retry:{maximumAttempts:5,initialInterval:'2 seconds',maximumInterval:'1 minute'}});
const cleanup=proxyActivities<Pick<EvalReviewActivities,'cancelEvalReview'>>({startToCloseTimeout:'30 seconds',retry:{maximumAttempts:5,initialInterval:'1 second',maximumInterval:'10 seconds'}});
export type PrEvaluationResult={status:'superseded'}|{status:'ready';reviewId:string;comparisonId:string};
/** Lifecycle only; Check publication must recheck current PR identity in its own locked activity. */
export async function evaluatePullRequest(job:ReviewJob,attemptId:string,evalTaskQueue='agentci-eval-v1'):Promise<PrEvaluationResult>{
  if(!await activities.isEvalCurrent(job))return {status:'superseded'};
  // A cancelled stage may have committed in SQL. Retain its returned identifiers before cleanup.
  const staged=await CancellationScope.nonCancellable(()=>activities.stageEvalReview(job,attemptId));
  const childrenScope=new CancellationScope(),monitorScope=new CancellationScope();
  let children:Promise<string[]>|undefined,monitor:Promise<'superseded'>|undefined;
  const cancel=()=>CancellationScope.nonCancellable(async()=>{
    // Preserve the SQL cancellation even if a child was never started or temporarily unreachable.
    childrenScope.cancel();monitorScope.cancel();
    try{await cleanup.cancelEvalReview(job,attemptId,staged.comparisonId);}finally{if(children)await Promise.allSettled([children]);}
  });
  try{
    if(!await activities.isEvalCurrent(job)){await cancel();return {status:'superseded'};}
    children=childrenScope.run(()=>Promise.all(staged.unitIds.map(id=>executeChild('evaluateUnit',{args:[id],taskQueue:evalTaskQueue,workflowId:`agentci:eval:${staged.comparisonId}:${id}`,cancellationType:ChildWorkflowCancellationType.WAIT_CANCELLATION_COMPLETED,parentClosePolicy:ParentClosePolicy.REQUEST_CANCEL}))));
    monitor=monitorScope.run(async()=>{for(;;){await sleep('30 seconds');if(!await activities.isEvalCurrent(job))return 'superseded' as const;}});
    const outcome=await Promise.race([children.then(result=>({status:'completed' as const,result})),monitor.then(()=>({status:'superseded' as const}))]);
    if(outcome.status==='superseded'){await cancel();return {status:'superseded'};}
    if(outcome.result.some((id,index)=>id!==staged.unitIds[index]))throw new Error('Evaluator child identity mismatch');
    if(!await activities.isEvalCurrent(job)){await cancel();return {status:'superseded'};}
    return {status:'ready',reviewId:staged.reviewId,comparisonId:staged.comparisonId};
  }catch(error){await cancel();throw error;}
  finally{
    monitorScope.cancel();
    if(monitor)await CancellationScope.nonCancellable(async()=>{try{await monitor;}catch(error){if(!isCancellation(error))throw error;}});
  }
}
