import {WorkflowExecutionAlreadyStartedError,type Client} from '@temporalio/client';
import type {ReviewDispatchStore} from '../../packages/storage/review-dispatch.ts';
/** Start-before-ack: an RPC failure retains the lease and admission. Once the
 * lease expires, retry resolves the exact workflow before acknowledging it.
 * Only controller-selected task queues and execution bounds are accepted here.
 */
export async function dispatchAdmittedReviews(store:Pick<ReviewDispatchStore,'claim'|'get'|'acknowledge'>,client:Client,options:{taskQueue:string;timeoutMs:number;shouldStop?:()=>boolean}){
 if(typeof options.taskQueue!=='string'||!options.taskQueue||options.taskQueue.length>256||!Number.isSafeInteger(options.timeoutMs)||options.timeoutMs<1000||options.timeoutMs>86400000)throw Error('invalid-review-dispatch-options');
 const rpc=<T>(fn:()=>Promise<T>)=>client.connection.withDeadline(Date.now()+10000,fn);
 for(let i=0;i<10&&!options.shouldStop?.();i++){
  const entry=await store.claim();if(!entry)return;
  try{
   let runId:string;
   try{const started=await rpc(()=>client.workflow.start('reviewAdmittedRequest',{args:[entry.id],workflowId:entry.workflowId,taskQueue:options.taskQueue,workflowIdReusePolicy:'REJECT_DUPLICATE',workflowExecutionTimeout:options.timeoutMs,memo:{admissionDigest:entry.requestDigest}}));runId=started.firstExecutionRunId;}
   catch(error){if(!(error instanceof WorkflowExecutionAlreadyStartedError))throw error;const existing=await rpc(()=>client.workflow.getHandle(entry.workflowId).describe());if(existing.workflowId!==entry.workflowId||existing.type!=='reviewAdmittedRequest'||existing.taskQueue!==options.taskQueue||existing.memo?.admissionDigest!==entry.requestDigest)throw Error('review-workflow-identity-conflict');runId=existing.runId;}
   await store.acknowledge(entry,runId);
   // A cancellation can arrive while start is in flight. Re-read durable intent.
   const current=await store.get(entry.id);if(!current||current.runId!==runId)throw Error('review-workflow-identity-conflict');
   if(current.cancelRequested&&!current.terminal)await rpc(()=>client.workflow.getHandle(entry.workflowId,runId).cancel());
  }catch{throw Error('review-dispatch-unavailable');}
 }
}
