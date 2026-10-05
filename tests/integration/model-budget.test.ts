import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {readFile} from 'node:fs/promises';import {Pool} from 'pg';
import {PostgresBudgetLedger,type BudgetScope} from '../../packages/providers/budget.ts';
const url=process.env.AGENTCI_TEST_DATABASE_URL;if(!url)throw Error('Model budget integration requires AGENTCI_TEST_DATABASE_URL; never silently skip');
test('PostgreSQL model budget: concurrent reservations, crash recovery, exact replay and scope isolation',async()=>{
 const pool=new Pool({connectionString:url});const scope:BudgetScope={id:randomUUID(),organizationId:randomUUID(),repository:'fixture/budget',limitUsdMicros:100};
 const input=()=>({requestId:randomUUID(),requestDigest:'a'.repeat(64),attempt:1,upperBoundUsdMicros:30,pricingRevision:'fixture-v1'});
 try{
  const migration=await readFile(new URL('../../deploy/migrations/004_m3_model_budget.sql',import.meta.url),'utf8');await pool.query(migration);await pool.query(migration);
  const ledger=new PostgresBudgetLedger(pool,scope);
  const results=await Promise.allSettled(Array.from({length:10},()=>ledger.reserve(input())));
  const ids=results.filter(result=>result.status==='fulfilled').map(result=>result.value);assert.equal(ids.length,3);assert.equal(results.filter(result=>result.status==='rejected'&&result.reason.code==='budget-exhausted').length,7);
  await ledger.unknown(ids[0]!);await assert.rejects(ledger.releaseNotSent(ids[0]!),/ambiguous-attempt/);
  // Reconstructing the store simulates process recovery; unknown charges remain held.
  const recovered=new PostgresBudgetLedger(pool,scope);await assert.rejects(recovered.reserve(input()),/budget-exhausted/);
  await recovered.settle(ids[0]!,5);await recovered.settle(ids[0]!,5);await assert.rejects(recovered.settle(ids[0]!,4),/ambiguous-attempt/);
  const req=input(),id=await recovered.reserve(req);await assert.rejects(recovered.reserve(req),/ambiguous-attempt/);
  await assert.rejects(recovered.reserve({...req,requestDigest:'b'.repeat(64)}),/invalid-request/);
  await assert.rejects(recovered.reserve({...req,attempt:2}),/invalid-request/);
  await recovered.releaseNotSent(id);await recovered.releaseNotSent(id);const retry=await recovered.reserve({...req,attempt:2});
  await assert.rejects(new PostgresBudgetLedger(pool,{...scope,repository:'other/repo'}).settle(retry,0),/invalid-request/);
  await assert.rejects(new PostgresBudgetLedger(pool,{...scope,limitUsdMicros:1000}).reserve(input()),/invalid-request/);
  await recovered.settle(retry,150);await assert.rejects(recovered.reserve({...input(),upperBoundUsdMicros:1}),/budget-exhausted/);
  const row=(await pool.query('SELECT actual_usd_micros FROM agentci_model_attempts WHERE id=$1',[retry])).rows[0];assert.equal(row.actual_usd_micros,'150');
  await assert.rejects(pool.query("UPDATE agentci_model_attempts SET state='released',actual_usd_micros=NULL WHERE id=$1",[retry]),/Immutable/);
 }finally{await pool.query('DELETE FROM agentci_model_attempts WHERE budget_id=$1',[scope.id]);await pool.query('DELETE FROM agentci_model_budgets WHERE id=$1',[scope.id]);await pool.end();}
});

test('PostgreSQL provider execution: retries retain charges, replay cannot redispatch, streaming settles after completion',async()=>{
 const {invokeModel,streamModel}=await import('../../packages/providers/execute.ts');
 const {ProviderFailure}=await import('../../packages/providers/types.ts');
 const pool=new Pool({connectionString:url});const scope:BudgetScope={id:randomUUID(),organizationId:randomUUID(),repository:'fixture/execution',limitUsdMicros:100};
 const request=JSON.parse(await readFile(new URL('../../specs/api/fixtures/model-request.json',import.meta.url),'utf8'));request.requestId=randomUUID();request.policy={deadlineAt:Date.now()+10000,maxAttempts:2,baseDelayMs:1,maxDelayMs:2};
 let calls=0;
 const provider:import('../../packages/providers/types.ts').ModelProvider={id:'fixture',upstreamIdentity:'fixture',capabilities:()=>({stream:true,tools:true,structuredOutput:true,developerInstructions:true,extensions:true}),estimateCost:()=>({upperBoundUsdMicros:40,pricingRevision:'fixture-v1',maxInputTokens:10000,maxOutputTokens:256}),async invoke(req,ctx){calls++;if(calls===1)throw new ProviderFailure('transport',true,'possibly-sent');return {schemaVersion:'v1alpha1',requestId:req.requestId,attemptId:ctx.attemptId,provider:req.provider,model:req.model,status:'completed',text:'ok',structuredOutput:{claim:'fixture'},toolCalls:[],usage:{inputTokens:1,outputTokens:1,costUsdMicros:5,costKind:'reported',pricingRevision:null},providerRequestId:null};},async *stream(req,ctx){yield {type:'start',requestId:req.requestId,attemptId:ctx.attemptId,provider:req.provider,model:req.model};yield {type:'text-delta',text:'ok'};yield {type:'terminal',response:await this.invoke(req,ctx)};}};
 try{
  await pool.query(await readFile(new URL('../../deploy/migrations/004_m3_model_budget.sql',import.meta.url),'utf8'));
  const ledger=new PostgresBudgetLedger(pool,scope);await invokeModel(provider,request,ledger);assert.equal(calls,2);
  const attempts=(await pool.query('SELECT state,actual_usd_micros,reserved_usd_micros FROM agentci_model_attempts WHERE budget_id=$1 ORDER BY attempt',[scope.id])).rows;
  assert.deepEqual(attempts,[{state:'unknown',actual_usd_micros:null,reserved_usd_micros:'40'},{state:'settled',actual_usd_micros:'5',reserved_usd_micros:'40'}]);
  await assert.rejects(invokeModel(provider,request,new PostgresBudgetLedger(pool,scope)),/ambiguous-attempt/);assert.equal(calls,2);
  const streamed=await streamModel(provider,{...request,requestId:randomUUID()},ledger,()=>{});assert.equal(streamed.text,'ok');assert.equal(calls,3);
  const controller=new AbortController();const cancelled={...request,requestId:randomUUID()};await assert.rejects(streamModel(provider,cancelled,ledger,()=>controller.abort(),controller.signal),/cancelled/);assert.equal(calls,3);
  const cancelledRow=(await pool.query('SELECT state FROM agentci_model_attempts WHERE budget_id=$1 AND request_id=$2',[scope.id,cancelled.requestId])).rows[0];assert.equal(cancelledRow.state,'unknown');
  await assert.rejects(invokeModel(provider,{...request,requestId:randomUUID()},ledger),/budget-exhausted/);assert.equal(calls,3);
 }finally{await pool.query('DELETE FROM agentci_model_attempts WHERE budget_id=$1',[scope.id]);await pool.query('DELETE FROM agentci_model_budgets WHERE id=$1',[scope.id]);await pool.end();}
});
