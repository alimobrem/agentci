import type {MessageCreateParamsNonStreaming,MessageParam,ContentBlockParam} from '@anthropic-ai/sdk/resources/messages/messages';
import {validateAnthropicSchemas} from './anthropic-schema.ts';
import {validateModelRequest} from './request.ts';
import {ProviderFailure,type ModelRequest} from './types.ts';
/** Portable metadata stays controller-side; it is not reinterpreted as Anthropic user identity. */
export function anthropicRequest(input:ModelRequest):MessageCreateParamsNonStreaming{
 const request=validateModelRequest(input);
 if(request.provider!=='anthropic'||request.developer||Object.keys(request.providerExtensions.anthropic??{}).length)throw new ProviderFailure('unsupported-capability');
 if(request.parameters.temperature!==undefined&&request.parameters.temperature>1)throw new ProviderFailure('unsupported-capability');
 validateAnthropicSchemas(request.tools.map(tool=>tool.inputSchema),request.responseSchema);
 const messages:MessageParam[]=[];
 const append=(role:'user'|'assistant',content:ContentBlockParam[])=>{
  const last=messages.at(-1);
  if(last?.role===role)(last.content as ContentBlockParam[]).push(...content);
  else messages.push({role,content});
 };
 for(const message of request.messages){
  if(message.role==='tool')append('user',[{type:'tool_result',tool_use_id:message.toolCallId!,content:message.content}]);
  else{
   const content:ContentBlockParam[]=[];
   if(message.content)content.push({type:'text',text:message.content});
   for(const call of message.toolCalls??[])content.push({type:'tool_use',id:call.id,name:call.name,input:call.arguments});
   if(!content.length)throw new ProviderFailure('invalid-request');
   append(message.role,content);
  }
 }
 const tools=request.tools.map(tool=>{
  if(tool.inputSchema.type!=='object')throw new ProviderFailure('unsupported-capability');
  return {name:tool.name,description:tool.description,input_schema:{...tool.inputSchema,type:'object' as const},strict:true};
 });
 return {model:request.model,max_tokens:request.parameters.maxOutputTokens,messages,stream:false,service_tier:'standard_only',
  ...(request.system?{system:request.system}:{}),
  ...(tools.length?{tools}:{}),
  ...(request.responseSchema?{output_config:{format:{type:'json_schema',schema:request.responseSchema}}}:{}),
  ...(request.parameters.temperature!==undefined?{temperature:request.parameters.temperature}:{}),
  ...(request.parameters.topP!==undefined?{top_p:request.parameters.topP}:{}),
  ...(request.parameters.stop?.length?{stop_sequences:request.parameters.stop}:{})};
}
