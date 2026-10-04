import {WorkflowExecutionAlreadyStartedError,type Client} from '@temporalio/client';
import type {Store} from '../../packages/storage/postgres.ts';
export function evalReviewTimeout(env:NodeJS.ProcessEnv=process.env):number{
  const value=Number(env.AGENTCI_EVAL_REVIEW_TIMEOUT_MS??86400000);
  if(!Number.isSafeInteger(value)||value<1000||value>604800000)throw new Error('Invalid operator eval review deadline');
  return value;
}
/** Start-before-ack plus deterministic workflow ID fences ambiguous starts and dispatcher restarts. */
export async function dispatchPendingReviews(store:Store,client:Client,options:{taskQueue:string;evalTaskQueue?:string;timeoutMs:number}):Promise<void>{
  evalReviewTimeout({AGENTCI_EVAL_REVIEW_TIMEOUT_MS:String(options.timeoutMs)});
  for(const entry of await store.pending()){
    const job=entry.payload;
    try{
      await client.workflow.start('reviewPullRequestWithEvals',{args:[job,entry.id,{evalTaskQueue:options.evalTaskQueue??'agentci-eval-v1',timeoutMs:options.timeoutMs}],taskQueue:options.taskQueue,workflowId:`agentci:${job.repository}:${entry.id}`,workflowIdReusePolicy:'ALLOW_DUPLICATE_FAILED_ONLY'});
    }catch(error){if(!(error instanceof WorkflowExecutionAlreadyStartedError))throw error;}
    await store.dispatched(entry.id);
  }
}
