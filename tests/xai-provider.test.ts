import test from 'node:test';import assert from 'node:assert/strict';
import {createXAIProvider,type XAIModelProfile} from '../packages/providers/xai.ts';
import {runProviderSmoke} from '../packages/providers/conformance.ts';
import {appendXAIToolResults} from '../packages/providers/xai-continuation.ts';
import type {BudgetLedger} from '../packages/providers/budget.ts';
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
