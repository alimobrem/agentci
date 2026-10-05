import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {validateModelRequest} from '../packages/providers/request.ts';
import {validateModelResponse} from '../packages/providers/response.ts';
import {ProviderFailure,type ModelResponse} from '../packages/providers/types.ts';
const request=()=>({...validateModelRequest(JSON.parse(readFileSync(new URL('../specs/api/fixtures/model-request.json',import.meta.url),'utf8'))),responseSchema:{type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false}});
const response=():ModelResponse=>({schemaVersion:'v1alpha1',requestId:request().requestId,attemptId:'attempt-1',provider:'fixture',model:request().model,status:'completed',text:'Review complete',structuredOutput:{ok:true},toolCalls:[],usage:{inputTokens:null,outputTokens:null,costUsdMicros:null,costKind:'unknown',pricingRevision:null},providerRequestId:null});
test('response binds exact request and attempt; validates structured output without coercion',()=>{
 const value=response();assert.deepEqual(validateModelResponse(value,request(),'attempt-1'),value);assert.notEqual(validateModelResponse(value,request(),'attempt-1'),value);
 for(const change of [{requestId:'another'},{attemptId:'another'},{provider:'other'},{model:'other'},{structuredOutput:{ok:'true'}},{structuredOutput:{ok:true,extra:1}},{secret:'private-fixture'},{text:'x'.repeat(1048577)}])assert.throws(()=>validateModelResponse({...value,...change},request(),'attempt-1'),error=>error instanceof ProviderFailure&&error.code==='invalid-output'&&error.dispatch==='possibly-sent'&&!error.message.includes('private'));
});
test('usage preserves unknown costs and rejects false accounting precision',()=>{
 const value=response();
 for(const usage of [{...value.usage,costUsdMicros:0},{...value.usage,costKind:'reported'},{...value.usage,inputTokens:-1},{...value.usage,outputTokens:1.5},{...value.usage,costKind:'estimated',costUsdMicros:5}])assert.throws(()=>validateModelResponse({...value,usage},request(),'attempt-1'),/invalid-output/);
 for(const usage of [{...value.usage,costKind:'reported',costUsdMicros:0},{...value.usage,costKind:'estimated',costUsdMicros:5,pricingRevision:'fixture-1'}])assert.deepEqual(validateModelResponse({...value,usage},request(),'attempt-1').usage,usage);
});
test('only declared schema-valid tool proposals are accepted; partial output is not actionable',()=>{
 const req={...request(),responseSchema:null,tools:[{name:'inspect',description:'Inspect',inputSchema:{type:'object',properties:{path:{type:'string'}},required:['path'],additionalProperties:false}}]};
 const value={...response(),structuredOutput:null,toolCalls:[{id:'call-1',name:'inspect',arguments:{path:'src/example.ts'}}]};assert.deepEqual(validateModelResponse(value,req,'attempt-1').toolCalls,value.toolCalls);
 for(const toolCalls of [[{...value.toolCalls[0],name:'execute'}],[{...value.toolCalls[0],arguments:{path:12}}],[...value.toolCalls,...value.toolCalls]])assert.throws(()=>validateModelResponse({...value,toolCalls},req,'attempt-1'),/invalid-output/);
 for(const status of ['refused','incomplete']){assert.throws(()=>validateModelResponse({...value,status},req,'attempt-1'),/invalid-output/);assert.equal(validateModelResponse({...value,status,toolCalls:[]},req,'attempt-1').status,status);}
});
test('observed model is optional for older adapters and bounded when reported',()=>{
 const value=response();assert.equal(validateModelResponse(value,request(),'attempt-1').observedModel,undefined);
 assert.equal(validateModelResponse({...value,observedModel:'upstream-snapshot'},request(),'attempt-1').observedModel,'upstream-snapshot');
 for(const observedModel of ['',null,1,'x'.repeat(257)])assert.throws(()=>validateModelResponse({...value,observedModel},request(),'attempt-1'),/invalid-output/);
});
test('continuation must bind provider and observed model and cannot accompany partial output',()=>{
 const value={...response(),observedModel:'snapshot',continuation:{provider:'fixture',model:'snapshot',prefixDigest:'a'.repeat(64),content:[]}};
 assert.deepEqual(validateModelResponse(value,request(),'attempt-1').continuation,value.continuation);
 for(const change of [{provider:'other'},{model:'other'},{prefixDigest:'bad'},{extra:true}])assert.throws(()=>validateModelResponse({...value,continuation:{...value.continuation,...change}},request(),'attempt-1'),/invalid-output/);
 assert.throws(()=>validateModelResponse({...value,status:'incomplete',structuredOutput:null},request(),'attempt-1'),/invalid-output/);
});
