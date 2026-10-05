import {SpaceXAI,type ResponseStreamEvent,type ResponseStream} from '@xai-official/sdk';
import {xAIRequest} from './xai-request.ts';
import {xAIError,xAIStatusFailure} from './xai-error.ts';
import {ProviderFailure,type ModelRequest,type ProviderContext} from './types.ts';
const endpoint='https://api.x.ai/v1/responses',limit=4194304;
/** SDK wire transport only. Returned payload/events still require provider validation. */
export function createXAITransport(apiKey:string,fetchImpl:typeof fetch=globalThis.fetch){
 if(typeof apiKey!=='string'||!apiKey.trim()||apiKey.length>65536||/[\r\n]/.test(apiKey))throw new ProviderFailure('authentication');
 const boundedFetch:typeof fetch=async(input,init)=>{
  const request=new Request(input,init);
  if(request.url!==endpoint||request.method!=='POST')throw new ProviderFailure('invalid-request');
  const response=await fetchImpl(new Request(request,{redirect:'error'}));
  if(response.status>=300){void response.body?.cancel().catch(()=>{});throw xAIStatusFailure(response.status,response.headers);}
  if(!response.body)return response;
  const reader=response.body.getReader();let bytes=0;
  const body=new ReadableStream<Uint8Array>({async pull(controller){
   try{const next=await reader.read();if(next.done){controller.close();return;}bytes+=next.value.byteLength;if(bytes>limit)throw new ProviderFailure('invalid-output',false,'possibly-sent');controller.enqueue(next.value);}
   catch(error){controller.error(error);void reader.cancel().catch(()=>{});}
  },cancel(reason){return reader.cancel(reason);}});
  return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
 };
 const client=new SpaceXAI({apiKey,baseURL:'https://api.x.ai/v1',fetch:boundedFetch,maxRetries:0,retryBeforeOutput:false,maxResponseBodyBytes:limit});
 const prepare=(request:ModelRequest,context:ProviderContext)=>{
  const body=xAIRequest(request);
  if(context.signal.aborted||request.policy.deadlineAt<=Date.now())throw new ProviderFailure(context.signal.aborted?'cancelled':'deadline');
  // The SDK has no per-client logging switch; reject its ambient debug mode.
  if(process.env.XAI_DEBUG==='1')throw new ProviderFailure('invalid-request');
  const timeout=Math.max(1,Math.min(2147483647,request.policy.deadlineAt-Date.now()));
  return {body,options:{signal:context.signal,timeout,idleTimeout:timeout,maxRetries:0,retryBeforeOutput:false,maxResponseBodyBytes:limit}};
 };
 return {
  async raw(request:ModelRequest,context:ProviderContext){
   const {body,options}=prepare(request,context);
   try{const response=await client.responses.create({...body,stream:false},options);return {payload:response.raw,requestId:response.http.requestId};}
   catch(error){throw xAIError(error,context.signal);}
  },
  async *events(request:ModelRequest,context:ProviderContext):AsyncIterable<{event:ResponseStreamEvent;requestId:string|null}>{
   const {body,options}=prepare(request,context);let stream:ResponseStream|undefined;
   try{stream=await client.responses.create({...body,stream:true},options);for await(const event of stream)yield {event,requestId:stream.http.requestId};await stream.done();}
   catch(error){throw xAIError(error,context.signal);}
   finally{if(stream)void stream.close().catch(()=>{});}
  }
 };
}
