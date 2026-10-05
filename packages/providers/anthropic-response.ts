import {validateModelResponse} from './response.ts';
import {ProviderFailure,type ModelRequest,type ModelResponse,type ToolCall} from './types.ts';
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const tokens=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
/** Normalize Messages output; no server tool execution or unreported cost inference. */
export function anthropicResponse(value:unknown,request:ModelRequest,attemptId:string,requestId:string|null=null,acceptedModels:readonly string[]=[request.model]):ModelResponse{
 try{
  if(!object(value)||value.type!=='message'||value.role!=='assistant'||typeof value.model!=='string'||!acceptedModels.includes(value.model)||!Array.isArray(value.content)||value.content.length>256)throw Error();
  const reason=value.stop_reason;
  if(!['end_turn','stop_sequence','tool_use','max_tokens','pause_turn','refusal','model_context_window_exceeded'].includes(reason as string))throw Error();
  if(reason==='stop_sequence'&&(typeof value.stop_sequence!=='string'||!request.parameters.stop?.includes(value.stop_sequence)))throw Error();
  const status=reason==='refusal'?'refused':['max_tokens','pause_turn','model_context_window_exceeded'].includes(reason as string)?'incomplete':'completed';
  let text='';const toolCalls:ToolCall[]=[];
  for(const block of value.content){
   if(!object(block))throw Error();
   if(block.type==='text'){if(typeof block.text!=='string')throw Error();text+=block.text;if(text.length>524288)throw Error();}
   else if(block.type==='tool_use'){
    if(status==='completed'){
     if(reason!=='tool_use'||typeof block.id!=='string'||typeof block.name!=='string'||!object(block.input))throw Error();
     toolCalls.push({id:block.id,name:block.name,arguments:block.input as ToolCall['arguments']});
    }
   }else if(!['thinking','redacted_thinking'].includes(block.type as string))throw Error();
  }
  if(reason==='tool_use'&&!toolCalls.length)throw Error();
  if(!object(value.usage)||!tokens(value.usage.input_tokens)||!tokens(value.usage.output_tokens))throw Error();
  const usage=value.usage,cache=[usage.cache_creation_input_tokens,usage.cache_read_input_tokens];
  if(cache.some(n=>n!==undefined&&n!==null&&!tokens(n)))throw Error();
  // Missing cache counters stay unknown; do not undercount total input usage.
  const inputTokens=cache.every(tokens)?(usage.input_tokens as number)+(cache[0] as number)+(cache[1] as number):null;
  return validateModelResponse({schemaVersion:'v1alpha1',requestId:request.requestId,attemptId,provider:request.provider,model:request.model,observedModel:value.model,status,text,
   structuredOutput:status==='completed'&&request.responseSchema&&(!toolCalls.length||text.trim())?JSON.parse(text):null,toolCalls,
   usage:{inputTokens,outputTokens:usage.output_tokens,costUsdMicros:null,costKind:'unknown',pricingRevision:null},providerRequestId:requestId},request,attemptId);
 }catch{throw new ProviderFailure('invalid-output',false,'possibly-sent');}
}
