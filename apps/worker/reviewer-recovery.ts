import type {Client} from '@temporalio/client';
import {canonical,digest} from '../../packages/review/engine.ts';
import type {ReviewDispatchStore,ReviewTerminalStatus} from '../../packages/storage/review-dispatch.ts';
import type {ReviewSummaryStore} from '../../packages/storage/review-summaries.ts';
/** Runs independently of workflow lifetime. Unknown/missing Temporal state is
 * retained for retry, never guessed terminal. No uncertain charge is refunded.
 */
export async function reconcileAdmittedReviews(dispatch:Pick<ReviewDispatchStore,'claimRecovery'|'releaseRecovery'|'requestCancellation'|'finishRecovery'>,summaries:Pick<ReviewSummaryStore,'get'>,client:Client,options:{taskQueue:string;shouldStop?:()=>boolean}){
 const statuses:Record<string,ReviewTerminalStatus>={FAILED:'failed',CANCELLED:'cancelled',TERMINATED:'terminated',TIMED_OUT:'timed-out'};
 const rpc=<T>(fn:()=>Promise<T>)=>client.connection.withDeadline(Date.now()+10000,fn);
 for(let i=0;i<10&&!options.shouldStop?.();i++){
  const entry=await dispatch.claimRecovery();if(!entry)return;
  try{
   if(!entry.runId)throw Error();const handle=client.workflow.getHandle(entry.workflowId,entry.runId),state=await rpc(()=>handle.describe());
   if(state.workflowId!==entry.workflowId||state.runId!==entry.runId||state.type!=='reviewAdmittedRequest'||state.taskQueue!==options.taskQueue||state.memo?.admissionDigest!==entry.requestDigest)throw Error();
   if(state.status.name==='RUNNING'){
    if(entry.cancelRequested)await rpc(()=>handle.cancel());await dispatch.releaseRecovery(entry);continue;
   }
   if(state.status.name!=='COMPLETED'&&!statuses[state.status.name])throw Error();
   // Durable intent is visible to a still-running activity even after its parent
   // has been terminated and can no longer deliver normal cancellation.
   if(state.status.name!=='COMPLETED')await dispatch.requestCancellation(entry.id);
   const saved=await summaries.get(entry.id);
   if(state.status.name==='COMPLETED'&&(await rpc(()=>handle.result())!==entry.id||!saved))throw Error();
   const status=saved?'completed':statuses[state.status.name]!;
   await dispatch.finishRecovery(entry,status,saved?.digest??digest(canonical({admissionDigest:entry.requestDigest,runId:entry.runId,status})));
   await dispatch.releaseRecovery(entry);
  }catch{
   try{await dispatch.releaseRecovery(entry);}catch{}
   throw Error('review-recovery-unavailable');
  }
 }
}
