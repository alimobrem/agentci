import OpenAI from 'openai';
import type {ResponseStreamEvent} from 'openai/resources/responses/responses';
import {openAIRequest} from './openai-request.ts';
import {openAIResponse} from './openai-response.ts';
import {openAIError} from './openai-error.ts';
import {ProviderFailure,type ModelRequest,type ProviderContext} from './types.ts';
const endpoint='https://api.openai.com/v1/responses';
/** Fixed-origin transport; dependency injection is for trusted application wiring/tests only. */
export function createOpenAITransport(apiKey:string,fetchImpl:typeof fetch=globalThis.fetch){
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
 // Explicit options prevent ambient OPENAI_BASE_URL/organization/project/log settings changing scope.
 const client=new OpenAI({apiKey,baseURL:'https://api.openai.com/v1',organization:null,project:null,maxRetries:0,logLevel:'off',fetch:boundedFetch});
 const options=(context:ProviderContext,request:ModelRequest)=>({signal:context.signal,maxRetries:0,timeout:Math.max(1,Math.min(2147483647,request.policy.deadlineAt-Date.now()))});
 return {
  async invoke(request:ModelRequest,context:ProviderContext,acceptedModels:readonly string[]=[request.model]){
   const body=openAIRequest(request);
   if(context.signal.aborted||request.policy.deadlineAt<=Date.now())throw new ProviderFailure(context.signal.aborted?'cancelled':'deadline');
   try{const {data,request_id}=await client.responses.create(body,options(context,request)).withResponse();return openAIResponse(data,request,context.attemptId,request_id,acceptedModels);}
   catch(error){throw openAIError(error,context.signal);}
  },
  async *events(request:ModelRequest,context:ProviderContext):AsyncIterable<{event:ResponseStreamEvent;requestId:string|null}>{
   const body=openAIRequest(request);
   if(context.signal.aborted||request.policy.deadlineAt<=Date.now())throw new ProviderFailure(context.signal.aborted?'cancelled':'deadline');
   let stream:Awaited<ReturnType<typeof client.responses.create>>|undefined;
   try{const result=await client.responses.create({...body,stream:true},options(context,request)).withResponse();stream=result.data;for await(const event of result.data)yield {event,requestId:result.request_id};}
   catch(error){throw openAIError(error,context.signal);}
   finally{if(stream&&'controller' in stream)stream.controller.abort();}
  }
 };
}
