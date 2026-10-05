import test from 'node:test';import assert from 'node:assert/strict';
import {createAnthropicProvider,type AnthropicModelProfile} from '../packages/providers/anthropic.ts';
import {runProviderSmoke} from '../packages/providers/conformance.ts';
import type {BudgetLedger} from '../packages/providers/budget.ts';
const profile=():AnthropicModelProfile=>({model:'fixture-model',contextTokens:10000,maxOutputTokens:2048,capabilities:{stream:true,tools:true,structuredOutput:true,developerInstructions:false,extensions:false},temperature:true,topP:true,inputUsdMicrosPerMillion:1000000,outputUsdMicrosPerMillion:2000000,pricingRevision:'synthetic'});
test('Anthropic runs the shared smoke corpus through SDK, streaming and per-request budgets',async()=>{
 const actions:string[]=[];
 const ledger:BudgetLedger={async reserve(r){actions.push('reserve');assert.equal(r.upperBoundUsdMicros,12048);return r.requestId;},async settle(){throw Error('No reported dollar cost');},async unknown(){actions.push('unknown');},async releaseNotSent(){throw Error();}};
 const provider=createAnthropicProvider('synthetic-fixture',[profile()],async(_url,init)=>{
  actions.push('fetch');const body=JSON.parse(init!.body as string),tools=!!body.tools?.length;
  const message={id:'msg-fixture',type:'message',role:'assistant',model:'fixture-model',stop_reason:tools?'tool_use':'end_turn',content:tools?[{type:'tool_use',id:'call-1',name:'check_fixture',input:{marker:'agentci-smoke'}}]:[{type:'text',text:'{"ok":true}'}],usage:{input_tokens:2,output_tokens:3,cache_creation_input_tokens:0,cache_read_input_tokens:0}};
  if(!body.stream)return new Response(JSON.stringify(message),{headers:{'content-type':'application/json'}});
  const events=[{type:'message_start',message:{...message,content:[],stop_reason:null,usage:{...message.usage,output_tokens:0}}},{type:'content_block_start',index:0,content_block:{type:'text',text:''}},{type:'content_block_delta',index:0,delta:{type:'text_delta',text:'{"ok":true}'}},{type:'content_block_stop',index:0},{type:'message_delta',delta:{stop_reason:'end_turn'},usage:{output_tokens:3}},{type:'message_stop'}];
  return new Response(events.map(e=>`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''),{headers:{'content-type':'text/event-stream'}});
 });
 const records=await runProviderSmoke(provider,'fixture-model',ledger);assert.equal(records.length,3);assert.deepEqual(actions,Array.from({length:3},()=>['reserve','fetch','unknown']).flat());assert.equal(provider.upstreamIdentity,'anthropic');
});
test('Anthropic profiles cannot advertise unsupported developer or extension semantics',()=>{
 for(const key of ['developerInstructions'] as const){const p=profile();p.capabilities[key]=true;assert.throws(()=>createAnthropicProvider('synthetic-fixture',[p]),/unsupported-capability/);}
 const p=profile(),provider=createAnthropicProvider('synthetic-fixture',[p]);p.capabilities.stream=false;assert.equal(provider.capabilities().stream,true);
});
test('unsupported Anthropic schema fails before reservation and network access',async()=>{
 const actions:string[]=[];const ledger:BudgetLedger={async reserve(){actions.push('reserve');return 'attempt';},async settle(){},async unknown(){},async releaseNotSent(){}};
 const provider=createAnthropicProvider('synthetic-fixture',[profile()],async()=>{actions.push('fetch');throw Error();});
 const estimate=provider.estimateCost!;provider.estimateCost=req=>estimate({...req,responseSchema:{type:'object',properties:{value:{type:'number',minimum:1}},required:['value'],additionalProperties:false}});
 await assert.rejects(runProviderSmoke(provider,'fixture-model',ledger),/invalid-request|unsupported-capability/);assert.deepEqual(actions,[]);
});
