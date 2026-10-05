import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {appendXAIToolResults} from '../packages/providers/xai-continuation.ts';
import {xAIResponse} from '../packages/providers/xai-response.ts';
import {xAIRequest} from '../packages/providers/xai-request.ts';
import {createXAITransport} from '../packages/providers/xai-transport.ts';
function fixture(){return {...JSON.parse(readFileSync(new URL('../specs/api/fixtures/model-request.json',import.meta.url),'utf8')),provider:'xai',tools:[{name:'inspect',description:'Inspect fixture',inputSchema:{type:'object',properties:{},additionalProperties:false}}],providerExtensions:{xai:{parallel_tool_calls:false}},policy:{deadlineAt:Date.now()+60000,maxAttempts:1,baseDelayMs:0,maxDelayMs:0}};}
const blocks=(n:number)=>[{type:'reasoning',id:`reason-${n}`,encrypted_content:`opaque-${n}`,summary:[]},{type:'function_call',id:`item-${n}`,call_id:`call-${n}`,name:'inspect',arguments:'{}',status:'completed'}];
test('xAI preserves encrypted output through two SDK tool-result round trips',async()=>{
 let calls=0,next=fixture();const ids=new Set<string>();
 const transport=createXAITransport('synthetic-fixture',async(input)=>{
  assert.ok(input instanceof Request);const body=await input.json(),turn=calls++;
  assert.equal(body.parallel_tool_calls,false);
  for(let previous=0;previous<turn;previous++){
   const index=3+previous*3;assert.deepEqual(body.input.slice(index,index+2),blocks(previous));
   assert.deepEqual(body.input[index+2],{type:'function_call_output',call_id:`call-${previous}`,output:`observed-${previous}`});
  }
  return new Response(JSON.stringify({id:`response-${turn}`,model:next.model,status:'completed',output:turn<2?blocks(turn):[{type:'message',role:'assistant',content:[{type:'output_text',text:'{"claim":"verified"}'}]}]}),{headers:{'content-type':'application/json'}});
 });
 for(let turn=0;turn<3;turn++){
  assert.equal(ids.has(next.requestId),false);ids.add(next.requestId);
  const raw=await transport.raw(next,{attemptId:`attempt-${turn}`,signal:new AbortController().signal}),response=xAIResponse(raw.payload,next,`attempt-${turn}`);
  if(turn<2){const deadline=next.policy.deadlineAt;next=appendXAIToolResults(next,response,[{id:`call-${turn}`,content:`observed-${turn}`}]);assert.equal(next.policy.deadlineAt,deadline);}
  else assert.deepEqual(response.structuredOutput,{claim:'verified'});
 }
 assert.equal(calls,3);
 for(const change of [{system:'changed'},{developer:'changed'},{model:'other'},{tools:[]}])assert.throws(()=>xAIRequest({...next,...change}),/invalid-request/);
 const forged=structuredClone(next);forged.messages[1].content='forged';assert.throws(()=>xAIRequest(forged),/invalid-request/);
});
test('xAI continuation rejects changed projections and missing or duplicated tool results',()=>{
 const req=fixture(),response=xAIResponse({model:req.model,status:'completed',output:blocks(0)},req,'attempt');
 for(const results of [[],[{id:'wrong',content:'x'}],[{id:'call-0',content:'x'},{id:'call-0',content:'y'}]])assert.throws(()=>appendXAIToolResults(req,response,results),/invalid-request/);
 const forged={...response,continuation:{...response.continuation!,content:[{type:'function_call',call_id:'other',name:'inspect',arguments:'{}'}]}};
 assert.throws(()=>appendXAIToolResults(req,forged,[{id:'call-0',content:'x'}]),/invalid-request/);
});
