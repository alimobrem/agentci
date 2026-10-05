import test from 'node:test';import assert from 'node:assert/strict';
import {createXAIProvider,type XAIModelProfile} from '../packages/providers/xai.ts';
import {runProviderSmoke} from '../packages/providers/conformance.ts';
import {appendXAIToolResults} from '../packages/providers/xai-continuation.ts';
import type {BudgetLedger} from '../packages/providers/budget.ts';
import {readFileSync} from 'node:fs';
import {invokeModel,streamModel} from '../packages/providers/execute.ts';
const request=()=>({...JSON.parse(readFileSync(new URL('../specs/api/fixtures/model-request.json',import.meta.url),'utf8')),provider:'xai',policy:{deadlineAt:Date.now()+60000,maxAttempts:3,baseDelayMs:0,maxDelayMs:0}});
const profile=():XAIModelProfile=>({model:'fixture-model',contextTokens:10000,maxOutputTokens:2048,requireToolContinuation:true,capabilities:{stream:true,tools:true,structuredOutput:true,developerInstructions:true,extensions:true},temperature:true,topP:true,inputUsdMicrosPerMillion:1000000,outputUsdMicrosPerMillion:2000000,pricingRevision:'synthetic'});
test('xAI shared smoke uses SDK JSON/SSE, continuation and durable per-attempt accounting',async()=>{
 const actions:string[]=[];
 const ledger:BudgetLedger={async reserve(r){actions.push('reserve');assert.equal(r.upperBoundUsdMicros,12048);return r.requestId;},async settle(_id,cost){assert.equal(cost,1);actions.push('settle');},async unknown(){throw Error('Fixture reports cost');},async releaseNotSent(){throw Error('Unexpected rejection');}};
 const provider=createXAIProvider('synthetic-fixture',[profile()],async(input)=>{
  assert.ok(input instanceof Request);actions.push('fetch');const body=await input.json(),tool=!!body.tools?.length&&!body.input.some((item:any)=>item.type==='function_call_output');
  const item=tool?{id:'tool-1',type:'function_call',call_id:'call-1',name:'check_fixture',arguments:'{"marker":"agentci-smoke"}',status:'completed'}:{id:'message-1',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'{"ok":true}'}]};
  const response={id:'response-1',model:'fixture-model',status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2,cost_in_usd_ticks:10000}};
  if(!body.stream)return new Response(JSON.stringify(response),{headers:{'content-type':'application/json'}});
  const events=[{type:'response.created',response:{...response,status:'in_progress',output:[]}},{type:'response.output_item.added',output_index:0,item:{...item,status:'in_progress',content:[]}},{type:'response.output_text.delta',delta:'{"ok":true}'},{type:'response.output_item.done',output_index:0,item},{type:'response.completed',response}];
  return new Response(events.map(event=>`data: ${JSON.stringify(event)}\n\n`).join(''),{headers:{'content-type':'text/event-stream'}});
 });
 const result=await runProviderSmoke(provider,'fixture-model',ledger,undefined,{appendToolResults:appendXAIToolResults});assert.equal(result.length,4);assert.deepEqual(actions,Array.from({length:4},()=>['reserve','fetch','settle']).flat());assert.equal(provider.upstreamIdentity,'xai');
});
test('xAI model capabilities and upper prices are detached from caller mutation',()=>{
 const p=profile(),provider=createXAIProvider('synthetic-fixture',[p]);p.capabilities.stream=false;p.contextTokens=1;assert.equal(provider.capabilities().stream,true);
 assert.throws(()=>createXAIProvider('synthetic-fixture',[{...profile(),capabilities:{...profile().capabilities,extensions:false}}]),/invalid-request/);
});
test('xAI outage recovery reserves every retry and retains ambiguous charges',async()=>{
 for(const status of [429,503]){
  const actions:string[]=[];let calls=0;
  const ledger:BudgetLedger={async reserve(r){actions.push(`reserve-${r.attempt}`);return `attempt-${r.attempt}`;},async settle(id,cost){assert.equal(cost,1);actions.push(`settle-${id}`);},async unknown(id){actions.push(`unknown-${id}`);},async releaseNotSent(id){actions.push(`release-${id}`);}};
  const provider=createXAIProvider('synthetic-fixture',[profile()],async()=>{
   calls++;if(calls===1)return new Response('private outage',{status,headers:{'retry-after':'0'}});
   return new Response(JSON.stringify({id:'recovered',model:'fixture-model',status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'{"claim":"recovered"}'}]}],usage:{input_tokens:1,output_tokens:1,total_tokens:2,cost_in_usd_ticks:10000}}),{headers:{'content-type':'application/json'}});
  });
  const result=await invokeModel(provider,request(),ledger);assert.deepEqual(result.structuredOutput,{claim:'recovered'});assert.equal(calls,2);
  assert.deepEqual(actions,['reserve-1',`${status===429?'release':'unknown'}-attempt-1`,'reserve-2','settle-attempt-2']);
 }
});
test('xAI cannot replay an interrupted stream after provisional output',async()=>{
 const actions:string[]=[],observed:string[]=[];let calls=0;
 const ledger:BudgetLedger={async reserve(){actions.push('reserve');return 'attempt';},async settle(){throw Error();},async unknown(){actions.push('unknown');},async releaseNotSent(){throw Error();}};
 const provider=createXAIProvider('synthetic-fixture',[profile()],async()=>{
  calls++;const events=[{type:'response.created',response:{id:'interrupted',model:'fixture-model',status:'in_progress',output:[]}},{type:'response.output_item.added',output_index:0,item:{id:'message-1',type:'message',role:'assistant',content:[]}},{type:'response.output_text.delta',delta:'{"claim":'},{type:'error',status:503,message:'private outage'}];
  return new Response(events.map(event=>`data: ${JSON.stringify(event)}\n\n`).join(''),{headers:{'content-type':'text/event-stream'}});
 });
 await assert.rejects(streamModel(provider,request(),ledger,event=>{observed.push(event.type);}),/transport/);
 assert.deepEqual(observed,['start','text-delta']);assert.equal(calls,1);assert.deepEqual(actions,['reserve','unknown']);
});
test('xAI invalid schema fails before budget reservation and HTTP dispatch',async()=>{
 const actions:string[]=[];const ledger:BudgetLedger={async reserve(){actions.push('reserve');return 'attempt';},async settle(){},async unknown(){},async releaseNotSent(){}};
 const provider=createXAIProvider('synthetic-fixture',[profile()],async()=>{actions.push('fetch');throw Error();});
 const req=request();req.responseSchema={type:'object',properties:{text:{type:'string',pattern:'(?=unsupported)'}},additionalProperties:false};
 await assert.rejects(invokeModel(provider,req,ledger),/invalid-request/);assert.deepEqual(actions,[]);
});
