import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createOpenAIProvider,type OpenAIModelProfile} from '../packages/providers/openai.ts';
import {invokeModel,streamModel} from '../packages/providers/execute.ts';import type {BudgetLedger} from '../packages/providers/budget.ts';
const request=()=>({...JSON.parse(readFileSync(new URL('../specs/api/fixtures/model-request.json',import.meta.url),'utf8')),provider:'openai',policy:{deadlineAt:Date.now()+5000,maxAttempts:1,baseDelayMs:1,maxDelayMs:2}});
const profile=():OpenAIModelProfile=>({model:'fixture-model',contextTokens:1000,maxOutputTokens:512,capabilities:{stream:true,tools:true,structuredOutput:true,developerInstructions:true,extensions:true},temperature:false,topP:false,inputUsdMicrosPerMillion:1000000,outputUsdMicrosPerMillion:2000000,pricingRevision:'synthetic-test-prices'});
const response=()=>({id:'resp-fixture',model:'fixture-model',status:'completed',output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'{"claim":"fixture"}'}]}],usage:{input_tokens:1,output_tokens:1,total_tokens:2}});
test('registered OpenAI provider reserves conservative cost and invokes through official SDK',async()=>{
 const records:string[]=[];const ledger:BudgetLedger={async reserve(input){assert.equal(input.upperBoundUsdMicros,1512);records.push('reserve');return 'attempt-1';},async settle(){throw Error('No actual dollar cost was reported');},async unknown(){records.push('unknown');},async releaseNotSent(){records.push('release');}};
 const provider=createOpenAIProvider('synthetic-fixture',[profile()],async()=>{records.push('fetch');return new Response(JSON.stringify(response()),{headers:{'content-type':'application/json'}});});assert.equal(provider.upstreamIdentity,'openai');const result=await invokeModel(provider,request(),ledger);assert.equal(result.status,'completed');assert.deepEqual(records,['reserve','fetch','unknown']);
});
test('registered OpenAI stream traverses SDK, translator, core validation and accounting',async()=>{
 const req=request();const events=[{type:'response.created',response:{id:'resp-fixture'}},{type:'response.output_item.added',output_index:0,item:{id:'msg-1',type:'message'}},{type:'response.output_text.delta',item_id:'msg-1',output_index:0,delta:'{"claim":"fixture"}'},{type:'response.completed',response:response()}].map((e,sequence_number)=>({...e,sequence_number}));
 const provider=createOpenAIProvider('synthetic-fixture',[profile()],async()=>new Response(events.map(e=>`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''),{headers:{'content-type':'text/event-stream'}}));let reserved=false,accounted=false;const ledger:BudgetLedger={async reserve(){reserved=true;return 'attempt-1';},async settle(){throw Error();},async unknown(){accounted=true;},async releaseNotSent(){throw Error();}};const seen:string[]=[];const result=await streamModel(provider,req,ledger,e=>{assert.equal(reserved,true);seen.push(e.type);});assert.equal(accounted,true);assert.deepEqual(result.structuredOutput,{claim:'fixture'});assert.deepEqual(seen,['start','text-delta','usage']);
});
test('model allowlist and capabilities reject unsupported requests before network access',async()=>{
 let calls=0;const provider=createOpenAIProvider('synthetic-fixture',[profile()],async()=>{calls++;throw Error();});for(const req of [{...request(),model:'unknown'},{...request(),parameters:{maxOutputTokens:256,temperature:1}},{...request(),parameters:{maxOutputTokens:513}}])await assert.rejects(provider.invoke(req,{attemptId:'attempt-1',signal:new AbortController().signal}),/invalid-request|unsupported-capability/);assert.equal(calls,0);
 const p=profile();p.inputUsdMicrosPerMillion=0;assert.throws(()=>createOpenAIProvider('synthetic-fixture',[p]),/invalid-request/);
});
test('registered profiles are detached from later caller mutation',()=>{const p=profile(),provider=createOpenAIProvider('synthetic-fixture',[p]);p.capabilities.stream=false;p.inputUsdMicrosPerMillion=999999999;assert.equal(provider.capabilities().stream,true);assert.equal(provider.estimateCost!(request()).upperBoundUsdMicros,1512);});
test('schema rejection occurs before budget reservation or network dispatch',async()=>{
 const records:string[]=[];
 const ledger:BudgetLedger={async reserve(){records.push('reserve');return 'attempt-1';},async settle(){records.push('settle');},async unknown(){records.push('unknown');},async releaseNotSent(){records.push('release');}};
 const provider=createOpenAIProvider('synthetic-fixture',[profile()],async()=>{records.push('fetch');throw Error('Unexpected network call');});
 const req=request();req.responseSchema={type:'object',properties:{value:{type:'string'}},additionalProperties:false};
 await assert.rejects(invokeModel(provider,req,ledger),/invalid-request|unsupported-capability/);assert.deepEqual(records,[]);
});
test('model aliases accept only operator-approved snapshots and preserve observed identity',async()=>{
 for(const stream of [false,true])for(const allowed of [false,true]){
  const p=profile();if(allowed)p.responseModels=['fixture-snapshot'];
  const payload={...response(),model:'fixture-snapshot'};
  const provider=createOpenAIProvider('synthetic-fixture',[p],async()=>stream?new Response([
   {type:'response.created',response:{id:'resp-fixture'}},
   {type:'response.output_item.added',output_index:0,item:{id:'msg-1',type:'message'}},
   {type:'response.output_text.delta',item_id:'msg-1',output_index:0,delta:'{"claim":"fixture"}'},
   {type:'response.completed',response:payload}
  ].map((e,sequence_number)=>`data: ${JSON.stringify({...e,sequence_number})}\n\n`).join(''),{headers:{'content-type':'text/event-stream'}}):new Response(JSON.stringify(payload),{headers:{'content-type':'application/json'}}));
  // Later mutation must not widen the registered policy.
  if(p.responseModels)p.responseModels.push('unapproved-snapshot');
  const context={attemptId:'attempt-1',signal:new AbortController().signal};
  const run=async()=>{if(!stream)return provider.invoke(request(),context);let terminal;for await(const event of provider.stream(request(),context))if(event.type==='terminal')terminal=event.response;return terminal!;};
  if(allowed){const result=await run();assert.equal(result.model,'fixture-model');assert.equal(result.observedModel,'fixture-snapshot');}
  else await assert.rejects(run(),/invalid-output/);
 }
 for(const responseModels of [[],[''],['same','same']])assert.throws(()=>createOpenAIProvider('synthetic-fixture',[{...profile(),responseModels}]),/invalid-request/);
});
test('SDK outage recovery reserves every attempt and retains ambiguous charges',async()=>{
 const records:string[]=[];let calls=0;
 const ledger:BudgetLedger={async reserve(input){records.push(`reserve:${input.attempt}`);return `attempt-${input.attempt}`;},async settle(){throw Error('No billed cost');},async unknown(id){records.push(`unknown:${id}`);},async releaseNotSent(id){records.push(`release:${id}`);}};
 const provider=createOpenAIProvider('synthetic-fixture',[profile()],async()=>{
  calls++;records.push(`fetch:${calls}`);
  if(calls<3)return new Response(JSON.stringify({error:{code:calls===1?'rate_limit_exceeded':'server_error',message:'private upstream details'}}),{status:calls===1?429:503,headers:{'content-type':'application/json','retry-after-ms':'0'}});
  return new Response(JSON.stringify(response()),{headers:{'content-type':'application/json'}});
 });
 const req=request();req.policy.maxAttempts=3;
 const result=await invokeModel(provider,req,ledger);
 assert.equal(result.status,'completed');assert.equal(result.attemptId,'attempt-3');
 assert.deepEqual(records,['reserve:1','fetch:1','release:attempt-1','reserve:2','fetch:2','unknown:attempt-2','reserve:3','fetch:3','unknown:attempt-3']);
});
test('SDK quota and excessive retry delay never trigger a hidden retry',async()=>{
 for(const mode of ['quota','delay']){
  let calls=0;const records:string[]=[];
  const ledger:BudgetLedger={async reserve(){records.push('reserve');return 'attempt-1';},async settle(){throw Error();},async unknown(){records.push('unknown');},async releaseNotSent(){records.push('release');}};
  const provider=createOpenAIProvider('synthetic-fixture',[profile()],async()=>{calls++;return new Response(JSON.stringify({error:{code:mode==='quota'?'insufficient_quota':'rate_limit_exceeded',message:'private upstream details'}}),{status:429,headers:{'content-type':'application/json','retry-after':mode==='delay'?'9'.repeat(100):'0'}});});
  const req=request();req.policy.maxAttempts=3;
  await assert.rejects(invokeModel(provider,req,ledger),error=>error instanceof Error&&error.message==='rate-limit');assert.equal(calls,1);assert.deepEqual(records,['reserve','release']);
 }
});
