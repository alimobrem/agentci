import {canonical} from '../../packages/review/engine.ts';
import {EvalStore,EvalLeaseLost} from '../../packages/storage/evals.ts';
import {executeSuite} from '../../packages/evals/execution.ts';
import {reapPriorEvalContainers,reapCancelledEvalContainers,containerEngine,validateRunnerPolicy,type ContainerEngine,type RunnerPolicy} from '../../packages/evals/runner.ts';
import {validateHttpProvider} from '../../packages/evals/http.ts';
import type {EvalRun} from '../../packages/evals/contracts.ts';
export class EvalUnitBusy extends Error {}
export class EvalUnitCancelled extends Error {}
export class EvalUnitConfigurationError extends Error {}
export interface UnitWorkerOptions {
  signal?:AbortSignal;heartbeat?:(progress:{unitId:string;completedTrials:number})=>void;
  leaseSeconds?:number;maintenanceMs?:number;maxTrials?:number;
  cancelPermanently?:()=>boolean;
}
/** Unit IDs are the only workflow payload; inputs and normalized observations stay in scoped SQL storage. */
export async function executeStoredUnit(store:EvalStore,id:string,policy:RunnerPolicy,options:UnitWorkerOptions={}):Promise<EvalRun> {
  await store.ready();const unit=await store.unit(id);
  if(!unit)throw new Error('Unknown scoped eval unit');
  if(unit.result)return unit.result;
  if(unit.cancelRequested||unit.status==='cancelled'||options.signal?.aborted)throw new EvalUnitCancelled('Eval unit cancelled');
  const def=unit.definition;
  const provider=def.suite.spec.runner.adapter==='http'?policy.httpProviders?.filter(p=>p.id===def.suite.spec.runner.provider):undefined;
  if(provider){if(provider.length!==1)throw new EvalUnitConfigurationError('Operator provider unavailable');validateHttpProvider(provider[0]!);}
  const identity=provider?{runnerProvider:{id:provider[0]!.id,revision:provider[0]!.revision}}:{runnerImage:policy.image};
  if(canonical(identity)!==canonical(def.runner))throw new EvalUnitConfigurationError('Operator runner does not match immutable eval unit');
  if(def.executionLimits){
    const operator=validateRunnerPolicy(policy),cap=def.executionLimits;
    if(provider||cap.engine!==operator.engine||cap.memoryMb>operator.memoryMb||cap.cpus>operator.cpus||cap.pids>operator.pids||cap.maxTrials>(options.maxTrials??100))throw new EvalUnitConfigurationError('Approved execution limits exceed operator bounds');
    policy={...policy,memoryMb:cap.memoryMb,cpus:cap.cpus,pids:cap.pids};
  }
  const seconds=options.leaseSeconds??30,period=options.maintenanceMs??5000;
  if(!Number.isSafeInteger(period)||period<100||period>=seconds*1000/2)throw new Error('Invalid eval lease maintenance interval');
  const token=await store.claim(id,seconds);if(!token)throw new EvalUnitBusy('Eval unit already leased');
  const ownership={unitId:id,leaseToken:token},lost=new AbortController(),signal=options.signal?AbortSignal.any([options.signal,lost.signal]):lost.signal;
  let failure:unknown,completedTrials=0,maintenance:Promise<void>|undefined;
  const maintain=async()=>{
    await store.renew(id,token,seconds);
    if(!provider)await store.withLease(id,token,()=>reapPriorEvalContainers(ownership,containerEngine(policy.engine)));
    options.heartbeat?.({unitId:id,completedTrials});
  };
  const timer=setInterval(()=>{
    if(maintenance||signal.aborted)return;
    maintenance=maintain().catch(error=>{failure=error;lost.abort();}).finally(()=>{maintenance=undefined;});
  },period);
  try{
    await maintain();
    const run=await executeSuite(store.repository,unit.inputs[def.side].snapshot,def.suite,policy,{
      signal,ownership,runId:id,model:def.model,maxTrials:def.executionLimits?.maxTrials??options.maxTrials,
      assertionSnapshot:unit.inputs[def.assertionSide].snapshot,priorOmittedInputs:unit.inputs[def.side].omitted,
      loadTrial:index=>store.trial(id,index),saveTrial:async(index,checkpoint)=>{
        await store.recordTrial(id,token,index,checkpoint);completedTrials=index+1;
        options.heartbeat?.({unitId:id,completedTrials});
      },
    });
    clearInterval(timer);await maintenance;
    if(failure)throw failure;
    if(signal.aborted)throw new EvalUnitCancelled('Eval unit cancelled');
    return await store.complete(id,token,run);
  }catch(error){
    clearInterval(timer);await maintenance;
    try{await store.release(id,token,!!options.signal?.aborted&&(options.cancelPermanently?.()??true));}catch(releaseError){if(!(releaseError instanceof EvalLeaseLost))throw releaseError;}
    throw failure??error;
  }finally{clearInterval(timer);}
}

/** The terminal SQL state is immutable: cancelled units cannot acquire another execution lease. */
export async function cleanupCancelledUnit(store:EvalStore,id:string,engine:ContainerEngine=containerEngine()):Promise<void>{
  await store.ready();const unit=await store.unit(id);
  if(!unit)throw new Error('Unknown scoped cancelled eval unit');
  if(unit.status!=='cancelled')throw new EvalUnitBusy('Eval unit is not irreversibly cancelled');
  await reapCancelledEvalContainers(unit.id,containerEngine(engine));
}
