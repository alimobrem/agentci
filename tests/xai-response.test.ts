import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {xAIResponse} from '../packages/providers/xai-response.ts';
const fixture=()=>({...JSON.parse(readFileSync(new URL('../specs/api/fixtures/model-request.json',import.meta.url),'utf8')),provider:'xai'});
const output=()=>({model:'fixture-model',status:'completed',output:[{type:'reasoning',encrypted_content:'opaque-fixture',summary:[]},{type:'message',role:'assistant',content:[{type:'output_text',text:'{"claim":"fixture"}'}]}],usage:{input_tokens:2,output_tokens:3,total_tokens:5}});
test('xAI normalizes output and preserves private encrypted state without inventing usage or cost',()=>{
 const raw=output(),r=xAIResponse(raw,fixture(),'attempt');assert.deepEqual(r.structuredOutput,{claim:'fixture'});assert.equal(r.text.includes('opaque'),false);assert.deepEqual(r.continuation?.content,raw.output);assert.equal(r.usage.costKind,'unknown');
 const missing=xAIResponse({...raw,usage:undefined},fixture(),'attempt');assert.equal(missing.usage.inputTokens,null);assert.equal(missing.usage.outputTokens,null);
 const reported=xAIResponse({...raw,usage:{...raw.usage,cost_in_nano_usd:1001,cost_in_usd_ticks:20001}},fixture(),'attempt');assert.equal(reported.usage.costUsdMicros,3);assert.equal(reported.usage.costKind,'reported');
});
test('xAI rejects mismatched models, unknown outputs, inconsistent usage and invalid charges',()=>{
 const raw=output();for(const change of [{model:'other'},{status:'in_progress'},{error:{message:'private'}},{output:[{type:'web_search_call'}]},{usage:{...raw.usage,total_tokens:1}},{usage:{...raw.usage,cost_in_nano_usd:-1}},{usage:{...raw.usage,cost_in_usd_ticks:Number.MAX_SAFE_INTEGER+1}},{usage:{...raw.usage,num_server_side_tools_used:1}}])assert.throws(()=>xAIResponse({...raw,...change},fixture(),'attempt'),/invalid-output/);
});
test('xAI truncation and refusal cannot produce actionable output or continuation',()=>{
 for(const raw of [{...output(),status:'incomplete',output:[{type:'function_call',arguments:'{'}]},{...output(),output:[{type:'message',role:'assistant',content:[{type:'refusal',refusal:'Declined'}]}]}]){
  const result=xAIResponse(raw,fixture(),'attempt');assert.notEqual(result.status,'completed');assert.equal(result.structuredOutput,null);assert.deepEqual(result.toolCalls,[]);assert.equal(result.continuation,undefined);
 }
});
