import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {anthropicRequest} from '../packages/providers/anthropic-request.ts';
const request=()=>({...JSON.parse(readFileSync(new URL('../specs/api/fixtures/model-request.json',import.meta.url),'utf8')),provider:'anthropic',developer:''});
test('Anthropic mapping preserves tool-result grouping, schemas and standard service',()=>{
 const req=request();req.tools=[{name:'inspect',description:'Inspect',inputSchema:{type:'object',properties:{},additionalProperties:false}}];
 req.messages.push({role:'assistant',content:'Inspecting',toolCalls:[{id:'call-1',name:'inspect',arguments:{}},{id:'call-2',name:'inspect',arguments:{}}]},{role:'tool',toolCallId:'call-1',content:'first'},{role:'tool',toolCallId:'call-2',content:'second'});
 req.parameters.stop=['END'];const before=JSON.stringify(req),wire=anthropicRequest(req);
 assert.equal(wire.service_tier,'standard_only');assert.equal(wire.system,req.system);assert.equal(wire.max_tokens,256);assert.deepEqual(wire.stop_sequences,['END']);assert.equal(wire.output_config?.format?.type,'json_schema');
 assert.deepEqual(wire.messages[2],{role:'user',content:[{type:'tool_result',tool_use_id:'call-1',content:'first'},{type:'tool_result',tool_use_id:'call-2',content:'second'}]});assert.equal(JSON.stringify(req),before);assert.equal('metadata' in wire,false);
});
test('Anthropic mapping rejects unsupported roles/extensions and preserves sampling parameters',()=>{
 for(const change of [{provider:'other'},{developer:'must preserve hierarchy'},{providerExtensions:{anthropic:{baseURL:'https://untrusted.invalid'}}}])assert.throws(()=>anthropicRequest({...request(),...change}),/unsupported-capability/);
 const req=request();req.parameters={maxOutputTokens:10,temperature:0.5,topP:0.9};const wire=anthropicRequest(req);assert.equal(wire.temperature,0.5);assert.equal(wire.top_p,0.9);
});
