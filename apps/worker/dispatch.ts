import {WorkflowExecutionAlreadyStartedError,type Client} from '@temporalio/client';
import type {ReviewAttempts} from '../../packages/storage/review-attempts.ts';
import type {Store} from '../../packages/storage/postgres.ts';
export function evalReviewTimeout(env:NodeJS.ProcessEnv=process.env):number{
  const value=Number(env.AGENTCI_EVAL_REVIEW_TIMEOUT_MS??86400000);
  if(!Number.isSafeInteger(value)||value<1000||value>604800000)throw new Error('Invalid operator eval review deadline');
  return value;
}
/** Start-before-ack plus deterministic workflow ID fences ambiguous starts and dispatcher restarts. */
export async function dispatchPendingReviews(store:Store,client:Client,options:{taskQueue:string;evalTaskQueue?:string;timeoutMs:number;attempts:ReviewAttempts}):Promise<void>{
  evalReviewTimeout({AGENTCI_EVAL_REVIEW_TIMEOUT_MS:String(options.timeoutMs)});
  for(const entry of await store.pending()){
    const job=entry.payload,workflowId=`agentci:${job.repository}:${entry.id}`,evalTaskQueue=options.evalTaskQueue??'agentci-eval-v1';
    await options.attempts.track(entry.id,workflowId,evalTaskQueue);
    let runId:string;
    try{
      const started=await client.workflow.start('reviewPullRequestWithEvals',{args:[job,entry.id,{evalTaskQueue:options.evalTaskQueue??'agentci-eval-v1',timeoutMs:options.timeoutMs}],taskQueue:options.taskQueue,workflowId,workflowIdReusePolicy:'REJECT_DUPLICATE'});runId=started.firstExecutionRunId;
    }catch(error){if(!(error instanceof WorkflowExecutionAlreadyStartedError))throw error;const existing=await client.workflow.getHandle(workflowId).describe();if(existing.type!=='reviewPullRequestWithEvals'||existing.workflowId!==workflowId)throw new Error('Review workflow identity conflict');runId=existing.runId;}
    await options.attempts.bindRun(entry.id,runId);
    await store.dispatched(entry.id);
  }
}
