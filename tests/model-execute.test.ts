import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {invokeModel} from '../packages/providers/execute.ts';import {ProviderFailure,type ModelProvider,type ModelResponse} from '../packages/providers/types.ts';import type {BudgetLedger,Reservation} from '../packages/providers/budget.ts';
const request=()=>({...JSON.parse(readFileSync(new URL('../specs/api/fixtures/model-request.json',import.meta.url),'utf8')),policy:{deadlineAt:Date.now()+5000,maxAttempts:3,baseDelayMs:1,maxDelayMs:2}});
function setup(){
 const events:unknown[][]=[];let calls=0;
 const ledger:BudgetLedger={async reserve(input:Reservation){events.push(['reserve',input.attempt]);return `attempt-${input.attempt}`;},async settle(id,cost){events.push(['settle',id,cost]);},async unknown(id){events.push(['unknown',id]);},async releaseNotSent(id){events.push(['release',id]);}};
 const provider:ModelProvider={id:'fixture',upstreamIdentity:'fixture',capabilities:()=>({stream:true,tools:true,structuredOutput:true,developerInstructions:true,extensions:true}),estimateCost:()=>({upperBoundUsdMicros:100,pricingRevision:'test-v1',maxInputTokens:10000,maxOutputTokens:256}),async invoke(req,context){calls++;return {schemaVersion:'v1alpha1',requestId:req.requestId,attemptId:context.attemptId,provider:req.provider,model:req.model,status:'completed',text:'ok',structuredOutput:{claim:'bounded fixture'},toolCalls:[],usage:{inputTokens:10,outputTokens:5,costUsdMicros:10,costKind:'reported',pricingRevision:null},providerRequestId:null};},async *stream(){throw Error('not used');}};
 return {events,ledger,provider,calls:()=>calls};
}
test('invoke reserves before dispatch, validates output and settles only reported cost',async()=>{
 const s=setup();await invokeModel(s.provider,request(),s.ledger);assert.deepEqual(s.events,[['reserve',1],['settle','attempt-1',10]]);assert.equal(s.calls(),1);
 const invoke=s.provider.invoke;s.provider.invoke=async(req,ctx)=>{const result=await invoke(req,ctx);result.usage={...result.usage,costKind:'estimated',pricingRevision:'test-v1'};return result;};s.events.length=0;await invokeModel(s.provider,request(),s.ledger);assert.deepEqual(s.events,[['reserve',1],['unknown','attempt-1']]);
});
test('bounded retries preserve possibly charged failures and release proven not-sent failures',async()=>{
 const s=setup(),invoke=s.provider.invoke;let tries=0;s.provider.invoke=async(req,ctx)=>{tries++;if(tries===1)throw new ProviderFailure('rate-limit',true,'not-sent');if(tries===2)throw new ProviderFailure('transport',true,'possibly-sent');return invoke(req,ctx);};
 await invokeModel(s.provider,request(),s.ledger);assert.deepEqual(s.events,[['reserve',1],['release','attempt-1'],['reserve',2],['unknown','attempt-2'],['reserve',3],['settle','attempt-3',10]]);
});
test('budget exhaustion and expired/cancelled calls never dispatch',async()=>{
 for(const mode of ['budget','expired','cancelled']){const s=setup(),req=request(),controller=new AbortController();if(mode==='budget')s.ledger.reserve=async()=>{throw new ProviderFailure('budget-exhausted');};if(mode==='expired')req.policy.deadlineAt=Date.now()-1;if(mode==='cancelled')controller.abort('private reason');await assert.rejects(invokeModel(s.provider,req,s.ledger,controller.signal),new RegExp(mode==='budget'?'budget-exhausted':mode==='expired'?'deadline':'cancelled'));assert.equal(s.calls(),0);}
});
test('deadline bounds an uncooperative provider and retains its reservation',async(t)=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:Date.now()});
 const s=setup(),req=request();req.policy.deadlineAt=Date.now()+40;s.provider.invoke=async()=>{t.mock.timers.tick(41);return new Promise<ModelResponse>(()=>{});};await assert.rejects(invokeModel(s.provider,req,s.ledger),/deadline/);assert.deepEqual(s.events,[['reserve',1],['unknown','attempt-1']]);
});
test('cancellation during reservation releases after reservation completes without dispatch',async()=>{
 const s=setup(),controller=new AbortController();s.ledger.reserve=async()=>{controller.abort();return 'attempt-1';};await assert.rejects(invokeModel(s.provider,request(),s.ledger,controller.signal),/cancelled/);assert.equal(s.calls(),0);assert.deepEqual(s.events,[['release','attempt-1']]);
});
test('malformed output and raw errors are redacted and never retried implicitly',async()=>{
 for(const malformed of [true,false]){const s=setup();s.provider.invoke=async()=>{if(malformed)return {secret:'private-fixture'} as any;throw Error('private-fixture');};await assert.rejects(invokeModel(s.provider,request(),s.ledger),error=>error instanceof ProviderFailure&&!error.message.includes('private')&&error.dispatch==='possibly-sent');assert.deepEqual(s.events,[['reserve',1],['unknown','attempt-1']]);}
});
test('accounting failure cannot return success or authorize another dispatch',async()=>{
 const s=setup();s.ledger.settle=async()=>{throw Error('private database details');};await assert.rejects(invokeModel(s.provider,request(),s.ledger),/ambiguous-attempt/);assert.equal(s.calls(),1);
});
test('retry count is bounded and missing or invalid estimates prevent reservation',async t=>{
 // This case checks attempt count, not elapsed time; real backoff timers remain active.
 t.mock.timers.enable({apis:['Date'],now:Date.UTC(2026,9,6)});
 const s=setup();let tries=0;s.provider.invoke=async()=>{tries++;throw new ProviderFailure('rate-limit',true,'not-sent');};await assert.rejects(invokeModel(s.provider,request(),s.ledger),/rate-limit/);assert.equal(tries,3);assert.equal(s.events.filter(event=>event[0]==='reserve').length,3);
 for(const estimateCost of [undefined,()=>{throw Error('private fixture');},()=>({upperBoundUsdMicros:0,pricingRevision:'fixture',maxInputTokens:10,maxOutputTokens:256})]){const fixture=setup();fixture.provider.estimateCost=estimateCost;await assert.rejects(invokeModel(fixture.provider,request(),fixture.ledger),/invalid-request/);assert.deepEqual(fixture.events,[]);}
});
test('cancellation during settlement preserves known cost but cannot report success',async()=>{
 const s=setup(),controller=new AbortController();s.ledger.settle=async(id,cost)=>{s.events.push(['settle',id,cost]);controller.abort();};await assert.rejects(invokeModel(s.provider,request(),s.ledger,controller.signal),error=>error instanceof ProviderFailure&&error.code==='cancelled'&&error.dispatch==='possibly-sent');assert.deepEqual(s.events,[['reserve',1],['settle','attempt-1',10]]);assert.equal(s.calls(),1);
});
test('deadline reached during settlement records accounting before returning deadline',async(t)=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:Date.now()});
 const s=setup(),req=request();req.policy.deadlineAt=Date.now()+50;s.ledger.settle=async(id,cost)=>{s.events.push(['settle',id,cost]);t.mock.timers.tick(70);};await assert.rejects(invokeModel(s.provider,req,s.ledger),/deadline/);assert.deepEqual(s.events,[['reserve',1],['settle','attempt-1',10]]);
});
test('server retry delays beyond policy are not shortened into early retries',async()=>{
 const s=setup();let tries=0;s.provider.invoke=async()=>{tries++;throw new ProviderFailure('rate-limit',true,'not-sent',10000);};await assert.rejects(invokeModel(s.provider,request(),s.ledger),/rate-limit/);assert.equal(tries,1);assert.deepEqual(s.events,[['reserve',1],['release','attempt-1']]);
});
