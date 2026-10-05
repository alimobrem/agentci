import {createHash} from 'node:crypto';
import {canonical} from '../review/engine.ts';
import type {ModelRequest} from './types.ts';
/** Bind continuation to the exact preceding instructions, tools and conversation. */
export function anthropicPrefixDigest(request:ModelRequest):string{
 return createHash('sha256').update(canonical({provider:request.provider,model:request.model,system:request.system,developer:request.developer,tools:request.tools,responseSchema:request.responseSchema,messages:request.messages,history:request.providerExtensions.anthropic?.history??[]})).digest('hex');
}

import {randomUUID} from 'node:crypto';
import {validateModelRequest} from './request.ts';
import {validateModelResponse} from './response.ts';
import {ProviderFailure,type ModelResponse,type JsonValue} from './types.ts';
const object=(v:unknown):v is Record<string,any>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
/** Digest binding detects changed prefixes; upstream signatures remain authoritative. */
export function anthropicHistory(request:ModelRequest):Map<number,JsonValue[]>{
 const extension=request.providerExtensions.anthropic??{},history=extension.history??[];
 if(Object.keys(extension).some(key=>key!=='history')||!Array.isArray(history))throw new ProviderFailure('unsupported-capability');
 const result=new Map<number,JsonValue[]>();let previous=-1;
 for(const entry of history as unknown[]){
  if(!object(entry)||Object.keys(entry).sort().join(',')!=='continuation,index'||!Number.isInteger(entry.index)||entry.index<=previous||entry.index>=request.messages.length)throw new ProviderFailure('invalid-request');
  const index=entry.index,c=entry.continuation,message=request.messages[index];
  const prefix={...request,messages:request.messages.slice(0,index),providerExtensions:{...request.providerExtensions,anthropic:{history:history.filter((item:any)=>object(item)&&Number.isInteger(item.index)&&item.index<index)}}};
  if(message?.role!=='assistant'||!object(c)||Object.keys(c).sort().join(',')!=='content,model,prefixDigest,provider'||c.provider!=='anthropic'||c.model!==request.model||c.prefixDigest!==anthropicPrefixDigest(prefix)||!Array.isArray(c.content)||c.content.length>256)throw new ProviderFailure('invalid-request');
  let text='';const calls=[];
  for(const block of c.content){
   if(!object(block))throw new ProviderFailure('invalid-request');
   if(block.type==='text'&&typeof block.text==='string')text+=block.text;
   else if(block.type==='tool_use'&&typeof block.id==='string'&&typeof block.name==='string'&&object(block.input))calls.push({id:block.id,name:block.name,arguments:block.input});
   else if(block.type==='thinking'&&typeof block.thinking==='string'&&typeof block.signature==='string'&&block.signature){}
   else if(block.type==='redacted_thinking'&&typeof block.data==='string'&&block.data){}
   else throw new ProviderFailure('invalid-request');
  }
  if(text!==message.content||canonical(calls)!==canonical(message.toolCalls??[]))throw new ProviderFailure('invalid-request');
  result.set(index,structuredClone(c.content));previous=index;
 }
 return result;
}
/** Append verified proposals/results; does not execute tools or extend deadlines. */
export function appendAnthropicToolResults(input:ModelRequest,output:ModelResponse,results:{id:string;content:string}[]):ModelRequest{
 const request=validateModelRequest(input),response=validateModelResponse(output,request,output.attemptId),c=response.continuation;
 if(request.provider!=='anthropic'||response.status!=='completed'||!response.toolCalls.length||!c||c.model!==request.model||c.prefixDigest!==anthropicPrefixDigest(request)||results.length!==response.toolCalls.length||new Set(results.map(r=>r.id)).size!==results.length||results.some(r=>!response.toolCalls.some(call=>call.id===r.id)))throw new ProviderFailure('invalid-request');
 const history=request.providerExtensions.anthropic?.history??[];if(!Array.isArray(history))throw new ProviderFailure('invalid-request');
 const next=validateModelRequest({...request,requestId:randomUUID(),messages:[...request.messages,{role:'assistant',content:response.text,toolCalls:response.toolCalls},...results.map(r=>({role:'tool',toolCallId:r.id,content:r.content}))],providerExtensions:{...request.providerExtensions,anthropic:{history:[...history,{index:request.messages.length,continuation:c}]}}});
 anthropicHistory(next);return next;
}
