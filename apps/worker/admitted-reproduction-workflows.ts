import {proxyActivities,CancellationScope,ActivityCancellationType,ChildWorkflowCancellationType,ParentClosePolicy,executeChild,CancelledFailure,sleep} from '@temporalio/workflow';
export type ReproductionStopCause='cancelled'|'denied'|'unavailable'|'superseded';
export interface AdmittedReproductionCleanup {unitIds:{unitId:string;unitWorkflowId:string;cleanupWorkflowId:string}[];evalTaskQueue:string;staged:boolean}
export interface AdmittedReproductionInspection {jobId:string|null;evalTaskQueue:string;unitIds:{unitId:string;unitWorkflowId:string;cleanupWorkflowId:string}[]}
export interface AdmittedReproductionActivities {
 inspectAdmittedReproduction(operationId:string,startAttemptToken?:string):Promise<AdmittedReproductionInspection>;
 stageAdmittedReproduction(operationId:string,startAttemptToken:string):Promise<{kind:'staged';jobId:string;unitId:string;unitWorkflowId:string;cleanupWorkflowId:string;evalTaskQueue:string}|{kind:'not-started'}>;
 checkAdmittedReproduction(operationId:string,startAttemptToken:string):Promise<{allowed:boolean}>;
 finalizeAdmittedReproduction(operationId:string,startAttemptToken:string):Promise<void>;
 cancelAdmittedReproduction(operationId:string,startAttemptToken:string|undefined,cause:ReproductionStopCause):Promise<AdmittedReproductionCleanup>;
}
const activities=proxyActivities<AdmittedReproductionActivities>({startToCloseTimeout:'2 minutes',cancellationType:ActivityCancellationType.WAIT_CANCELLATION_COMPLETED,retry:{maximumAttempts:5,initialInterval:'1 second',maximumInterval:'10 seconds'}});
/** Only retained IDs cross workflow history. Identity derivation and authority stay in host activities. */
export async function reproduceAdmittedFinding(operationId:string,startAttemptToken:string):Promise<string>{
 const childScope=new CancellationScope(),monitorScope=new CancellationScope();let child:Promise<string>|undefined,monitor:Promise<void>|undefined,cause:ReproductionStopCause='unavailable';
 try{
  const staged=await CancellationScope.nonCancellable(()=>activities.stageAdmittedReproduction(operationId,startAttemptToken));
  if(staged.kind==='not-started')return operationId;
  if(CancellationScope.current().consideredCancelled){cause='cancelled';throw new CancelledFailure('Reproduction cancelled');}
  if(!(await activities.checkAdmittedReproduction(operationId,startAttemptToken)).allowed){cause='denied';throw new CancelledFailure('Reproduction not authorized');}
  child=childScope.run(()=>executeChild('evaluateUnit',{args:[staged.unitId],taskQueue:staged.evalTaskQueue,workflowId:staged.unitWorkflowId,memo:{operationId,unitId:staged.unitId},cancellationType:ChildWorkflowCancellationType.WAIT_CANCELLATION_COMPLETED,parentClosePolicy:ParentClosePolicy.REQUEST_CANCEL}));
  monitor=monitorScope.run(async()=>{for(;;){await sleep('1 second');if(!(await activities.checkAdmittedReproduction(operationId,startAttemptToken)).allowed){cause='denied';throw new CancelledFailure('Reproduction no longer authorized');}}});
  // A permission outage fails the monitor after bounded activity retries; it never permits unchecked execution indefinitely.
  const result=await Promise.race([child,monitor]);if(result!==staged.unitId)throw Error('Reproduction evaluator identity mismatch');
  monitorScope.cancel();await Promise.allSettled([monitor]);
  await activities.finalizeAdmittedReproduction(operationId,startAttemptToken);return operationId;
 }catch(error){
  if(CancellationScope.current().consideredCancelled)cause='cancelled';
  await CancellationScope.nonCancellable(async()=>{
   monitorScope.cancel();childScope.cancel();
   const cancelled=await activities.cancelAdmittedReproduction(operationId,startAttemptToken,cause);
   await Promise.allSettled([...(child?[child]:[]),...(monitor?[monitor]:[])]);
   for(const unit of cancelled.unitIds){const result=await executeChild('cleanupCancelledEvalUnit',{args:[unit.unitId],taskQueue:cancelled.evalTaskQueue,workflowId:unit.cleanupWorkflowId,memo:{operationId,unitId:unit.unitId},cancellationType:ChildWorkflowCancellationType.WAIT_CANCELLATION_COMPLETED,parentClosePolicy:ParentClosePolicy.REQUEST_CANCEL});if(result!==unit.unitId)throw Error('Reproduction cleanup identity mismatch');}
   await activities.finalizeAdmittedReproduction(operationId,startAttemptToken);
  });throw error;
 }
}
