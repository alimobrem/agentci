import test from 'node:test';import assert from 'node:assert/strict';
import {createAnthropicProvider,type AnthropicModelProfile} from '../packages/providers/anthropic.ts';
import {runProviderSmoke} from '../packages/providers/conformance.ts';
import type {BudgetLedger} from '../packages/providers/budget.ts';
import {readFileSync} from 'node:fs';
import {invokeModel} from '../packages/providers/execute.ts';
import {appendAnthropicToolResults} from '../packages/providers/anthropic-continuation.ts';
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
test('SDK tool-result round trips preserve signed blocks and account for each fresh request',async()=>{
 const p=profile();p.capabilities.extensions=true;
 const request={...JSON.parse(readFileSync(new URL('../specs/api/fixtures/model-request.json',import.meta.url),'utf8')),provider:'anthropic',developer:'',providerExtensions:{},tools:[{name:'inspect',description:'Inspect fixture',inputSchema:{type:'object',properties:{},additionalProperties:false}}],policy:{deadlineAt:Date.now()+60000,maxAttempts:1,baseDelayMs:0,maxDelayMs:0}};
 const actions:string[]=[],ids:string[]=[],blocks=[1,2].map(n=>[{type:'thinking',thinking:'',signature:`opaque-signed-state-${n}`},{type:'tool_use',id:`call-${n}`,name:'inspect',input:{}}]);
 const ledger:BudgetLedger={async reserve(r){actions.push('reserve');ids.push(r.requestId);return r.requestId;},async settle(){throw Error('No reported dollar cost');},async unknown(){actions.push('unknown');},async releaseNotSent(){throw Error('Unexpected pre-dispatch failure');}};
 let calls=0;
 const provider=createAnthropicProvider('synthetic-fixture',[p],async(_url,init)=>{
  actions.push('fetch');const body=JSON.parse(init!.body as string),turn=calls++;
  assert.equal(body.messages.length,1+2*turn);
  for(let prior=0;prior<turn;prior++){
   assert.deepEqual(body.messages[1+2*prior],{role:'assistant',content:blocks[prior]});
   assert.deepEqual(body.messages[2+2*prior],{role:'user',content:[{type:'tool_result',tool_use_id:`call-${prior+1}`,content:`observed-${prior+1}`}]});
  }
  return new Response(JSON.stringify({id:`msg-${turn}`,type:'message',role:'assistant',model:p.model,stop_reason:turn<2?'tool_use':'end_turn',content:turn<2?blocks[turn]:[{type:'text',text:'{"claim":"verified"}'}],usage:{input_tokens:2,output_tokens:3,cache_creation_input_tokens:0,cache_read_input_tokens:0}}),{headers:{'content-type':'application/json'}});
 });
 let next=request;
 for(let turn=0;turn<2;turn++){
  const proposal=await invokeModel(provider,next,ledger);
  assert.equal(proposal.text,'');assert.deepEqual(proposal.continuation?.content,blocks[turn]);
  next=appendAnthropicToolResults(next,proposal,[{id:`call-${turn+1}`,content:`observed-${turn+1}`}]);
 }
 const final=await invokeModel(provider,next,ledger);
 assert.deepEqual(final.structuredOutput,{claim:'verified'});assert.equal(calls,3);assert.equal(new Set(ids).size,3);
 assert.deepEqual(actions,Array.from({length:3},()=>['reserve','fetch','unknown']).flat());
 // A changed prefix must fail before either reserving money or issuing HTTP.
 await assert.rejects(invokeModel(provider,{...next,system:'changed instructions'},ledger),/invalid-request/);
 assert.equal(actions.length,9);
});
