import {validateModelResponse} from './response.ts';
import {ProviderFailure,type ModelRequest,type ModelResponse,type ToolCall} from './types.ts';
const object=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
/** Normalize only documented output kinds. Provider dollars are not inferred from token counts. */
export function openAIResponse(value:unknown,request:ModelRequest,attemptId:string,requestId:string|null=null,acceptedModels:readonly string[]=[request.model]):ModelResponse{
 try{
  if(!object(value)||typeof value.model!=='string'||!acceptedModels.includes(value.model)||!['completed','incomplete'].includes(value.status as string)||!Array.isArray(value.output)||value.output.length>256)throw Error();
  let text='',refused=false;const toolCalls:ToolCall[]=[];
  for(const item of value.output){
   if(!object(item))throw Error();
   if(item.type==='message'){
    if(item.role!=='assistant'||!Array.isArray(item.content)||item.content.length>256||value.status==='completed'&&item.status!=='completed')throw Error();
    for(const part of item.content){
     if(!object(part))throw Error();
     if(part.type==='output_text'&&typeof part.text==='string')text+=part.text;
     else if(part.type==='refusal'&&typeof part.refusal==='string'){text+=part.refusal;refused=true;}
     else throw Error();
     if(text.length>524288)throw Error();
    }
   }else if(item.type==='function_call'){
    if(value.status==='completed'){
     if(item.status!==undefined&&item.status!=='completed'||typeof item.call_id!=='string'||typeof item.name!=='string'||typeof item.arguments!=='string'||item.arguments.length>524288||item.async===true||item.namespace||object(item.caller)&&item.caller.type!=='direct')throw Error();
     toolCalls.push({id:item.call_id,name:item.name,arguments:JSON.parse(item.arguments)});
    }
   }else if(item.type!=='reasoning')throw Error();
  }
  const status=value.status==='incomplete'?'incomplete':refused?'refused':'completed';
  const usage=value.usage;
  if(usage!==undefined&&usage!==null&&!object(usage))throw Error();
  const inputTokens=object(usage)?usage.input_tokens:null,outputTokens=object(usage)?usage.output_tokens:null;
  if(object(usage)&&(!Number.isSafeInteger(inputTokens)||!Number.isSafeInteger(outputTokens)||typeof usage.total_tokens!=='number'||usage.total_tokens!==(inputTokens as number)+(outputTokens as number)))throw Error();
  return validateModelResponse({schemaVersion:'v1alpha1',requestId:request.requestId,attemptId,provider:request.provider,model:request.model,observedModel:value.model,status,text,structuredOutput:status==='completed'&&request.responseSchema&&(!toolCalls.length||text.trim())?JSON.parse(text):null,toolCalls:status==='completed'?toolCalls:[],usage:{inputTokens,outputTokens,costUsdMicros:null,costKind:'unknown',pricingRevision:null},providerRequestId:requestId},request,attemptId);
 }catch{throw new ProviderFailure('invalid-output',false,'possibly-sent');}
}
