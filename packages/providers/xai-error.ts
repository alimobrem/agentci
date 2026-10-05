import {APIError,APIConnectionError,APIProtocolError,TimeoutError,AbortError} from '@xai-official/sdk';
import {ProviderFailure} from './types.ts';
import {providerRetryDelay} from './retry-delay.ts';
export function xAIStatusFailure(status:number,headers?:Headers):ProviderFailure{
 if(status===401||status===403)return new ProviderFailure('authentication',false,'not-sent');
 if(status===429)return new ProviderFailure('rate-limit',true,'not-sent',providerRetryDelay(headers));
 if([400,404,413,422].includes(status))return new ProviderFailure('invalid-request',false,'not-sent');
 return new ProviderFailure('transport',status===408||status===409||status>=500,'possibly-sent',providerRetryDelay(headers));
}
export function xAIError(error:unknown,signal?:AbortSignal):ProviderFailure{
 // The SDK wraps fetch/body errors. Retain only our own typed boundary failures.
 let cause=error;for(let depth=0;depth<4&&cause instanceof Error;depth++){
  if(cause instanceof ProviderFailure)return cause;cause=cause.cause;
 }
 if(signal?.aborted||error instanceof AbortError)return new ProviderFailure(signal?.reason==='deadline'?'deadline':'cancelled',false,'possibly-sent');
 if(error instanceof TimeoutError)return new ProviderFailure('deadline',false,'possibly-sent');
 if(error instanceof APIProtocolError)return new ProviderFailure('invalid-output',false,'possibly-sent');
 if(error instanceof APIError&&error.status!==undefined){const failure=xAIStatusFailure(error.status);return new ProviderFailure(failure.code,failure.retryable,'possibly-sent',failure.retryAfterMs);}
 return new ProviderFailure('transport',error instanceof APIConnectionError,'possibly-sent');
}
