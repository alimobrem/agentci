import Anthropic from '@anthropic-ai/sdk';
import {ProviderFailure} from './types.ts';
import {providerRetryDelay} from './retry-delay.ts';
export function anthropicError(error:unknown,signal?:AbortSignal):ProviderFailure{
 if(error instanceof ProviderFailure)return error;
 if(signal?.aborted||error instanceof Anthropic.APIUserAbortError)return new ProviderFailure(signal?.reason==='deadline'?'deadline':'cancelled',false,'possibly-sent');
 if(error instanceof Anthropic.APIConnectionTimeoutError)return new ProviderFailure('deadline',false,'possibly-sent');
 if(error instanceof Anthropic.APIError){
  if(error.status===401||error.status===403)return new ProviderFailure('authentication',false,'not-sent');
  if(error.status===429)return new ProviderFailure('rate-limit',true,'not-sent',providerRetryDelay(error.headers));
  if([400,404,413,422].includes(error.status??0))return new ProviderFailure('invalid-request',false,'not-sent');
  if(error.status===408||error.status===409||(error.status??0)>=500||error instanceof Anthropic.APIConnectionError)return new ProviderFailure('transport',true,'possibly-sent',providerRetryDelay(error.headers));
 }
 return new ProviderFailure('transport',false,'possibly-sent');
}
