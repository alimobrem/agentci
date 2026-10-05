import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {anthropicResponse} from '../packages/providers/anthropic-response.ts';
const request=()=>({...JSON.parse(readFileSync(new URL('../specs/api/fixtures/model-request.json',import.meta.url),'utf8')),provider:'anthropic',developer:''});
const response=()=>({id:'message-fixture',type:'message',role:'assistant',model:'fixture-model',stop_reason:'end_turn',stop_sequence:null,content:[{type:'text',text:'{"claim":"fixture"}'}],usage:{input_tokens:10,output_tokens:5,cache_creation_input_tokens:2,cache_read_input_tokens:3}});
test('Anthropic output preserves observed identity and includes cache tokens without fabricating cost',()=>{
 const result=anthropicResponse(response(),request(),'attempt');assert.deepEqual(result.structuredOutput,{claim:'fixture'});assert.equal(result.usage.inputTokens,15);assert.equal(result.usage.costUsdMicros,null);assert.equal(result.observedModel,'fixture-model');
 const missing:any=response();delete missing.usage.cache_read_input_tokens;assert.equal(anthropicResponse(missing,request(),'attempt').usage.inputTokens,null);
 for(const usage of [{...response().usage,input_tokens:-1},{...response().usage,cache_creation_input_tokens:1.5},{...response().usage,input_tokens:Number.MAX_SAFE_INTEGER}])assert.throws(()=>anthropicResponse({...response(),usage},request(),'attempt'),/invalid-output/);
});
test('Anthropic refusal, truncation and pause never return actionable output',()=>{
 for(const stop_reason of ['refusal','max_tokens','pause_turn','model_context_window_exceeded']){
  const result=anthropicResponse({...response(),stop_reason,content:[{type:'text',text:'partial JSON'},{type:'tool_use',input:{}}]},request(),'attempt');assert.equal(result.status,stop_reason==='refusal'?'refused':'incomplete');assert.equal(result.structuredOutput,null);assert.deepEqual(result.toolCalls,[]);
 }
});
test('Anthropic validates tool proposals, stop reasons and explicitly approved snapshots',()=>{
 const req=request();req.tools=[{name:'inspect',description:'Inspect',inputSchema:{type:'object',properties:{},additionalProperties:false}}];
 const tool={type:'tool_use',id:'tool-1',name:'inspect',input:{}};
 assert.equal(anthropicResponse({...response(),stop_reason:'tool_use',content:[tool]},req,'attempt').toolCalls.length,1);
 for(const change of [{stop_reason:'unknown'},{stop_reason:null},{model:'unapproved'},{stop_reason:'tool_use',content:[]},{content:[tool]},{content:[{type:'server_tool_use'}]},{stop_reason:'stop_sequence',stop_sequence:'unexpected'}])assert.throws(()=>anthropicResponse({...response(),...change},req,'attempt'),/invalid-output/);
 assert.equal(anthropicResponse({...response(),model:'snapshot'},req,'attempt',null,['snapshot']).observedModel,'snapshot');
});
