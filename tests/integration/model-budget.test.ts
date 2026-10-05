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
