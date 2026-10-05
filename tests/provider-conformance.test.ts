import test from 'node:test';import assert from 'node:assert/strict';
import {runProviderSmoke} from '../packages/providers/conformance.ts';
import type {BudgetLedger} from '../packages/providers/budget.ts';
import type {ModelProvider,ModelRequest,ProviderContext,ModelResponse} from '../packages/providers/types.ts';
function setup(){
 const records:string[]=[];const ids=new Set<string>();
 const ledger:BudgetLedger={async reserve(r){assert.equal(r.attempt,1);assert.equal(ids.has(r.requestId),false);ids.add(r.requestId);records.push('reserve');return r.requestId;},async settle(){throw Error();},async unknown(){records.push('unknown');},async releaseNotSent(){records.push('release');}};
 const response=(req:ModelRequest,ctx:ProviderContext):ModelResponse=>({schemaVersion:'v1alpha1',requestId:req.requestId,attemptId:ctx.attemptId,provider:req.provider,model:req.model,observedModel:'fixture-snapshot',status:'completed',text:'{"ok":true}',structuredOutput:req.tools.length?null:{ok:true},toolCalls:req.tools.length?[{id:'fixture-call',name:'check_fixture',arguments:{marker:'agentci-smoke'}}]:[],usage:{inputTokens:1,outputTokens:1,costUsdMicros:null,costKind:'unknown',pricingRevision:null},providerRequestId:'private-provider-id'});
 const provider:ModelProvider={id:'fixture',upstreamIdentity:'fixture',capabilities:()=>({stream:true,tools:true,structuredOutput:true,developerInstructions:true,extensions:true}),estimateCost:()=>({upperBoundUsdMicros:100,pricingRevision:'fixture',maxInputTokens:100,maxOutputTokens:1024}),async invoke(req,ctx){records.push('invoke');return response(req,ctx);},async *stream(req,ctx){records.push('stream');yield {type:'start',requestId:req.requestId,attemptId:ctx.attemptId,provider:req.provider,model:req.model};yield {type:'text-delta',text:'{"ok":true}'};yield {type:'terminal',response:response(req,ctx)};}};
 return {provider,ledger,records};
}
test('conformance runs ordinary and streaming execution through budget accounting with sanitized results',async()=>{
 const s=setup(),result=await runProviderSmoke(s.provider,'fixture-model',s.ledger);
 assert.deepEqual(s.records,['reserve','invoke','unknown','reserve','stream','unknown','reserve','invoke','unknown']);assert.equal(result.length,3);assert.notEqual(result[0]!.requestId,result[1]!.requestId);
 assert.equal(result[1]!.observedModel,'fixture-snapshot');assert.equal(JSON.stringify(result).includes('private-provider-id'),false);assert.equal('text' in result[0]!,false);
});
test('failed or cancelled conformance does not proceed to another request',async()=>{
 const s=setup();s.provider.invoke=async()=>{throw Error('private failure');};await assert.rejects(runProviderSmoke(s.provider,'fixture-model',s.ledger),/transport/);assert.deepEqual(s.records,['reserve','unknown']);
 const c=setup(),controller=new AbortController();controller.abort();await assert.rejects(runProviderSmoke(c.provider,'fixture-model',c.ledger,controller.signal),/cancelled/);assert.deepEqual(c.records,[]);
});

test('conformance rejects missing usage and missing tool proposals even after accounting',async()=>{
 for(const mode of ['usage','tool']){
  const s=setup(),invoke=s.provider.invoke;
  s.provider.invoke=async(req,ctx)=>{const result=await invoke(req,ctx);if(mode==='usage')result.usage.inputTokens=null;else if(req.tools.length)result.toolCalls=[];return result;};
  await assert.rejects(runProviderSmoke(s.provider,'fixture-model',s.ledger),/invalid-output/);
  assert.equal(s.records.filter(x=>x==='reserve').length,mode==='usage'?1:3);
  assert.equal(s.records.at(-1),'unknown');
 }
});
