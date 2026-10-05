import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {readFile} from 'node:fs/promises';import {Pool} from 'pg';
import {canonical,digest} from '../../packages/review/engine.ts';
import {ReviewAdmissionStore} from '../../packages/storage/review-admissions.ts';
import {ReviewDispatchStore} from '../../packages/storage/review-dispatch.ts';
const url=process.env.AGENTCI_TEST_DATABASE_URL;if(!url)throw Error('Review dispatch acceptance requires PostgreSQL; never silently skip');
test('review dispatch survives races, lease takeover, cancellation and restart without replacing terminal evidence',{timeout:30000},async()=>{
 const schema=`dispatch_${randomUUID().replaceAll('-','')}`,admin=new Pool({connectionString:url});await admin.query(`CREATE SCHEMA ${schema}`);const pool=new Pool({connectionString:url,options:`-c search_path=${schema}`});
 try{
  for(const name of ['008_m3_review_admissions','009_m3_review_dispatch']){const sql=await readFile(new URL(`../../deploy/migrations/${name}.sql`,import.meta.url),'utf8');await pool.query(sql);await pool.query(sql);}
  const scope={organizationId:randomUUID(),repository:'owner/repo'},admissions=new ReviewAdmissionStore(pool,scope,{approve:async r=>({requestDigest:digest(canonical(r)),policyDigest:digest('policy'),profileRevision:r.profile.revision,mode:r.mode})}),store=new ReviewDispatchStore(pool,scope);
  const admit=async()=>{const id=randomUUID();await admissions.admit({schemaVersion:'v1alpha1',id,subject:{...scope,pullRequest:1,baseSha:'a'.repeat(40),headSha:'b'.repeat(40)},profile:{id:'security',revision:digest('profile')},mode:'synthetic'});return id;};
  const id=await admit(),before=await store.get(id);assert.ok(before);assert.equal(before.dispatched,false);assert.ok(Number.isSafeInteger(before.admittedAtMs));
  const claimed=(await Promise.all([store.claim(),store.claim(),store.claim()])).filter(x=>x!==undefined);assert.equal(claimed.length,1);const first=claimed[0]!;
  const runId=randomUUID(),finished=await store.finish(id,runId,'completed',digest('result'));
  assert.equal(finished.dispatched,false);assert.equal(finished.terminal?.status,'completed');
  const ack=await store.acknowledge(first,runId);assert.equal(ack.dispatched,true);assert.deepEqual(ack.terminal,finished.terminal);assert.deepEqual(await store.acknowledge(first,runId),ack);
  assert.deepEqual((await store.requestCancellation(id)).terminal,finished.terminal,'late cancellation must not replace completion');
  await assert.rejects(store.finish(id,runId,'failed',digest('result')),/review-dispatch-conflict/);
  await assert.rejects(store.finish(id,randomUUID(),'completed',digest('result')),/review-dispatch-conflict/);
  assert.deepEqual((await store.finish(id,runId,'completed',digest('result'))).terminal,finished.terminal);
  const queued=await admit();await store.requestCancellation(queued);const stale=await store.claim();assert.ok(stale);assert.equal(stale.cancelRequested,true);
  // Expire the owned lease to simulate a crashed dispatcher, without timing sleeps.
  await pool.query("UPDATE agentci_review_admission_outbox SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[queued]);
  const current=await store.claim();assert.ok(current);assert.notEqual(current.token,stale.token);assert.equal(current.workflowId,stale.workflowId);assert.equal(current.admittedAtMs,stale.admittedAtMs);
  const cancelledRun=randomUUID();await assert.rejects(store.acknowledge(stale,cancelledRun),/review-dispatch-lease-lost/);
  await store.acknowledge(current,cancelledRun);await store.finish(queued,cancelledRun,'cancelled',digest('cancelled'));
  await assert.rejects(pool.query('UPDATE agentci_review_admission_outbox SET terminal_status=NULL WHERE id=$1',[id]),/Immutable review dispatch identity/);
  await assert.rejects(pool.query('UPDATE agentci_review_admission_outbox SET cancel_requested_at=NULL WHERE id=$1',[queued]),/Immutable review dispatch identity/);
  await assert.rejects(pool.query('DELETE FROM agentci_review_admission_outbox WHERE id=$1',[id]),/Immutable review dispatch identity/);
  const other=new ReviewDispatchStore(pool,{...scope,organizationId:randomUUID()});assert.equal(await other.get(id),undefined);assert.equal(await other.claim(),undefined);await assert.rejects(other.requestCancellation(id),/review-dispatch-conflict/);await assert.rejects(other.finish(id,runId,'completed',digest('result')),/review-dispatch-conflict/);
  const restartedPool=new Pool({connectionString:url,options:`-c search_path=${schema}`});try{const restarted=new ReviewDispatchStore(restartedPool,scope);assert.deepEqual(await restarted.get(id),await store.get(id));assert.equal((await restarted.get(queued))?.cancelRequested,true);assert.equal(await restarted.claim(),undefined);}finally{await restartedPool.end();}
  await assert.rejects(new ReviewDispatchStore(restartedPool,scope).get(id),/^Error: review-dispatch-unavailable$/);
  const terminated=await admit(),terminating=await store.claim();assert.ok(terminating);const terminationRun=randomUUID();await store.acknowledge(terminating,terminationRun);await store.finish(terminated,terminationRun,'terminated',digest('terminated'));assert.equal((await store.get(terminated))?.terminal?.status,'terminated');
 }finally{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
