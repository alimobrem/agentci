import {proxyActivities,CancellationScope,ActivityCancellationType,workflowInfo,isCancellation,ActivityFailure,ApplicationFailure,CancelledFailure} from '@temporalio/workflow';
export interface AdmittedReviewActivities {
 runAdmittedReview(id:string):Promise<string>;
 finishAdmittedReview(id:string,runId:string,status:'completed'|'failed'|'cancelled',resultDigest:string|null):Promise<void>;
}
const activities=proxyActivities<AdmittedReviewActivities>({startToCloseTimeout:'25 hours',heartbeatTimeout:'30 seconds',cancellationType:ActivityCancellationType.WAIT_CANCELLATION_COMPLETED,retry:{maximumAttempts:5,initialInterval:'1 second',maximumInterval:'10 seconds'}});
const finish=proxyActivities<Pick<AdmittedReviewActivities,'finishAdmittedReview'>>({startToCloseTimeout:'30 seconds',retry:{maximumAttempts:5,initialInterval:'1 second',maximumInterval:'10 seconds'}});
/** Workflow history carries only an admission ID and final digest. Source,
 * provider inputs, credentials and raw outputs stay inside trusted activities.
 */
export async function reviewAdmittedRequest(id:string):Promise<string>{
 const runId=workflowInfo().runId;
 let resultDigest:string;
 try{resultDigest=await activities.runAdmittedReview(id);if(!/^sha256:[a-f0-9]{64}$/.test(resultDigest))throw Error('invalid-review-result-digest');}
 catch(error){const cancelled=isCancellation(error)||(error instanceof ActivityFailure&&error.cause instanceof ApplicationFailure&&error.cause.type==='ReviewCancelled');await CancellationScope.nonCancellable(()=>finish.finishAdmittedReview(id,runId,cancelled?'cancelled':'failed',null));if(cancelled)throw new CancelledFailure('Review cancelled');throw error;}
 // Retain completed work even if cancellation arrives during finalization.
 await CancellationScope.nonCancellable(()=>finish.finishAdmittedReview(id,runId,'completed',resultDigest));
 return id;
}
