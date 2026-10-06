import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {reproductionStagingFixture} from '../helpers/reproduction-staging-fixture.ts';
import {Store} from '../../packages/storage/postgres.ts';import {ReproductionEvalStore} from '../../packages/storage/reproduction-evals.ts';
import {ReproductionAuthorityStore,ReproductionAuthorityConflict} from '../../packages/storage/reproduction-authority.ts';
import {canonical,digest} from '../../packages/review/engine.ts';
async function fixture(permission:()=>Promise<boolean>=async()=>true){
 const f=await reproductionStagingFixture();try{
  await new Store(f.pool,f.scope.organizationId,f.scope.repository).ready();
  for(const name of ['015_m3_reproduction_eval_source','016_m3_reproduction_authority'])await f.pool.query(await readFile(new URL(`../../deploy/migrations/${name}.sql`,import.meta.url),'utf8'));
  await f.store.reserve(f.f.initial.id,f.selector);
  const config={schemaVersion:'v1alpha1' as const,...f.scope,revision:1,approvals:[{planId:f.f.plan.id,planDigest:digest(canonical(f.f.plan)),findingId:f.f.initial.id,findingVersion:1,findingDigest:digest(canonical(f.f.initial)),enabled:true,expiresAt:'2100-01-01T00:00:00.000Z'}]};
  const authority=new ReproductionAuthorityStore(f.pool,f.scope,{finding:async()=>f.f.initial,plan:async()=>f.f.plan,snapshot:async(_s,side)=>f.f[side]},permission);
  const identity=await authority.apply(config,null),staging=new ReproductionEvalStore(f.pool,f.scope,f.registry);
  const counts=async()=>{const result=[];for(const table of ['agentci_eval_jobs','agentci_eval_units'])result.push(Number((await f.pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count));return result;};
  return {...f,authority,identity,staging,counts};
 }catch(e){await f.close();throw e;}
}
test('final authority denial rolls back staged job and unit in the same transaction',async()=>{
 let checks=0;const f=await fixture(async()=>++checks!==2);try{
  const prepared=await f.staging.prepare(f.f.plan.id,f.f.base,f.f.head);let inserted=false;
  await assert.rejects(f.authority.withApproval(f.identity,prepared.id,async c=>{await f.staging.stagePrepared(c,prepared);assert.equal((await c.query('SELECT count(*) FROM agentci_eval_jobs')).rows[0].count,'1');assert.deepEqual(await f.counts(),[0,0]);inserted=true;}),ReproductionAuthorityConflict);
  assert.equal(inserted,true);assert.equal(checks,2);assert.deepEqual(await f.counts(),[0,0]);await assert.rejects(f.staging.committed(prepared));
  await f.authority.withApproval(f.identity,prepared.id,c=>f.staging.stagePrepared(c,prepared));const committed=await f.staging.committed(prepared);
  await f.authority.withApproval(f.identity,prepared.id,c=>f.staging.stagePrepared(c,prepared));assert.deepEqual(await f.staging.committed(prepared),committed);assert.deepEqual(await f.counts(),[1,1]);
  assert.equal((await f.pool.query('SELECT count(*) FROM agentci_reviews')).rows[0].count,'0');
 }finally{await f.close();}
});
test('prepared handles detach snapshots and cannot be copied, forged or used by another store',async()=>{
 const f=await fixture();try{
  const prepared=await f.staging.prepare(f.f.plan.id,f.f.base,f.f.head),other=new ReproductionEvalStore(f.pool,f.scope,f.registry);assert.ok(Object.isFrozen(prepared));
  for(const [store,ticket] of [[f.staging,structuredClone(prepared)],[other,prepared]] as const){let rejected=false;await assert.rejects(f.authority.withApproval(f.identity,prepared.id,async c=>{try{return await store.stagePrepared(c,ticket);}catch(e){assert.match((e as Error).message,/reproduction-eval-conflict/);rejected=true;throw e;}}),/reproduction-authority-unavailable/);assert.equal(rejected,true);assert.deepEqual(await f.counts(),[0,0]);}
  f.f.base.files['app.mjs']='mutated after preparation';f.f.head.files['app.mjs']='mutated after preparation';
  await f.authority.withApproval(f.identity,prepared.id,c=>f.staging.stagePrepared(c,prepared));const committed=await f.staging.committed(prepared);
  const row=(await f.pool.query('SELECT inputs FROM agentci_eval_jobs WHERE id=$1',[committed.jobId])).rows[0];assert.notEqual(row.inputs.base.snapshot.files['app.mjs'],'mutated after preparation');assert.notEqual(row.inputs.head.snapshot.files['app.mjs'],'mutated after preparation');assert.deepEqual(await f.counts(),[1,1]);
 }finally{await f.close();}
});
test('cancellation between preparation and stage refuses work; post-commit cancellation withholds identifiers',async()=>{
 const before=await fixture();try{const p=await before.staging.prepare(before.f.plan.id,before.f.base,before.f.head);await before.pool.query('INSERT INTO agentci_reproduction_cancellations(organization_id,repository,id) VALUES($1,$2,$3)',[before.scope.organizationId,before.scope.repository,p.id]);let rejected=false;await assert.rejects(before.authority.withApproval(before.identity,p.id,async c=>{try{return await before.staging.stagePrepared(c,p);}catch(e){assert.match((e as Error).message,/reproduction-eval-conflict/);rejected=true;throw e;}}),/reproduction-authority-unavailable/);assert.equal(rejected,true);assert.deepEqual(await before.counts(),[0,0]);}finally{await before.close();}
 const after=await fixture();try{const p=await after.staging.prepare(after.f.plan.id,after.f.base,after.f.head);await after.authority.withApproval(after.identity,p.id,c=>after.staging.stagePrepared(c,p));await after.pool.query('INSERT INTO agentci_reproduction_cancellations(organization_id,repository,id) VALUES($1,$2,$3)',[after.scope.organizationId,after.scope.repository,p.id]);await assert.rejects(after.staging.committed(p),/reproduction-eval-conflict/);assert.equal((await after.pool.query('SELECT cancel_requested FROM agentci_eval_jobs')).rows[0].cancel_requested,true);assert.equal((await after.pool.query('SELECT status FROM agentci_eval_units')).rows[0].status,'cancelled');}finally{await after.close();}
});
test('owned backend death after uncommitted staging leaves zero jobs and units',async()=>{
 const f=await fixture();try{const p=await f.staging.prepare(f.f.plan.id,f.f.base,f.f.head);let staged=false;
  await assert.rejects(f.authority.withApproval(f.identity,p.id,async c=>{await f.staging.stagePrepared(c,p);staged=true;const pid=(await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;assert.equal((await f.pool.query('SELECT pg_terminate_backend($1) AS stopped',[pid])).rows[0].stopped,true);await c.query('SELECT 1');}),/reproduction-authority-unavailable/);
  assert.equal(staged,true);assert.deepEqual(await f.counts(),[0,0]);await assert.rejects(f.staging.committed(p));
 }finally{await f.close();}
});
test('retained authority changed after preparation rejects before any executable insert',async()=>{
 const f=await fixture();try{const p=await f.staging.prepare(f.f.plan.id,f.f.base,f.f.head),changed=structuredClone(f.f.plan);changed.limits.maxAttempts++;
  await f.pool.query('ALTER TABLE agentci_reproduction_plans DISABLE TRIGGER reproduction_plan_immutable');await f.pool.query('UPDATE agentci_reproduction_plans SET plan=$1,digest=$2 WHERE id=$3',[changed,digest(canonical(changed)),p.id]);await f.pool.query('ALTER TABLE agentci_reproduction_plans ENABLE TRIGGER reproduction_plan_immutable');
  let rejected=false;await assert.rejects(f.authority.withApproval(f.identity,p.id,async c=>{try{return await f.staging.stagePrepared(c,p);}catch(e){assert.match((e as Error).message,/reproduction-eval-conflict/);rejected=true;throw e;}}),/reproduction-authority-unavailable/);assert.equal(rejected,true);assert.deepEqual(await f.counts(),[0,0]);
 }finally{await f.close();}
});
