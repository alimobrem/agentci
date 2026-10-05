import {randomUUID} from 'node:crypto';
import type {InputItem} from '@xai-official/sdk';
import {canonical} from '../review/engine.ts';
import {validateModelRequest} from './request.ts';
import {validateModelResponse} from './response.ts';
import {xAIPrefixDigest,xAIResponse} from './xai-response.ts';
import {ProviderFailure,type ModelRequest,type ModelResponse} from './types.ts';
const object=(v:unknown):v is Record<string,any>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
/** Bind opaque output to its exact earlier context and normalized assistant projection. */
export function xAIHistory(request:ModelRequest):Map<number,InputItem[]>{
 try{
  const extension=request.providerExtensions.xai??{},history=extension.history??[];
  if(Object.keys(extension).some(key=>!['history','parallel_tool_calls'].includes(key))||!Array.isArray(history))throw Error();
  const result=new Map<number,InputItem[]>();let previous=-1;
  for(const entry of history as unknown[]){
   if(!object(entry)||Object.keys(entry).sort().join(',')!=='continuation,index'||!Number.isInteger(entry.index)||entry.index<=previous||entry.index>=request.messages.length)throw Error();
   const index=entry.index,c=entry.continuation,message=request.messages[index];
   const prefix={...request,messages:request.messages.slice(0,index),providerExtensions:{...request.providerExtensions,xai:{...extension,history:history.filter((item:any)=>object(item)&&Number.isInteger(item.index)&&item.index<index)}}};
   if(message?.role!=='assistant'||!object(c)||Object.keys(c).sort().join(',')!=='content,model,prefixDigest,provider'||c.provider!=='xai'||c.model!==request.model||c.prefixDigest!==xAIPrefixDigest(prefix))throw Error();
   const normalized=xAIResponse({model:c.model,status:'completed',output:c.content},prefix,'continuation-validation');
   if(normalized.status!=='completed'||normalized.text!==message.content||canonical(normalized.toolCalls)!==canonical(message.toolCalls??[]))throw Error();
   result.set(index,structuredClone(c.content));previous=index;
  }
  return result;
 }catch{throw new ProviderFailure('invalid-request');}
}
/** Append fixture or trusted tool results without executing tools or extending deadlines. */
export function appendXAIToolResults(input:ModelRequest,output:ModelResponse,results:{id:string;content:string}[]):ModelRequest{
 const request=validateModelRequest(input),response=validateModelResponse(output,request,output.attemptId),c=response.continuation;
 if(request.provider!=='xai'||response.status!=='completed'||!response.toolCalls.length||!c||c.model!==request.model||c.prefixDigest!==xAIPrefixDigest(request)||results.length!==response.toolCalls.length||new Set(results.map(r=>r.id)).size!==results.length||results.some(r=>!response.toolCalls.some(call=>call.id===r.id)))throw new ProviderFailure('invalid-request');
 const extension=request.providerExtensions.xai??{},history=extension.history??[];if(!Array.isArray(history))throw new ProviderFailure('invalid-request');
 const next=validateModelRequest({...request,requestId:randomUUID(),messages:[...request.messages,{role:'assistant',content:response.text,toolCalls:response.toolCalls},...results.map(r=>({role:'tool',toolCallId:r.id,content:r.content}))],providerExtensions:{...request.providerExtensions,xai:{...extension,history:[...history,{index:request.messages.length,continuation:c}]}}});
 xAIHistory(next);return next;
}
