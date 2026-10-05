import OpenAI from 'openai';
import {ProviderFailure} from './types.ts';
import {providerRetryDelay as openAIRetryDelay} from './retry-delay.ts';
export {providerRetryDelay as openAIRetryDelay} from './retry-delay.ts';
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
