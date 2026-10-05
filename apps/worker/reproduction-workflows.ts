import {proxyActivities,CancellationScope,ActivityCancellationType,ChildWorkflowCancellationType,ParentClosePolicy,executeChild,CancelledFailure} from '@temporalio/workflow';
import type {ReproductionActivities} from './reproduction-activities.ts';
const activities=proxyActivities<ReproductionActivities>({startToCloseTimeout:'2 minutes',cancellationType:ActivityCancellationType.WAIT_CANCELLATION_COMPLETED,retry:{maximumAttempts:5,initialInterval:'1 second',maximumInterval:'10 seconds'}});
/** Controller history contains IDs and dispositions, never source, assertions or raw reports. */
export async function reproduceFinding(id:string,evalTaskQueue='agentci-eval-v1'){
 let child:Promise<string>|undefined;
 const scope=new CancellationScope();
 try{
  // Retain staged identifiers even when cancellation arrives after the SQL commit.
  const staged=await CancellationScope.nonCancellable(()=>activities.stageFindingReproduction(id));
  if(CancellationScope.current().consideredCancelled)throw new CancelledFailure('Reproduction cancelled');
  child=scope.run(()=>executeChild('evaluateUnit',{args:[staged.unitId],taskQueue:evalTaskQueue,workflowId:`agentci:reproduction:${id}:${staged.unitId}`,cancellationType:ChildWorkflowCancellationType.WAIT_CANCELLATION_COMPLETED,parentClosePolicy:ParentClosePolicy.REQUEST_CANCEL}));
  if(await child!==staged.unitId)throw new Error('Reproduction evaluator identity mismatch');
  return await activities.finalizeFindingReproduction(id);
 }catch(error){
  await CancellationScope.nonCancellable(async()=>{
   scope.cancel();
   const cancelled=await activities.cancelFindingReproduction(id);
   if(child)await Promise.allSettled([child]);
   for(const unitId of cancelled.unitIds)await executeChild('cleanupCancelledEvalUnit',{args:[unitId],taskQueue:evalTaskQueue,workflowId:`agentci:reproduction-cleanup:${id}:${unitId}`,cancellationType:ChildWorkflowCancellationType.WAIT_CANCELLATION_COMPLETED,parentClosePolicy:ParentClosePolicy.REQUEST_CANCEL});
   if(cancelled.jobId)await activities.finalizeFindingReproduction(id);
  });
  throw error;
 }
}
