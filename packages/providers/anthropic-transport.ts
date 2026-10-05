import Anthropic from '@anthropic-ai/sdk';
import type {RawMessageStreamEvent} from '@anthropic-ai/sdk/resources/messages/messages';
import {anthropicRequest} from './anthropic-request.ts';
import {anthropicResponse} from './anthropic-response.ts';
import {anthropicError} from './anthropic-error.ts';
import {ProviderFailure,type ModelRequest,type ProviderContext} from './types.ts';
const endpoint='https://api.anthropic.com/v1/messages';
/** Fixed-origin transport; dependency injection is for trusted application wiring/tests only. */
export function createAnthropicTransport(apiKey:string,fetchImpl:typeof fetch=globalThis.fetch){
 if(typeof apiKey!=='string'||!apiKey.trim()||apiKey.length>65536||/[\r\n]/.test(apiKey))throw new ProviderFailure('authentication');
 const boundedFetch:typeof fetch=async(input,init)=>{
  const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
  if(url!==endpoint||init?.method!=='POST')throw new ProviderFailure('invalid-request');
  const response=await fetchImpl(input,{...init,redirect:'error'});
  if(response.status>=300&&response.status<400){void response.body?.cancel().catch(()=>{});throw new ProviderFailure('transport',false,'possibly-sent');}
  if(!response.body)return response;
  const reader=response.body.getReader();let bytes=0;
  const body=new ReadableStream<Uint8Array>({async pull(controller){
   try{const next=await reader.read();if(next.done){controller.close();return;}bytes+=next.value.byteLength;if(bytes>4194304){void reader.cancel().catch(()=>{});throw new ProviderFailure('invalid-output',false,'possibly-sent');}controller.enqueue(next.value);}
   catch(error){controller.error(error);void reader.cancel().catch(()=>{});}
  },cancel(reason){return reader.cancel(reason);}});
  return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
 };
 // Explicit options prevent ambient ANTHROPIC_BASE_URL/auth token/log settings changing scope.
 const client=new Anthropic({apiKey,baseURL:'https://api.anthropic.com',authToken:null,maxRetries:0,logLevel:'off',fetch:boundedFetch});
 const options=(context:ProviderContext,request:ModelRequest)=>({signal:context.signal,maxRetries:0,timeout:Math.max(1,Math.min(2147483647,request.policy.deadlineAt-Date.now()))});
 return {
  async invoke(request:ModelRequest,context:ProviderContext,acceptedModels:readonly string[]=[request.model]){
   const body=anthropicRequest(request);
   if(context.signal.aborted||request.policy.deadlineAt<=Date.now())throw new ProviderFailure(context.signal.aborted?'cancelled':'deadline');
   try{const {data,request_id}=await client.messages.create(body,options(context,request)).withResponse();return anthropicResponse(data,request,context.attemptId,request_id,acceptedModels);}
   catch(error){throw anthropicError(error,context.signal);}
  },
  async *events(request:ModelRequest,context:ProviderContext):AsyncIterable<{event:RawMessageStreamEvent;requestId:string|null}>{
   const body=anthropicRequest(request);
   if(context.signal.aborted||request.policy.deadlineAt<=Date.now())throw new ProviderFailure(context.signal.aborted?'cancelled':'deadline');
   let stream:Awaited<ReturnType<typeof client.messages.create>>|undefined;
   try{const result=await client.messages.create({...body,stream:true},options(context,request)).withResponse();stream=result.data;for await(const event of result.data)yield {event,requestId:result.request_id??null};}
   catch(error){throw anthropicError(error,context.signal);}
   finally{if(stream&&'controller' in stream)stream.controller.abort();}
  }
 };
}
