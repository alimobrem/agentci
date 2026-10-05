import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {streamModel} from '../packages/providers/execute.ts';import {ProviderFailure,type ModelProvider,type ModelEvent} from '../packages/providers/types.ts';import type {BudgetLedger} from '../packages/providers/budget.ts';
function setup(){
 const request={...JSON.parse(readFileSync(new URL('../specs/api/fixtures/model-request.json',import.meta.url),'utf8')),policy:{deadlineAt:Date.now()+5000,maxAttempts:3,baseDelayMs:1,maxDelayMs:2}};
 const events:string[]=[];let calls=0;
 const ledger:BudgetLedger={async reserve(){events.push('reserve');return 'attempt-1';},async settle(){events.push('settle');},async unknown(){events.push('unknown');},async releaseNotSent(){events.push('release');}};
 const provider:ModelProvider={id:'fixture',upstreamIdentity:'fixture',capabilities:()=>({stream:true,tools:true,structuredOutput:true,developerInstructions:true,extensions:true}),estimateCost:()=>({upperBoundUsdMicros:100,pricingRevision:'test',maxInputTokens:10000,maxOutputTokens:256}),async invoke(){throw Error('must stream');},async *stream(req,ctx){calls++;yield {type:'start',requestId:req.requestId,attemptId:ctx.attemptId,provider:req.provider,model:req.model};yield {type:'text-delta',text:'ok'};yield {type:'terminal',response:{schemaVersion:'v1alpha1',requestId:req.requestId,attemptId:ctx.attemptId,provider:req.provider,model:req.model,status:'completed',text:'ok',structuredOutput:{claim:'fixture'},toolCalls:[],usage:{inputTokens:1,outputTokens:1,costUsdMicros:1,costKind:'reported',pricingRevision:null},providerRequestId:null}};}};
 return {request,events,ledger,provider,calls:()=>calls};
}
test('stream observer receives backpressured provisional events and completion follows settlement',async()=>{
 const s=setup();const result=await streamModel(s.provider,s.request,s.ledger,async event=>{s.events.push(event.type);await Promise.resolve();});assert.equal(result.text,'ok');assert.deepEqual(s.events,['reserve','start','text-delta','settle']);assert.equal(s.calls(),1);
});
test('failure after visible output cannot silently retry or release possibly charged work',async()=>{
 const s=setup();let calls=0;s.provider.stream=async function*(req,ctx){calls++;yield {type:'start',requestId:req.requestId,attemptId:ctx.attemptId,provider:req.provider,model:req.model};throw new ProviderFailure('transport',true,'not-sent');};await assert.rejects(streamModel(s.provider,s.request,s.ledger,()=>{}),/transport/);assert.equal(calls,1);assert.deepEqual(s.events,['reserve','unknown']);
});
test('terminal followed by extra events cannot settle or return success',async()=>{
 const s=setup(),stream=s.provider.stream;s.provider.stream=async function*(req,ctx){yield*stream(req,ctx);yield {type:'text-delta',text:'extra'};};await assert.rejects(streamModel(s.provider,s.request,s.ledger,()=>{}),/invalid-output/);assert.deepEqual(s.events,['reserve','unknown']);
});
test('deadline bounds stalled iterators and stalled consumers; cancellation closes the iterator',async()=>{
 for(const stalled of ['iterator','consumer']){const s=setup();s.request.policy.deadlineAt=Date.now()+50;if(stalled==='iterator')s.provider.stream=()=>({[Symbol.asyncIterator](){return {next:()=>new Promise<IteratorResult<ModelEvent>>(()=>{}),return:()=>new Promise<IteratorResult<ModelEvent>>(()=>{})};}});await assert.rejects(streamModel(s.provider,s.request,s.ledger,()=>stalled==='consumer'?new Promise<void>(()=>{}):undefined),/deadline/);assert.deepEqual(s.events,['reserve','unknown']);}
 const s=setup(),controller=new AbortController();let closed=false;const stream=s.provider.stream;s.provider.stream=async function*(req,ctx){try{yield*stream(req,ctx);}finally{closed=true;}};await assert.rejects(streamModel(s.provider,s.request,s.ledger,()=>controller.abort(),controller.signal),/cancelled/);await new Promise(resolve=>setImmediate(resolve));assert.equal(closed,true);assert.deepEqual(s.events,['reserve','unknown']);
});
test('stream capability fails before reservation and observer failures are redacted',async()=>{
 const s=setup(),capabilities=s.provider.capabilities;s.provider.capabilities=()=>({...capabilities(),stream:false});await assert.rejects(streamModel(s.provider,s.request,s.ledger,()=>{}),/unsupported-capability/);assert.deepEqual(s.events,[]);s.provider.capabilities=capabilities;await assert.rejects(streamModel(s.provider,s.request,s.ledger,()=>{throw Error('private callback details');}),error=>error instanceof ProviderFailure&&error.message==='transport');assert.deepEqual(s.events,['reserve','unknown']);
});
