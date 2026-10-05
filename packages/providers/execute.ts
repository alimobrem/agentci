import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {canonical} from '../review/engine.ts';
import {validateModelRequest,assertProviderCapabilities} from './request.ts';
import {validateModelResponse} from './response.ts';
import {ProviderFailure,type CostEstimate,type ModelEvent,type ModelRequest,type ProviderContext,type ModelProvider,type ModelResponse} from './types.ts';
import {ModelStreamValidator} from './stream.ts';
import type {BudgetLedger} from './budget.ts';

function abortFailure(signal:AbortSignal,dispatch:'not-sent'|'possibly-sent'){
 return new ProviderFailure(signal.reason==='deadline'?'deadline':'cancelled',false,dispatch);
}
async function bounded<T>(operation:()=>Promise<T>,signal:AbortSignal):Promise<T>{
 if(signal.aborted)throw abortFailure(signal,'not-sent');
 let abort!:()=>void;
 const interrupted=new Promise<never>((_,reject)=>{abort=()=>reject(abortFailure(signal,'possibly-sent'));signal.addEventListener('abort',abort,{once:true});});
 try{return await Promise.race([Promise.resolve().then(operation),interrupted]);}
 finally{signal.removeEventListener('abort',abort);}
}
/** Each adapter invocation is one outbound attempt: adapter-internal retries must be disabled. */
async function executeModel(provider:ModelProvider,input:unknown,ledger:BudgetLedger,signal?:AbortSignal,onEvent?:StreamObserver):Promise<ModelResponse>{
 const request=validateModelRequest(input);assertProviderCapabilities(provider,request,!!onEvent);
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
 const cancel=()=>controller.abort('cancelled');signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
 const arm=()=>{const remaining=request.policy.deadlineAt-Date.now();if(remaining<=0)controller.abort('deadline');else timer=setTimeout(arm,Math.min(remaining,2147483647));};arm();
 const check=()=>{if(Date.now()>=request.policy.deadlineAt)controller.abort('deadline');if(controller.signal.aborted)throw abortFailure(controller.signal,'not-sent');};
 try{
  check();
  let estimate:CostEstimate|undefined;
  try{estimate=provider.estimateCost?.(structuredClone(request));}catch{throw new ProviderFailure('invalid-request');}
  if(!estimate||!Number.isSafeInteger(estimate.upperBoundUsdMicros)||estimate.upperBoundUsdMicros<=0||typeof estimate.pricingRevision!=='string'||!estimate.pricingRevision.length||estimate.pricingRevision.length>256||!Number.isSafeInteger(estimate.maxInputTokens)||estimate.maxInputTokens<0||!Number.isSafeInteger(estimate.maxOutputTokens)||estimate.maxOutputTokens<request.parameters.maxOutputTokens)throw new ProviderFailure('invalid-request');
  const requestDigest=createHash('sha256').update(canonical(request)).digest('hex');
  for(let attempt=1;attempt<=request.policy.maxAttempts;attempt++){
   check();
   let attemptId:string;
   try{attemptId=await ledger.reserve({requestId:request.requestId,requestDigest,attempt,upperBoundUsdMicros:estimate.upperBoundUsdMicros,pricingRevision:estimate.pricingRevision});}
   catch(error){if(error instanceof ProviderFailure)throw error;throw new ProviderFailure('transport');}
   // Reservation is deliberately awaited even on cancellation: release it only after its outcome is known.
   let response:ModelResponse;
   try{
    check();
    response=validateModelResponse(await bounded(()=>onEvent?consumeStream(provider,request,{attemptId,signal:controller.signal},onEvent):provider.invoke(structuredClone(request),{attemptId,signal:controller.signal}),controller.signal),request,attemptId);
   }catch(error){
    const failure=error instanceof ProviderFailure?error:new ProviderFailure('transport',false,'possibly-sent');
    try{if(failure.dispatch==='not-sent')await ledger.releaseNotSent(attemptId);else await ledger.unknown(attemptId);}
    catch{throw new ProviderFailure('ambiguous-attempt',false,'possibly-sent');}
    if(!failure.retryable||!['rate-limit','transport'].includes(failure.code)||attempt===request.policy.maxAttempts||controller.signal.aborted)throw failure;
    const waitMs=Math.min(request.policy.maxDelayMs,request.policy.baseDelayMs*2**(attempt-1));
    try{await delay(waitMs,undefined,{signal:controller.signal});}catch{throw abortFailure(controller.signal,'not-sent');}
    continue;
   }
   // Estimated/unknown costs cannot safely release the conservative reservation.
   try{if(response.usage.costKind==='reported'&&response.usage.costUsdMicros!==null)await ledger.settle(attemptId,response.usage.costUsdMicros);else await ledger.unknown(attemptId);}
   catch{throw new ProviderFailure('ambiguous-attempt',false,'possibly-sent');}
   // Persist known usage even if cancellation arrives during accounting, but never report late success.
   if(Date.now()>=request.policy.deadlineAt)controller.abort('deadline');
   if(controller.signal.aborted)throw abortFailure(controller.signal,'possibly-sent');
   return response;
  }
  throw new ProviderFailure('transport');
 }finally{controller.abort('cancelled');if(timer)clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}

export type StreamObserver=(event:Exclude<ModelEvent,{type:'terminal'}>)=>void|Promise<void>;
async function consumeStream(provider:ModelProvider,request:ModelRequest,context:ProviderContext,onEvent:StreamObserver):Promise<ModelResponse>{
 const validator=new ModelStreamValidator(request,context.attemptId);
 const iterator=provider.stream(structuredClone(request),context)[Symbol.asyncIterator]();
 let observed=false,ended=false;
 try{
  while(true){
   const next=await bounded(()=>iterator.next(),context.signal);
   if(context.signal.aborted)throw abortFailure(context.signal,'possibly-sent');
   if(next.done){ended=true;return validator.finish();}
   const event=validator.accept(next.value);
   if(event.type!=='terminal'){
    observed=true;
    try{await bounded(()=>Promise.resolve(onEvent(event)),context.signal);}
    catch(error){if(context.signal.aborted)throw abortFailure(context.signal,'possibly-sent');throw new ProviderFailure('transport',false,'possibly-sent');}
   }
  }
 }catch(error){
  // Once a consumer has seen provisional data, never silently replay it from a new attempt.
  if(observed&&error instanceof ProviderFailure)throw new ProviderFailure(error.code,false,'possibly-sent');
  throw error;
 }finally{
  // A broken adapter may ignore return(); do not let cleanup defeat the deadline.
  if(!ended&&iterator.return)void Promise.resolve().then(()=>iterator.return!()).catch(()=>{});
 }
}
export function invokeModel(provider:ModelProvider,input:unknown,ledger:BudgetLedger,signal?:AbortSignal):Promise<ModelResponse>{return executeModel(provider,input,ledger,signal);}
/** Backpressured provisional events; the returned response is accepted only after accounting. */
export function streamModel(provider:ModelProvider,input:unknown,ledger:BudgetLedger,onEvent:StreamObserver,signal?:AbortSignal):Promise<ModelResponse>{return executeModel(provider,input,ledger,signal,onEvent);}
