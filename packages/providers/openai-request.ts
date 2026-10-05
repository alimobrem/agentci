import type {ResponseCreateParamsNonStreaming,ResponseInput} from 'openai/resources/responses/responses';
import {validateOpenAISchema} from './openai-schema.ts';
import {validateModelRequest} from './request.ts';
import {ProviderFailure,type ModelRequest} from './types.ts';
/** Preserve portable semantics; unsupported parameters fail instead of disappearing. */
export function openAIRequest(input:ModelRequest):ResponseCreateParamsNonStreaming{
 const request=validateModelRequest(input);
 if(request.provider!=='openai'||request.parameters.stop?.length)throw new ProviderFailure('unsupported-capability');
 const extension=request.providerExtensions.openai??{};
 if(Object.keys(extension).some(key=>key!=='parallel_tool_calls')||extension.parallel_tool_calls!==undefined&&typeof extension.parallel_tool_calls!=='boolean')throw new ProviderFailure('unsupported-capability');
 for(const tool of request.tools)validateOpenAISchema(tool.inputSchema,request.model.startsWith('ft:'));
 if(request.responseSchema)validateOpenAISchema(request.responseSchema,request.model.startsWith('ft:'));
 const messages:ResponseInput=[];
 if(request.system)messages.push({role:'system',content:request.system});
 if(request.developer)messages.push({role:'developer',content:request.developer});
 for(const message of request.messages){
  if(message.role==='tool')messages.push({type:'function_call_output',call_id:message.toolCallId!,output:message.content});
  else{
   if(message.content||!message.toolCalls?.length)messages.push({role:message.role,content:message.content});
   for(const call of message.toolCalls??[])messages.push({type:'function_call',call_id:call.id,name:call.name,arguments:JSON.stringify(call.arguments)});
  }
 }
 return {model:request.model,input:messages,store:false,stream:false,service_tier:'default',max_output_tokens:request.parameters.maxOutputTokens,
  ...(request.parameters.temperature!==undefined?{temperature:request.parameters.temperature}:{}),
  ...(request.parameters.topP!==undefined?{top_p:request.parameters.topP}:{}),
  ...(extension.parallel_tool_calls!==undefined?{parallel_tool_calls:extension.parallel_tool_calls}:{}),
  tools:request.tools.map(tool=>({type:'function',name:tool.name,description:tool.description,parameters:tool.inputSchema,strict:true})),
  ...(request.responseSchema?{text:{format:{type:'json_schema',name:'agentci_response',schema:request.responseSchema,strict:true}}}:{}),
  metadata:request.metadata};
}
