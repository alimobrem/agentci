import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {xAIRequest} from '../packages/providers/xai-request.ts';
const fixture=()=>({...JSON.parse(readFileSync(new URL('../specs/api/fixtures/model-request.json',import.meta.url),'utf8')),provider:'xai'});
test('xAI mapping preserves instruction roles, schemas and tool order with storage disabled',()=>{
 const req=fixture();req.tools=[{name:'inspect',description:'Inspect fixture',inputSchema:{type:'object',properties:{},additionalProperties:false}}];
 req.messages.push({role:'assistant',content:'',toolCalls:[{id:'call-1',name:'inspect',arguments:{}}]},{role:'tool',toolCallId:'call-1',content:'observed'});
 const body=xAIRequest(req);assert.equal(body.store,false);assert.equal(body.service_tier,'default');assert.equal(body.max_output_tokens,256);
 assert.deepEqual(body.input,[{role:'system',content:req.system},{role:'developer',content:req.developer},req.messages[0],{type:'function_call',call_id:'call-1',name:'inspect',arguments:'{}'},{type:'function_call_output',call_id:'call-1',output:'observed'}]);
 assert.deepEqual(body.text?.format,{type:'json_schema',name:'agentci_response',schema:req.responseSchema});
 assert.equal('metadata' in body,false);assert.equal('strict' in body.tools![0]!,false);
});
test('xAI rejects unsupported controls rather than silently dropping them',()=>{
 const req=fixture();for(const change of [{provider:'openai'},{parameters:{maxOutputTokens:256,stop:['END']}},{providerExtensions:{xai:{endpoint:'https://untrusted.example'}}},{providerExtensions:{xai:{parallel_tool_calls:'yes'}}}])assert.throws(()=>xAIRequest({...req,...change}),/unsupported-capability/);
 const body=xAIRequest({...req,parameters:{maxOutputTokens:256,temperature:0.5,topP:0.8},providerExtensions:{xai:{parallel_tool_calls:false}}});
 assert.equal(body.temperature,0.5);assert.equal(body.top_p,0.8);assert.equal(body.parallel_tool_calls,false);
});
