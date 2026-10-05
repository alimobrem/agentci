import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {openAIRequest} from '../packages/providers/openai-request.ts';
const fixture=()=>({...JSON.parse(readFileSync(new URL('../specs/api/fixtures/model-request.json',import.meta.url),'utf8')),provider:'openai'});
test('OpenAI request preserves instruction roles, parameters, tool history and schemas',()=>{
 const req=fixture();req.tools=[{name:'inspect',description:'Inspect',inputSchema:{type:'object',properties:{path:{type:'string'}},required:['path'],additionalProperties:false}}];req.messages.push({role:'assistant',content:'',toolCalls:[{id:'call-1',name:'inspect',arguments:{path:'a.ts'}}]},{role:'tool',content:'observed',toolCallId:'call-1'});req.providerExtensions={openai:{parallel_tool_calls:false},another:{private:'not-forwarded'}};
 const wire=openAIRequest(req);assert.equal(wire.store,false);assert.equal(wire.service_tier,'default');assert.equal(wire.stream,false);assert.equal(wire.parallel_tool_calls,false);assert.equal(wire.max_output_tokens,256);assert.deepEqual(wire.input,[{role:'system',content:req.system},{role:'developer',content:req.developer},{role:'user',content:req.messages[0].content},{type:'function_call',call_id:'call-1',name:'inspect',arguments:'{"path":"a.ts"}'},{type:'function_call_output',call_id:'call-1',output:'observed'}]);assert.equal(wire.text?.format?.type,'json_schema');assert.equal(JSON.stringify(wire).includes('not-forwarded'),false);
});
test('OpenAI request rejects unsupported fields instead of silently losing intent',()=>{
 for(const change of [{provider:'other'},{parameters:{maxOutputTokens:10,stop:['END']}},{providerExtensions:{openai:{baseURL:'https://untrusted.invalid'}}},{providerExtensions:{openai:{parallel_tool_calls:'true'}}}])assert.throws(()=>openAIRequest({...fixture(),...change}),/unsupported-capability/);
});
test('OpenAI schema preflight rejects optional/open objects and unsupported composition without rewriting',()=>{
 const base={type:'object',properties:{value:{type:'string'}},required:['value'],additionalProperties:false};
 for(const schema of [{...base,required:[]},{...base,additionalProperties:true},{...base,allOf:[{type:'object'}]},{...base,properties:{value:{not:{type:'number'}}}},{type:'array',items:{type:'string'}}]){
  const req=fixture();req.responseSchema=schema;const before=JSON.stringify(req);
  assert.throws(()=>openAIRequest(req),/unsupported-capability/);assert.equal(JSON.stringify(req),before);
 }
 const req=fixture();req.tools=[{name:'inspect',description:'Inspect',inputSchema:{type:'object'}}];assert.throws(()=>openAIRequest(req),/unsupported-capability/);
});
test('OpenAI schema preflight preserves nullable recursive schemas and treats property names as data',()=>{
 const req=fixture();req.responseSchema={type:'object',properties:{not:{type:['string','null']},next:{anyOf:[{$ref:'#'},{type:'null'}]}},required:['not','next'],additionalProperties:false};
 const before=JSON.stringify(req.responseSchema);const wire=openAIRequest(req);assert.equal(JSON.stringify(wire.text?.format?.type==='json_schema'?wire.text.format.schema:null),before);
});
test('OpenAI schema preflight bounds enum size before dispatch',()=>{
 const req=fixture();req.responseSchema={type:'object',properties:{value:{type:'string',enum:Array.from({length:1001},(_,i)=>String(i))}},required:['value'],additionalProperties:false};assert.throws(()=>openAIRequest(req),/unsupported-capability/);
});
