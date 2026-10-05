import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {readFile} from 'node:fs/promises';import {Pool} from 'pg';
import {ReviewerProfileStore} from '../../packages/storage/reviewer-profiles.ts';
const url=process.env.AGENTCI_TEST_DATABASE_URL;if(!url)throw Error('Reviewer profile acceptance requires PostgreSQL; never silently skip');
test('profile registry preserves exact revisions through updates, revocation and restart',{timeout:30000},async()=>{
 const schema=`profiles_${randomUUID().replaceAll('-','')}`,admin=new Pool({connectionString:url});await admin.query(`CREATE SCHEMA ${schema}`);const pool=new Pool({connectionString:url,options:`-c search_path=${schema}`});
 try{
  const sql=await readFile(new URL('../../deploy/migrations/010_m3_reviewer_profiles.sql',import.meta.url),'utf8');await pool.query(sql);await pool.query(sql);
  const scope={organizationId:randomUUID(),repository:'owner/repo'},store=new ReviewerProfileStore(pool,scope),profile=JSON.parse(await readFile(new URL('../../specs/api/fixtures/reviewer-profile.json',import.meta.url),'utf8'));
  const puts=await Promise.all(Array.from({length:5},()=>store.put(profile)));assert.ok(puts.every(p=>p.revision===puts[0]!.revision));const first=puts[0]!;
  assert.equal((await pool.query('SELECT count(*) FROM agentci_reviewer_profiles')).rows[0].count,'1');
  const second=await store.put({...profile,timeoutMs:10000});assert.notEqual(first.revision,second.revision);assert.deepEqual(await store.resolve(profile.id,first.revision),first);
  const other=new ReviewerProfileStore(pool,{...scope,organizationId:randomUUID()});assert.equal(await other.get(profile.id,first.revision),undefined);await assert.rejects(other.resolve(profile.id,first.revision),/reviewer-profile-conflict/);await assert.rejects(other.revoke(profile.id,first.revision),/reviewer-profile-conflict/);
  const revoked=await store.revoke(profile.id,first.revision);assert.equal(revoked.revoked,true);assert.deepEqual(await store.revoke(profile.id,first.revision),revoked);assert.deepEqual(await store.put(profile),revoked,'config reload cannot resurrect a revoked revision');await assert.rejects(store.resolve(profile.id,first.revision),/reviewer-profile-revoked/);assert.deepEqual(await store.resolve(profile.id,second.revision),second);
  await assert.rejects(pool.query("UPDATE agentci_reviewer_profiles SET profile=jsonb_set(profile,'{timeoutMs}','1000')"),/Immutable reviewer profile/);await assert.rejects(pool.query('UPDATE agentci_reviewer_profiles SET revoked_at=NULL WHERE revision=$1',[first.revision]),/Immutable reviewer profile/);await assert.rejects(pool.query('DELETE FROM agentci_reviewer_profiles'),/Immutable reviewer profile/);
  const restartPool=new Pool({connectionString:url,options:`-c search_path=${schema}`});try{const restart=new ReviewerProfileStore(restartPool,scope);assert.deepEqual(await restart.get(profile.id,first.revision),revoked);assert.deepEqual(await restart.resolve(profile.id,second.revision),second);await assert.rejects(restart.resolve(profile.id,first.revision),/reviewer-profile-revoked/);}finally{await restartPool.end();}
  await assert.rejects(new ReviewerProfileStore(restartPool,scope).get(profile.id,first.revision),/^Error: reviewer-profile-unavailable$/);
 }finally{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
