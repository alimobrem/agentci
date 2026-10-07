import {WorkflowExecutionAlreadyStartedError,WorkflowNotFoundError,type Client} from '@temporalio/client';
import type {ReproductionDispatchStore,ReproductionDispatchClaim} from '../../packages/storage/reproduction-dispatch.ts';
import type {AdmittedReproductionActivities,AdmittedReproductionCleanup,AdmittedReproductionInspection} from './admitted-reproduction-workflows.ts';
import {observeReproductionRun,reproductionRpc,reproductionStartMemo} from './reproduction-consumer-dispatch.ts';
export interface ReproductionRuntimeObservation {runId:string|null;status:string;units:{unitId:string;workflowId:string;runId:string|null;status:string}[];cleanup:{unitId:string;workflowId:string;runId:string}[]}
/** Independent cleanup survives parent termination. A matching existing run is reconciled, never replaced. */
export async function cleanupAdmittedReproduction(client:Client,operationId:string,cleanup:AdmittedReproductionCleanup){
 const completed:ReproductionRuntimeObservation['cleanup']=[];
 for(const unit of cleanup.unitIds){
  const validate=(state:Awaited<ReturnType<ReturnType<Client['workflow']['getHandle']>['describe']>>)=>{
   if(state.workflowId!==unit.cleanupWorkflowId||state.type!=='cleanupCancelledEvalUnit'||state.taskQueue!==cleanup.evalTaskQueue||!state.memo||Object.keys(state.memo).sort().join(',')!=='operationId,unitId'||state.memo.operationId!==operationId||state.memo?.unitId!==unit.unitId)throw Error('reproduction-cleanup-identity-conflict');return state;
  };
  const describe=async()=>validate(await reproductionRpc(client,()=>client.workflow.getHandle(unit.cleanupWorkflowId).describe()));
  let state:Awaited<ReturnType<typeof describe>>|undefined;try{state=await describe();}catch(error){if(!(error instanceof WorkflowNotFoundError))throw error;}
  if(!state||['FAILED','TIMED_OUT','TERMINATED','CANCELLED'].includes(state.status.name)){
   // Validate an existing closed attempt before retrying; never replace a running or successful run.
   const reuse=state?'ALLOW_DUPLICATE_FAILED_ONLY':'REJECT_DUPLICATE';
   try{await reproductionRpc(client,()=>client.workflow.start('cleanupCancelledEvalUnit',{args:[unit.unitId],workflowId:unit.cleanupWorkflowId,taskQueue:cleanup.evalTaskQueue,workflowIdReusePolicy:reuse,workflowExecutionTimeout:'10 minutes',memo:{operationId,unitId:unit.unitId}}));}catch(error){if(!(error instanceof WorkflowExecutionAlreadyStartedError))throw error;}
   state=await describe();
  }
  const handle=client.workflow.getHandle(unit.cleanupWorkflowId,state.runId);
  if(state.status.name!=='COMPLETED')throw Error('reproduction-cleanup-pending');
  if(await reproductionRpc(client,()=>handle.result())!==unit.unitId)throw Error('reproduction-cleanup-identity-conflict');
  completed.push({unitId:unit.unitId,workflowId:state.workflowId,runId:state.runId});
 }return completed;
}
async function terminalUnits(client:Client,operationId:string,inspection:AdmittedReproductionInspection){
 const units:ReproductionRuntimeObservation['units']=[];
 for(const unit of inspection.unitIds){
  let state;try{state=await reproductionRpc(client,()=>client.workflow.getHandle(unit.unitWorkflowId).describe());}catch(error){if(!(error instanceof WorkflowNotFoundError))throw error;units.push({unitId:unit.unitId,workflowId:unit.unitWorkflowId,runId:null,status:'NOT_STARTED'});continue;}
  if(state.workflowId!==unit.unitWorkflowId||state.type!=='evaluateUnit'||state.taskQueue!==inspection.evalTaskQueue||state.memo?.operationId!==operationId||state.memo?.unitId!==unit.unitId)throw Error('reproduction-unit-identity-conflict');
  if(!['COMPLETED','FAILED','CANCELLED','TERMINATED','TIMED_OUT'].includes(state.status.name))throw Error('reproduction-unit-not-terminal');
  if(state.status.name==='COMPLETED'&&await reproductionRpc(client,()=>client.workflow.getHandle(state.workflowId,state.runId).result())!==unit.unitId)throw Error('reproduction-unit-result-conflict');
  units.push({unitId:unit.unitId,workflowId:state.workflowId,runId:state.runId,status:state.status.name});
 }return units;
}
export type ReproductionRecoveryPort=Pick<ReproductionDispatchStore,'claim'|'attempts'|'adoptObservedRun'|'get'|'release'|'renew'>;
/** Remote terminal+cleanup observations gate the separate durable evidence settlement. */
export async function reconcileAdmittedReproductions(store:ReproductionRecoveryPort,client:Client,activities:AdmittedReproductionActivities,options:{settle:(entry:ReproductionDispatchClaim)=>Promise<void>;markRuntimeQuiescent:(entry:ReproductionDispatchClaim,observation:ReproductionRuntimeObservation)=>Promise<void>;shouldStop?:()=>boolean}){
 for(let i=0;i<10&&!options.shouldStop?.();i++){
  const entry=await store.claim('recovery');if(!entry)return;
  try{
   if(!entry.binding||!entry.attempt){
    if(!entry.cancellation){await store.release(entry);continue;}
    const cleanup=await activities.cancelAdmittedReproduction(entry.operationId,undefined,'cancelled');if(cleanup.staged||cleanup.unitIds.length)throw Error('reproduction-unbound-execution-conflict');
    await options.markRuntimeQuiescent(entry,{runId:null,status:'NOT_STARTED',units:[],cleanup:[]});await options.settle(entry);continue;
   }
   let observed:Awaited<ReturnType<typeof observeReproductionRun>>;
   try{observed=await observeReproductionRun(store,client,entry);}catch(error){
    if(!(error instanceof WorkflowNotFoundError))throw error;
    if(!entry.cancellation||entry.runId){await store.release(entry);continue;}
    // NotFound cannot prove no delayed start. Occupy the deterministic ID with the retained
    // cancellation-fenced attempt; staging must consume durable cancellation before authority.
    try{await reproductionRpc(client,()=>client.workflow.start('reproduceAdmittedFinding',{args:[entry.operationId,entry.attempt!.token],workflowId:entry.workflowId,taskQueue:entry.binding!.taskQueue,workflowIdReusePolicy:'REJECT_DUPLICATE',workflowExecutionTimeout:'10 minutes',memo:reproductionStartMemo(entry)}));}catch{}
    observed=await observeReproductionRun(store,client,entry);
   }
   if(!entry.runId){await store.adoptObservedRun(entry,{attemptToken:observed.attemptToken,runId:observed.state.runId});continue;}
   const token=observed.attemptToken,status=observed.state.status.name;
   if(status==='RUNNING'){
    const live=await activities.checkAdmittedReproduction(entry.operationId,token);
    if(entry.cancellation||!live.allowed){await activities.cancelAdmittedReproduction(entry.operationId,token,entry.cancellation?'cancelled':'denied');await reproductionRpc(client,()=>client.workflow.getHandle(entry.workflowId,entry.runId!).cancel());}
    await store.release(entry);continue;
   }
   if(!['COMPLETED','FAILED','CANCELLED','TERMINATED','TIMED_OUT'].includes(status))throw Error('reproduction-terminal-unknown');
   if(status==='COMPLETED'&&await reproductionRpc(client,()=>client.workflow.getHandle(entry.workflowId,entry.runId!).result())!==entry.operationId)throw Error('reproduction-workflow-result-conflict');
   let cleanup:ReproductionRuntimeObservation['cleanup']=[];
   if(status!=='COMPLETED'){const plan=await activities.cancelAdmittedReproduction(entry.operationId,token,entry.cancellation?'cancelled':'unavailable');cleanup=await cleanupAdmittedReproduction(client,entry.operationId,plan);}
   const inspection=await activities.inspectAdmittedReproduction(entry.operationId,token),units=await terminalUnits(client,entry.operationId,inspection);
   await activities.finalizeAdmittedReproduction(entry.operationId,token);await store.renew(entry);
   await options.markRuntimeQuiescent(entry,{runId:entry.runId,status,units,cleanup});await options.settle(entry);
  }catch{try{await store.release(entry);}catch{}throw Error('reproduction-recovery-unavailable');}
 }
}
