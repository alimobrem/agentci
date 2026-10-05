import {createHash} from 'node:crypto';
import {canonical} from '../review/engine.ts';
import {validateModelResponse} from './response.ts';
import {ProviderFailure,type ModelRequest,type ModelResponse,type ToolCall} from './types.ts';
const object=(v:unknown):v is Record<string,any>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const count=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
export function xAIPrefixDigest(request:ModelRequest):string{
 return createHash('sha256').update(canonical({provider:request.provider,model:request.model,system:request.system,developer:request.developer,tools:request.tools,responseSchema:request.responseSchema,messages:request.messages,history:request.providerExtensions.xai?.history??[]})).digest('hex');
}
/** Keep encrypted reasoning private; never substitute SDK defaults for missing usage. */
export function xAIResponse(value:unknown,request:ModelRequest,attemptId:string,requestId:string|null=null,acceptedModels:readonly string[]=[request.model]):ModelResponse{
 try{
  if(request.provider!=='xai'||!object(value)||typeof value.model!=='string'||!acceptedModels.includes(value.model)||!['completed','incomplete'].includes(value.status)||!Array.isArray(value.output)||value.output.length>256||value.error!=null)throw Error();
  let text='',refused=false;const calls:ToolCall[]=[];
  for(const item of value.output){
   if(!object(item)||value.status==='completed'&&item.status!==undefined&&item.status!=='completed')throw Error();
   if(item.type==='message'){
    if(item.role!=='assistant'||!Array.isArray(item.content)||item.content.length>256)throw Error();
    for(const part of item.content){
     if(!object(part))throw Error();
     if(part.type==='output_text'&&typeof part.text==='string')text+=part.text;
     else if(part.type==='refusal'&&typeof part.refusal==='string'){text+=part.refusal;refused=true;}
     else throw Error();
     if(text.length>524288)throw Error();
    }
   }else if(item.type==='function_call'){
    if(value.status==='completed'){
     if(typeof item.call_id!=='string'||typeof item.name!=='string'||typeof item.arguments!=='string'||item.arguments.length>524288)throw Error();
     calls.push({id:item.call_id,name:item.name,arguments:JSON.parse(item.arguments)});
    }
   }else if(item.type==='reasoning'){
    if(item.encrypted_content!=null&&typeof item.encrypted_content!=='string')throw Error();
   }else throw Error();
  }
  const status=value.status==='incomplete'?'incomplete':refused?'refused':'completed';
  if(value.usage!=null&&!object(value.usage))throw Error();const usage=value.usage??{};
  for(const field of ['input_tokens','output_tokens','total_tokens','cost_in_nano_usd','cost_in_usd_ticks'])if(usage[field]!=null&&!count(usage[field]))throw Error();
  const inputTokens=usage.input_tokens??null,outputTokens=usage.output_tokens??null;
  if(inputTokens!==null&&outputTokens!==null&&usage.total_tokens!=null&&usage.total_tokens!==inputTokens+outputTokens)throw Error();
  if(usage.num_server_side_tools_used!=null&&usage.num_server_side_tools_used!==0)throw Error();
  const costs:bigint[]=[];
  if(usage.cost_in_nano_usd!=null)costs.push((BigInt(usage.cost_in_nano_usd)+999n)/1000n);
  if(usage.cost_in_usd_ticks!=null)costs.push((BigInt(usage.cost_in_usd_ticks)+9999n)/10000n);
  // Round reported sub-microdollar charges upward, retaining the larger representation.
  const costUsdMicros=costs.length?Number(costs.reduce((a,b)=>a>b?a:b)):null;
  return validateModelResponse({schemaVersion:'v1alpha1',requestId:request.requestId,attemptId,provider:'xai',model:request.model,observedModel:value.model,status,text,structuredOutput:status==='completed'&&request.responseSchema&&(!calls.length||text.trim())?JSON.parse(text):null,toolCalls:status==='completed'?calls:[],usage:{inputTokens,outputTokens,costUsdMicros,costKind:costUsdMicros===null?'unknown':'reported',pricingRevision:null},providerRequestId:requestId,...(status==='completed'?{continuation:{provider:'xai',model:value.model,prefixDigest:xAIPrefixDigest(request),content:value.output}}:{})},request,attemptId);
 }catch{throw new ProviderFailure('invalid-output',false,'possibly-sent');}
}
