import {WorkflowNotFoundError,type Client} from '@temporalio/client';
import {canonical,digest} from '../../packages/review/engine.ts';
import type {ReproductionDispatchStore,ReproductionDispatchClaim} from '../../packages/storage/reproduction-dispatch.ts';
import type {ReproductionConfigIdentity} from '../../packages/findings/reproduction-config.ts';
export type ReproductionDispatchPort=Pick<ReproductionDispatchStore,'claim'|'bind'|'attempts'|'adoptObservedRun'|'get'|'renew'|'release'>;
export const reproductionRpc=<T>(client:Client,fn:()=>Promise<T>)=>client.connection.withDeadline(Date.now()+10000,fn);
export function reproductionStartMemo(entry:ReproductionDispatchClaim){if(!entry.binding||!entry.attempt)throw Error('reproduction-workflow-identity-conflict');return {schemaVersion:'v1alpha1',bindingDigest:digest(canonical(entry.binding)),startAttemptToken:entry.attempt.token,config:entry.attempt.config};}
/** Verify even closed runs before adopting. An old delayed start can win after a new lease rebinds. */
export async function observeReproductionRun(store:Pick<ReproductionDispatchStore,'attempts'>,client:Client,entry:ReproductionDispatchClaim){
 const state=await reproductionRpc(client,()=>client.workflow.getHandle(entry.workflowId,entry.runId??undefined).describe()),binding=entry.binding,memo=state.memo;
 if(!binding||state.workflowId!==entry.workflowId||state.type!=='reproduceAdmittedFinding'||state.taskQueue!==binding.taskQueue||!memo||Object.keys(memo).sort().join(',')!=='bindingDigest,config,schemaVersion,startAttemptToken'||memo.schemaVersion!=='v1alpha1'||memo.bindingDigest!==digest(canonical(binding))||typeof memo.startAttemptToken!=='string'||(entry.runId&&state.runId!==entry.runId))throw Error('reproduction-workflow-identity-conflict');
 let after:string|undefined,found=false;
 for(;;){const page=await store.attempts(entry.operationId,after);if(page.some(a=>a.token===memo.startAttemptToken&&canonical(a.config)===canonical(memo.config))){found=true;break;}if(page.length<100)break;after=page.at(-1)!.token;}
 if(!found)throw Error('reproduction-workflow-identity-conflict');return {state,attemptToken:memo.startAttemptToken};
}
/** No remote call occurs inside SQL. Unknown RPC outcomes retain the lease for reconciliation. */
export async function dispatchAdmittedReproductions(store:ReproductionDispatchPort,client:Client,options:{taskQueue:string;evalTaskQueue:string;config:ReproductionConfigIdentity;timeoutMs:number;shouldStop?:()=>boolean}){
 if(!Number.isSafeInteger(options.timeoutMs)||options.timeoutMs<1000||options.timeoutMs>86400000)throw Error('invalid-reproduction-dispatch-options');
 for(let i=0;i<10&&!options.shouldStop?.();i++){
  let entry=await store.claim();if(!entry)return;
  try{
   let observed:Awaited<ReturnType<typeof observeReproductionRun>>;
   try{observed=await observeReproductionRun(store,client,entry);}catch(error){
    if(!(error instanceof WorkflowNotFoundError))throw error;
    entry=await store.bind(entry,options);await store.renew(entry);
    // A timed-out/lost start may nevertheless succeed. Always resolve its deterministic ID before ack.
    try{await reproductionRpc(client,()=>client.workflow.start('reproduceAdmittedFinding',{args:[entry!.operationId,entry!.attempt!.token],workflowId:entry!.workflowId,taskQueue:options.taskQueue,workflowIdReusePolicy:'REJECT_DUPLICATE',workflowExecutionTimeout:options.timeoutMs,memo:reproductionStartMemo(entry!)}));}catch{ /* describe below is the sole authority for an ambiguous start */ }
    observed=await observeReproductionRun(store,client,entry);
   }
   const retained=await store.adoptObservedRun(entry,{attemptToken:observed.attemptToken,runId:observed.state.runId});
   const current=await store.get(entry.operationId);if(!current||current.runId!==retained.runId)throw Error('reproduction-workflow-identity-conflict');
   if(current.cancellation&&observed.state.status.name==='RUNNING')await reproductionRpc(client,()=>client.workflow.getHandle(entry!.workflowId,retained.runId!).cancel());
  }catch{throw Error('reproduction-dispatch-unavailable');}
 }
}
