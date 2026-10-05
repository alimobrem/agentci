import OpenAI from 'openai';
import {ProviderFailure} from './types.ts';
/** Parse only bounded delay metadata; never retain provider messages or response bodies. */
export function openAIRetryDelay(headers:Headers|undefined,now=Date.now()):number|null{
 const millis=headers?.get('retry-after-ms'),seconds=headers?.get('retry-after');
 const numeric=(value:string|null|undefined,multiplier:number)=>{
  if(!value||!/^\d+(?:\.\d+)?$/.test(value.trim()))return null;
  // A syntactically valid delay that overflows must stop retries, not fall back
  // to a short jitter delay. The core rejects this sentinel against policy.
  const result=Math.ceil(Number(value)*multiplier);return Number.isSafeInteger(result)?result:Number.MAX_SAFE_INTEGER;
 };
 const ms=numeric(millis,1);if(ms!==null)return ms;
 const sec=numeric(seconds,1000);if(sec!==null)return sec;
 if(seconds&&seconds.length<=64&&!/^[-+\d.]+$/.test(seconds.trim())){const parsed=Date.parse(seconds);if(Number.isFinite(parsed))return Math.max(0,parsed-now);}
 return null;
}
export function openAIError(error:unknown,signal?:AbortSignal):ProviderFailure{
 if(error instanceof ProviderFailure)return error;
 if(signal?.aborted||error instanceof OpenAI.APIUserAbortError)return new ProviderFailure(signal?.reason==='deadline'?'deadline':'cancelled',false,'possibly-sent');
 if(error instanceof OpenAI.APIConnectionTimeoutError)return new ProviderFailure('deadline',false,'possibly-sent');
 if(error instanceof OpenAI.APIError){
  if(error.status===401||error.status===403)return new ProviderFailure('authentication',false,'not-sent');
  if(error.status===429){
   const quota=['insufficient_quota','billing_hard_limit_reached','billing_not_active'].includes(error.code??'');
   return new ProviderFailure('rate-limit',!quota,'not-sent',openAIRetryDelay(error.headers));
  }
  if([400,404,422].includes(error.status??0))return new ProviderFailure('invalid-request',false,'not-sent');
  if(error.status===408||error.status===409||(error.status??0)>=500||error instanceof OpenAI.APIConnectionError)return new ProviderFailure('transport',true,'possibly-sent',openAIRetryDelay(error.headers));
 }
 return new ProviderFailure('transport',false,'possibly-sent');
}
