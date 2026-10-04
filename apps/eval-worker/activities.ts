import {Context,CancelledFailure,ApplicationFailure} from '@temporalio/activity';
import type {EvalStore} from '../../packages/storage/evals.ts';
import {containerEngine,type RunnerPolicy} from '../../packages/evals/runner.ts';
import {executeStoredUnit,cleanupCancelledUnit,EvalUnitBusy,EvalUnitCancelled,EvalUnitConfigurationError,type UnitWorkerOptions} from './unit.ts';
export function createEvalActivities(store:EvalStore,policyFor:(adapter:string)=>RunnerPolicy,options:Pick<UnitWorkerOptions,'maintenanceMs'|'leaseSeconds'|'maxTrials'>={}){
  return {
    async cleanupCancelledEvalUnit(id:string):Promise<string>{
      if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))throw ApplicationFailure.nonRetryable('Invalid cancelled eval unit ID','InvalidEvalUnit');
      try{const unit=await store.unit(id);if(!unit)throw new Error('Unknown scoped cancelled eval unit');await cleanupCancelledUnit(store,id,containerEngine(policyFor(unit.definition.suite.spec.runner.adapter).engine));return id;}
      catch(error){if(error instanceof EvalUnitBusy)throw ApplicationFailure.nonRetryable('Eval unit is not cancelled','InvalidCancelledEvalUnit');throw ApplicationFailure.retryable('Cancelled eval cleanup unavailable','EvalCleanupUnavailable');}
    },
    async runEvalUnit(id:string):Promise<string>{
      if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))throw ApplicationFailure.nonRetryable('Invalid eval unit ID','InvalidEvalUnit');
      const context=Context.current(),unit=await store.unit(id);
      if(!unit)throw ApplicationFailure.nonRetryable('Unknown scoped eval unit','InvalidEvalUnit');
      let policy:RunnerPolicy;try{policy=policyFor(unit.definition.suite.spec.runner.adapter);}catch{throw ApplicationFailure.nonRetryable('Operator eval runner unavailable','EvalRunnerConfiguration');}
      try{
        await executeStoredUnit(store,id,policy,{...options,signal:context.cancellationSignal,
          cancelPermanently:()=>context.cancellationSignal.reason instanceof CancelledFailure&&context.cancellationSignal.reason.message==='CANCELLED',
          heartbeat:progress=>context.heartbeat(progress)});
        return id;
      }catch(error){
        // Cleanup has completed before acknowledging server cancellation. Timeouts/shutdown stay retryable in SQL.
        if(context.cancellationSignal.aborted)throw context.cancellationSignal.reason;
        if(error instanceof EvalUnitCancelled)throw ApplicationFailure.nonRetryable('Eval unit cancelled','EvalUnitCancelled');
        if(error instanceof EvalUnitConfigurationError)throw ApplicationFailure.nonRetryable('Operator eval runner does not match the staged unit','EvalRunnerConfiguration');
        throw ApplicationFailure.retryable('Eval unit execution unavailable','EvalExecutionUnavailable');
      }
    },
  };
}
export type EvalActivities=ReturnType<typeof createEvalActivities>;
