import {Context,ApplicationFailure,CancelledFailure} from '@temporalio/activity';
import {canonical,digest} from '../../packages/review/engine.ts';
import {ProviderFailure} from '../../packages/providers/types.ts';
import type {ReviewDispatchStore} from '../../packages/storage/review-dispatch.ts';
import type {ReviewSummaryStore} from '../../packages/storage/review-summaries.ts';
import type {createAdmittedReviewExecution} from './reviewer-execution.ts';
import type {AdmittedReviewActivities} from './reviewer-workflows.ts';
/** Controller activities bind their actual Temporal identity before spending.
 * Heartbeats contain only IDs; diagnostics and provider/source data never leave
 * the activity through failure payloads. Independent termination recovery is
 * still required because a terminated workflow cannot run finalization.
 */
export function createAdmittedReviewActivities(options:{
 dispatch:Pick<ReviewDispatchStore,'get'|'bindRun'|'finish'>;
 summaries:Pick<ReviewSummaryStore,'get'>;
 execute:ReturnType<typeof createAdmittedReviewExecution>;
}):AdmittedReviewActivities{
 const identity=async(id:string)=>{
  const context=Context.current(),actual=context.info.workflowExecution,state=await options.dispatch.get(id);
  if(!actual||!state||context.info.workflowType!=='reviewAdmittedRequest'||actual.workflowId!==state.workflowId||(state.runId&&state.runId!==actual.runId))throw ApplicationFailure.nonRetryable('Invalid review execution identity','ReviewExecutionIdentity');
  return {context,actual,state:await options.dispatch.bindRun(id,actual.workflowId,actual.runId)};
 };
 return {
  async runAdmittedReview(id){
   let timer:ReturnType<typeof setInterval>|undefined,poll:Promise<void>|undefined;
   const abort=new AbortController();let cancelled=false,remove=()=>{};
   try{
    const {context,state}=await identity(id),cached=await options.summaries.get(id);if(cached)return cached.digest;
    if(state.terminal)throw ApplicationFailure.nonRetryable('Review already terminal','ReviewExecutionTerminal');
    const onCancel=()=>{cancelled=true;abort.abort();};context.cancellationSignal.addEventListener('abort',onCancel,{once:true});remove=()=>context.cancellationSignal.removeEventListener('abort',onCancel);
    if(state.cancelRequested||context.cancellationSignal.aborted)onCancel();
    const tick=async()=>{context.heartbeat({id});const current=await options.dispatch.get(id);if(!current)throw Error();if(current.cancelRequested||current.terminal)onCancel();};
    timer=setInterval(()=>{if(!poll)poll=tick().catch(()=>{abort.abort();}).finally(()=>{poll=undefined;});},5000);timer.unref();
    context.heartbeat({id});
    const result=await options.execute(id,abort.signal),stored=await options.summaries.get(id);if(!stored||stored.digest!==result.digest)throw Error();return stored.digest;
   }catch(error){
    if(Context.current().cancellationSignal.aborted)throw new CancelledFailure('Review cancelled');
    if(cancelled)throw ApplicationFailure.nonRetryable('Review cancelled','ReviewCancelled');
    if(error instanceof ApplicationFailure)throw error;
    if(error instanceof ProviderFailure&&['budget-exhausted','deadline','ambiguous-attempt','invalid-request','authentication','unsupported-capability'].includes(error.code))throw ApplicationFailure.nonRetryable('Review provider execution stopped','ReviewProviderStopped');
    throw ApplicationFailure.retryable('Review execution unavailable','ReviewExecutionUnavailable');
   }finally{if(timer)clearInterval(timer);await poll;remove();}
  },
  async finishAdmittedReview(id,runId,status,resultDigest){
   try{
    const {actual,state}=await identity(id);if(runId!==actual.runId||!['completed','failed','cancelled'].includes(status))throw ApplicationFailure.nonRetryable('Invalid review finalization identity','ReviewExecutionIdentity');
    const saved=await options.summaries.get(id);
    if(status==='completed'&&(!saved||saved.digest!==resultDigest))throw ApplicationFailure.nonRetryable('Review completion evidence missing','ReviewCompletionEvidence');
    // A committed complete summary survives a late cancellation/finalization loss.
    if(saved){await options.dispatch.finish(id,runId,'completed',saved.digest);return;}
    if(resultDigest!==null)throw ApplicationFailure.nonRetryable('Invalid review failure evidence','ReviewCompletionEvidence');
    await options.dispatch.finish(id,runId,status,digest(canonical({admissionDigest:state.requestDigest,runId,status})));
   }catch(error){if(error instanceof ApplicationFailure)throw error;throw ApplicationFailure.retryable('Review finalization unavailable','ReviewFinalizationUnavailable');}
  },
 };
}
