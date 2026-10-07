import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {reproductionStagingFixture} from '../helpers/reproduction-staging-fixture.ts';import {Store} from '../../packages/storage/postgres.ts';import {canonical,digest} from '../../packages/review/engine.ts';
import {parseReproductionCatalog,reproductionCatalogReaders,loadAppliedReproductionRegistry} from '../../packages/runtime/reproduction-catalog.ts';import {ReproductionAuthorityStore} from '../../packages/storage/reproduction-authority.ts';
async function fixture(){const f=await reproductionStagingFixture();try{await new Store(f.pool,f.scope.organizationId,f.scope.repository).ready();for(const name of ['015_m3_reproduction_eval_source','016_m3_reproduction_authority'])await f.pool.query(await readFile(new URL(`../../deploy/migrations/${name}.sql`,import.meta.url),'utf8'));
 const definition={schemaVersion:'v1alpha1' as const,...f.scope,plans:[{digest:digest(canonical(f.f.plan)),plan:f.f.plan}]},catalog=parseReproductionCatalog(definition,f.scope,digest(canonical(definition))),cursorKey='owned-catalog-cursor-'.repeat(3),snapshots=async(_s:unknown,side:'base'|'head')=>f.f[side],readers=reproductionCatalogReaders(f.pool,f.scope,catalog,cursorKey,snapshots);
 const config={schemaVersion:'v1alpha1' as const,...f.scope,revision:1,approvals:[{planId:f.f.plan.id,planDigest:digest(canonical(f.f.plan)),findingId:f.f.initial.id,findingVersion:1,findingDigest:digest(canonical(f.f.initial)),enabled:true,expiresAt:'2100-01-01T00:00:00.000Z'}]};
 return {...f,definition,catalog,cursorKey,snapshots,readers,config};
 }catch(e){await f.close();throw e;}}
test('operator catalog bootstraps before DB reservation; restart resolves exact approved historical finding',async()=>{
 const f=await fixture();try{assert.equal((await f.pool.query('SELECT count(*) FROM agentci_reproduction_plans')).rows[0].count,'0');const authority=new ReproductionAuthorityStore(f.pool,f.scope,f.readers,async()=>true),identity=await authority.apply(f.config,null);
  const before=await loadAppliedReproductionRegistry(f.pool,f.scope,f.readers);assert.deepEqual(before.identity,identity);assert.equal(before.registry.select(f.selector,f.f.initial).plan.id,f.f.plan.id);
  await f.store.reserve(f.f.initial.id,f.selector);assert.equal((await f.history.get(f.f.initial.id,f.f.initial.subject)).at(-1)!.event.finding.version,2);
  const restarted=reproductionCatalogReaders(f.pool,f.scope,parseReproductionCatalog(structuredClone(f.definition),f.scope,digest(canonical(f.definition))),f.cursorKey,f.snapshots),loaded=await loadAppliedReproductionRegistry(f.pool,f.scope,restarted);assert.deepEqual(loaded.identity,identity);assert.equal(loaded.registry.select(f.selector,f.f.initial).plan.id,f.f.plan.id);
  assert.equal((await restarted.finding(f.config.approvals[0]!)).version,1,'approval input is historical v1, never latest queued v2');
  const count=(await f.pool.query('SELECT count(*) FROM agentci_reproduction_config_versions')).rows[0].count;await loadAppliedReproductionRegistry(f.pool,f.scope,restarted);assert.equal((await f.pool.query('SELECT count(*) FROM agentci_reproduction_config_versions')).rows[0].count,count,'startup read never applies config');
 }finally{await f.close();}
});
test('retained plan is authoritative after queue; catalog mismatch/corruption never falls back',async()=>{
 const f=await fixture();try{const authority=new ReproductionAuthorityStore(f.pool,f.scope,f.readers,async()=>true);await authority.apply(f.config,null);await f.store.reserve(f.f.initial.id,f.selector);
  const empty={...f.definition,plans:[]},emptyReader=reproductionCatalogReaders(f.pool,f.scope,parseReproductionCatalog(empty,f.scope,digest(canonical(empty))),f.cursorKey,f.snapshots);assert.equal((await loadAppliedReproductionRegistry(f.pool,f.scope,emptyReader)).registry.select(f.selector,f.f.initial).plan.id,f.f.plan.id);
  const changed=structuredClone(f.definition);changed.plans[0]!.plan.limits.maxAttempts++;changed.plans[0]!.digest=digest(canonical(changed.plans[0]!.plan));const mismatch=reproductionCatalogReaders(f.pool,f.scope,parseReproductionCatalog(changed,f.scope,digest(canonical(changed))),f.cursorKey,f.snapshots);await assert.rejects(loadAppliedReproductionRegistry(f.pool,f.scope,mismatch),/catalog-unavailable/);
  await f.pool.query('ALTER TABLE agentci_reproduction_plans DISABLE TRIGGER reproduction_plan_immutable');await f.pool.query('UPDATE agentci_reproduction_plans SET digest=$1',[digest('corrupt')]);await f.pool.query('ALTER TABLE agentci_reproduction_plans ENABLE TRIGGER reproduction_plan_immutable');await assert.rejects(loadAppliedReproductionRegistry(f.pool,f.scope,f.readers),/catalog-unavailable/);
 }finally{await f.close();}
});
test('catalog digest/scope/duplicate references and historical digest substitutions reject',async()=>{
 const f=await fixture();try{assert.throws(()=>parseReproductionCatalog(f.definition,f.scope,digest('other')),/catalog-unavailable/);const wrong={...f.definition,repository:'other/repo'};assert.throws(()=>parseReproductionCatalog(wrong,f.scope,digest(canonical(wrong))),/catalog-unavailable/);const duplicate={...f.definition,plans:[...f.definition.plans,...f.definition.plans]};assert.throws(()=>parseReproductionCatalog(duplicate,f.scope,digest(canonical(duplicate))),/catalog-unavailable/);
  await assert.rejects(f.readers.finding({...f.config.approvals[0]!,findingDigest:digest('other')}),/catalog-unavailable/);
  const actual=(await f.history.get(f.f.initial.id,f.f.initial.subject))[0]!;await assert.rejects(f.readers.finding({...f.config.approvals[0]!,findingDigest:actual.digest}),/catalog-unavailable/,'event digest is not the finding digest');
 }finally{await f.close();}
});

test('exposed catalog definition and plan reads cannot mutate retained approved bytes',async()=>{
 const f=await fixture();try{const before=f.catalog.plan(f.f.plan.id)!,expected=digest(canonical(before));f.catalog.definition.plans[0]!.plan.limits.maxAttempts++;const read=f.catalog.plan(f.f.plan.id)!;read.limits.maxAttempts++;
  assert.equal(digest(canonical(f.catalog.plan(f.f.plan.id))),expected);assert.equal(f.catalog.digest,digest(canonical(f.definition)));assert.deepEqual(f.catalog.plan(f.f.plan.id),before);
  await new ReproductionAuthorityStore(f.pool,f.scope,f.readers,async()=>true).apply(f.config,null);assert.equal((await loadAppliedReproductionRegistry(f.pool,f.scope,f.readers)).registry.select(f.selector,f.f.initial).plan.id,f.f.plan.id);
 }finally{await f.close();}
});
