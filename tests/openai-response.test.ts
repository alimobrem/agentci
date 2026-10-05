import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {openAIResponse} from '../packages/providers/openai-response.ts';
const request=()=>({...JSON.parse(readFileSync(new URL('../specs/api/fixtures/model-request.json',import.meta.url),'utf8')),provider:'openai'});
const wire=()=>({id:'resp-fixture',model:request().model,status:'completed',output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'{"claim":"fixture"}',annotations:[]}]}],usage:{input_tokens:20,output_tokens:10,total_tokens:30}});
test('OpenAI response preserves structured output and token usage without fabricating billed cost',()=>{const result=openAIResponse(wire(),request(),'attempt-1','req-fixture');assert.deepEqual(result.structuredOutput,{claim:'fixture'});assert.equal(result.providerRequestId,'req-fixture');assert.deepEqual(result.usage,{inputTokens:20,outputTokens:10,costUsdMicros:null,costKind:'unknown',pricingRevision:null});});
test('OpenAI refusal and incomplete responses never produce actionable structured output',()=>{
 const refusal={...wire(),output:[{type:'message',role:'assistant',status:'completed',content:[{type:'refusal',refusal:'Unable to comply'}]}]};const result=openAIResponse(refusal,request(),'attempt-1');assert.equal(result.status,'refused');assert.equal(result.structuredOutput,null);
 const incomplete={...wire(),status:'incomplete',output:[{type:'message',role:'assistant',status:'incomplete',content:[{type:'output_text',text:'{"claim":'}]},{type:'function_call',arguments:'{'}]};const partial=openAIResponse(incomplete,request(),'attempt-1');assert.equal(partial.status,'incomplete');assert.equal(partial.structuredOutput,null);assert.deepEqual(partial.toolCalls,[]);
});
test('OpenAI tools remain schema-checked proposals and unfamiliar output is rejected',()=>{
 const req={...request(),responseSchema:null,tools:[{name:'inspect',description:'Inspect',inputSchema:{type:'object',properties:{path:{type:'string'}},required:['path'],additionalProperties:false}}]};const output=[{type:'function_call',call_id:'call-1',name:'inspect',arguments:'{"path":"a.ts"}',status:'completed'}];assert.deepEqual(openAIResponse({...wire(),output},req,'attempt-1').toolCalls,[{id:'call-1',name:'inspect',arguments:{path:'a.ts'}}]);
 for(const change of [{model:'substituted'},{status:'queued'},{usage:{input_tokens:20,output_tokens:10,total_tokens:0}},{output:[{type:'unknown'}]},{output:[{...output[0],arguments:'{"path":123}'}]}])assert.throws(()=>openAIResponse({...wire(),output,...change},req,'attempt-1'),/invalid-output/);
});
test('tool proposal may precede the requested final structured answer',()=>{
 const req={...request(),tools:[{name:'inspect',description:'Inspect',inputSchema:{type:'object',properties:{},additionalProperties:false}}]};const result=openAIResponse({...wire(),output:[{type:'function_call',call_id:'call-1',name:'inspect',arguments:'{}'}]},req,'attempt-1');assert.equal(result.structuredOutput,null);assert.equal(result.toolCalls.length,1);
 assert.throws(()=>openAIResponse({...wire(),output:[]},req,'attempt-1'),/invalid-output/);
});
