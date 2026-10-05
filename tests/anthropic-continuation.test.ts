import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {anthropicResponse} from '../packages/providers/anthropic-response.ts';import {anthropicRequest} from '../packages/providers/anthropic-request.ts';import {appendAnthropicToolResults} from '../packages/providers/anthropic-continuation.ts';
function fixture(){
 const req={...JSON.parse(readFileSync(new URL('../specs/api/fixtures/model-request.json',import.meta.url),'utf8')),provider:'anthropic',developer:'',tools:[{name:'inspect',description:'Inspect',inputSchema:{type:'object',properties:{},additionalProperties:false}}]};
 const blocks=[{type:'thinking',thinking:'',signature:'opaque-signed-state'},{type:'tool_use',id:'call-1',name:'inspect',input:{}}];
 const res=anthropicResponse({type:'message',role:'assistant',model:req.model,stop_reason:'tool_use',content:blocks,usage:{input_tokens:1,output_tokens:1,cache_creation_input_tokens:0,cache_read_input_tokens:0}},req,'attempt');return {req,res,blocks};
}
test('tool results append signed blocks unchanged and bind preceding context',()=>{
 const {req,res,blocks}=fixture(),next=appendAnthropicToolResults(req,res,[{id:'call-1',content:'observed'}]);
 assert.notEqual(next.requestId,req.requestId);assert.deepEqual(anthropicRequest(next).messages[1]?.content,blocks);assert.equal(next.policy.deadlineAt,req.policy.deadlineAt);
 for(const change of [{system:'changed'},{model:'other'},{tools:[]},{messages:[{role:'user' as const,content:'changed'},...next.messages.slice(1)]}])assert.throws(()=>anthropicRequest({...next,...change}),/invalid-request/);
 const changed=structuredClone(next);changed.messages[1]!.content='forged';assert.throws(()=>anthropicRequest(changed),/invalid-request/);
});
test('continuation rejects missing or duplicate tool results and response/prefix mismatch',()=>{
 const {req,res}=fixture();for(const results of [[],[{id:'other',content:'x'}],[{id:'call-1',content:'a'},{id:'call-1',content:'b'}]])assert.throws(()=>appendAnthropicToolResults(req,res,results),/invalid-request/);
 assert.throws(()=>appendAnthropicToolResults({...req,system:'changed'},res,[{id:'call-1',content:'x'}]),/invalid-request/);
});
