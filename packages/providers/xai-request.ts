import type {CreateParams,InputItem} from '@xai-official/sdk';
import {validateModelRequest} from './request.ts';
import {xAIHistory} from './xai-continuation.ts';
import {validateXAISchema} from './xai-schema.ts';
import {ProviderFailure,type ModelRequest} from './types.ts';
/** Translate portable input using the xAI SDK contract, not OpenAI's schema subset. */
export function xAIRequest(input:ModelRequest):CreateParams{
 const request=validateModelRequest(input);
 if(request.provider!=='xai'||request.parameters.stop?.length)throw new ProviderFailure('unsupported-capability');
 const extension=request.providerExtensions.xai??{};
 if(Object.keys(extension).some(key=>!['history','parallel_tool_calls'].includes(key))||extension.parallel_tool_calls!==undefined&&typeof extension.parallel_tool_calls!=='boolean')throw new ProviderFailure('unsupported-capability');
 const history=xAIHistory(request);
 for(const tool of request.tools)validateXAISchema(tool.inputSchema);
 if(request.responseSchema)validateXAISchema(request.responseSchema);
 const messages:InputItem[]=[];
 if(request.system)messages.push({role:'system',content:request.system});
 if(request.developer)messages.push({role:'developer',content:request.developer});
 for(const [index,message] of request.messages.entries()){
  if(history.has(index)){messages.push(...history.get(index)!);continue;}
  if(message.role==='tool')messages.push({type:'function_call_output',call_id:message.toolCallId!,output:message.content});
  else{
   if(message.content||!message.toolCalls?.length)messages.push({role:message.role,content:message.content});
   for(const call of message.toolCalls??[])messages.push({type:'function_call',call_id:call.id,name:call.name,arguments:JSON.stringify(call.arguments)});
  }
 }
 // Metadata is retained by AgentCI: the upstream contract marks it unsupported.
 return {model:request.model,input:messages,store:false,service_tier:'default',max_output_tokens:request.parameters.maxOutputTokens,
  ...(request.parameters.temperature!==undefined?{temperature:request.parameters.temperature}:{}),
  ...(request.parameters.topP!==undefined?{top_p:request.parameters.topP}:{}),
  ...(extension.parallel_tool_calls!==undefined?{parallel_tool_calls:extension.parallel_tool_calls}:{}),
  tools:request.tools.map(tool=>({type:'function',name:tool.name,description:tool.description,parameters:tool.inputSchema})),
  ...(request.responseSchema?{text:{format:{type:'json_schema',name:'agentci_response',schema:request.responseSchema}}}:{})};
}
