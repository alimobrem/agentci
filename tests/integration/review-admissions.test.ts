import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {readFile} from 'node:fs/promises';import {Pool} from 'pg';
import {canonical,digest} from '../../packages/review/engine.ts';
import type {ReviewAdmissionRequest} from '../../packages/reviewers/admission.ts';
import {ReviewAdmissionStore,ReviewAdmissionDenied} from '../../packages/storage/review-admissions.ts';
const url=process.env.AGENTCI_TEST_DATABASE_URL;if(!url)throw Error('Review admission acceptance requires PostgreSQL; never silently skip');
test('durable review admission scopes requests, fences duplicates and atomically retains dispatch',{timeout:30000},async()=>{
 const schema=`admission_${randomUUID().replaceAll('-','')}`,admin=new Pool({connectionString:url});await admin.query(`CREATE SCHEMA ${schema}`);
 const pool=new Pool({connectionString:url,options:`-c search_path=${schema}`});
 try{
  const sql=await readFile(new URL('../../deploy/migrations/008_m3_review_admissions.sql',import.meta.url),'utf8');await pool.query(sql);await pool.query(sql);
  const scope={organizationId:randomUUID(),repository:'owner/repo'},request:ReviewAdmissionRequest={schemaVersion:'v1alpha1',id:randomUUID(),subject:{...scope,pullRequest:1,baseSha:'a'.repeat(40),headSha:'b'.repeat(40)},profile:{id:'security',revision:digest('operator-profile')},mode:'synthetic'};
  let calls=0,deny=false,unavailable=false;
  const authorizer={approve:async(r:ReviewAdmissionRequest)=>{calls++;if(deny)throw new ReviewAdmissionDenied();if(unavailable)throw Error('private credential or provider diagnostic');return {requestDigest:digest(canonical(r)),policyDigest:digest('policy'),profileRevision:r.profile.revision,mode:r.mode};}};
  const store=new ReviewAdmissionStore(pool,scope,authorizer);
  const results=await Promise.all(Array.from({length:5},()=>store.admit(request)));assert.ok(results.every(r=>r.digest===results[0]!.digest));
  assert.equal((await pool.query('SELECT count(*) FROM agentci_review_admission_outbox')).rows[0].count,'1');
  const before=calls;deny=true;assert.deepEqual(await store.admit({...request,id:request.id.toUpperCase()}),results[0]);assert.equal(calls,before,'exact retry must not silently choose a newer profile');
  await assert.rejects(store.admit({...request,mode:'live'}),/review-admission-conflict/);
  await assert.rejects(store.admit({...request,id:randomUUID()}),/review-admission-denied/);deny=false;unavailable=true;
  await assert.rejects(store.admit({...request,id:randomUUID()}),/^Error: review-admission-unavailable$/);unavailable=false;
  const otherScope={...scope,organizationId:randomUUID()},other=new ReviewAdmissionStore(pool,otherScope,authorizer);
  assert.equal(await other.get(request.id),undefined);await assert.rejects(other.admit(request),/review-admission-conflict/);
  for(const change of [{subject:{...request.subject,headSha:'c'.repeat(40)}},{profile:{...request.profile,revision:digest('new')}}])await assert.rejects(store.admit({...request,...change}),/review-admission-conflict/);
  await pool.query("CREATE FUNCTION fail_admission_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'private failure'; END; $$");
  await pool.query('CREATE TRIGGER fixture_failure BEFORE INSERT ON agentci_review_admission_outbox FOR EACH ROW EXECUTE FUNCTION fail_admission_outbox()');
  const interrupted={...request,id:randomUUID()};await assert.rejects(store.admit(interrupted),/^Error: review-admission-unavailable$/);
  assert.equal(await store.get(interrupted.id),undefined,'outbox failure must roll back the immutable admission');
  await pool.query('DROP TRIGGER fixture_failure ON agentci_review_admission_outbox');await store.admit(interrupted);
  const restarted=new Pool({connectionString:url,options:`-c search_path=${schema}`});
  try{assert.deepEqual(await new ReviewAdmissionStore(restarted,scope,authorizer).get(request.id),results[0]);}finally{await restarted.end();}
  await assert.rejects(new ReviewAdmissionStore(restarted,scope,authorizer).get(request.id),/^Error: review-admission-unavailable$/);
  let arrivals=0,release!:()=>void;const both=new Promise<void>(resolve=>{release=resolve;});
  const concurrent=new ReviewAdmissionStore(pool,scope,{approve:async r=>{if(++arrivals===2)release();await both;return authorizer.approve(r);}});
  const raceId=randomUUID(),raced=await Promise.allSettled([
   concurrent.admit({...request,id:raceId}),
   concurrent.admit({...request,id:raceId,subject:{...request.subject,headSha:'d'.repeat(40)}}),
  ]);
  assert.equal(raced.filter(r=>r.status==='fulfilled').length,1);
  const loser=raced.find(r=>r.status==='rejected');assert.ok(loser&&loser.status==='rejected');assert.match(loser.reason.message,/review-admission-conflict/);
  assert.equal((await pool.query('SELECT count(*) FROM agentci_review_admission_outbox WHERE id=$1',[raceId])).rows[0].count,'1');
  const malformedId=randomUUID(),malformed=new ReviewAdmissionStore(pool,scope,{approve:async r=>({...await authorizer.approve(r),mode:'live'})});
  await assert.rejects(malformed.admit({...request,id:malformedId}),/^Error: review-admission-unavailable$/);
  assert.equal(await store.get(malformedId),undefined);
  await assert.rejects(pool.query('UPDATE agentci_review_admissions SET id=id'),/Immutable review admission/);
  await assert.rejects(pool.query('DELETE FROM agentci_review_admissions'),/Immutable review admission/);
  assert.equal((await pool.query('SELECT count(*) FROM agentci_review_admissions')).rows[0].count,'3');
  assert.equal((await pool.query('SELECT count(*) FROM agentci_review_admission_outbox')).rows[0].count,'3');
 }finally{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
