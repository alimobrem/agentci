import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {readFile} from 'node:fs/promises';import {Pool} from 'pg';
import {findingsFromReviewer,deduplicateFindings} from '../../packages/findings/model.ts';
import {reproductionWorkflowId} from '../../packages/findings/workflow-identity.ts';
import {canonical,digest} from '../../packages/review/engine.ts';import {nameUuid} from '../../packages/evals/request-id.ts';import {createReproductionApprovalRegistry} from '../../packages/findings/approval-registry.ts';import {compileFindingReproduction} from '../../packages/findings/reproduction.ts';import {FindingHistoryStore} from '../../packages/storage/finding-history.ts';import {ReviewAdmissionStore} from '../../packages/storage/review-admissions.ts';import {ReproductionReservations} from '../../packages/storage/reproduction-reservations.ts';import {reproductionFixture} from '../fixtures/reproduction.ts';
const url=process.env.AGENTCI_TEST_DATABASE_URL;if(!url)throw Error('Reproduction reservation acceptance requires real PostgreSQL');
async function fixture(overrides:{organizationId?:string;repository?:string;planId?:string}={}){
 const schema=`reservation_${randomUUID().replaceAll('-','')}`,admin=new Pool({connectionString:url});await admin.query(`CREATE SCHEMA ${schema}`);const pool=new Pool({connectionString:url,options:`-c search_path=${schema}`});
 try{
  for(const name of ['001_m1','002_m2','006_m3_finding_history','007_m3_reproduction','008_m3_review_admissions','009_m3_review_dispatch','011_m3_review_summaries','012_m3_review_recovery','014_m3_reproduction_reservations'])await pool.query(await readFile(new URL(`../../deploy/migrations/${name}.sql`,import.meta.url),'utf8'));
  await pool.query(await readFile(new URL('../../deploy/migrations/014_m3_reproduction_reservations.sql',import.meta.url),'utf8'));
  const f=reproductionFixture();
  f.reviewer.subject={...f.reviewer.subject,...(overrides.organizationId?{organizationId:overrides.organizationId}:{}),...(overrides.repository?{repository:overrides.repository}:{})};
  const {buildReviewContext}=await import('../../packages/reviewers/context.ts');f.reviewer.contextDigest=buildReviewContext(f.reviewer.subject,f.documents).digest;
  f.initial=deduplicateFindings(findingsFromReviewer(f.reviewer,f.reviewer.subject,f.documents),f.reviewer.subject)[0]!;f.finding={...f.initial,state:'reproduction-pending',version:2};
  f.approval={...f.approval,id:overrides.planId??f.approval.id,findingDigest:digest(canonical(f.finding))};f.plan=compileFindingReproduction(f.finding,f.approval,f.base,f.head,f.policy,f.limits);
  const subject=f.initial.subject,scope={organizationId:subject.organizationId,repository:subject.repository};
  const admissions=new ReviewAdmissionStore(pool,scope,{approve:async r=>({requestDigest:digest(canonical(r)),policyDigest:digest('policy'),profileRevision:r.profile.revision,mode:r.mode})});
  const request={schemaVersion:'v1alpha1' as const,id:f.approval.reviewId,subject,profile:{id:'fixture',revision:digest('fixture')},mode:'synthetic' as const};await admissions.admit(request);
  const history=new FindingHistoryStore(pool,scope,{reviewer:async()=>({result:f.reviewer,documents:f.documents}),receipt:async()=>({findingId:f.finding.id,subjectDigest:digest(canonical(subject)),assertionDigest:f.plan.assertionDigest,evidenceDigest:digest('retained-error'),actor:'reproduction',outcome:'error',reason:'Fixture execution error'})});
  await history.ingest(f.initial,subject,nameUuid(request.id,`agentci:review-finding:v1:${f.initial.id}`));
  const registry=await createReproductionApprovalRegistry([{current:f.initial,plan:f.plan,base:f.base,head:f.head}]);
  const store=new ReproductionReservations(pool,scope,registry),selector={subject,expectedVersion:1,operationId:randomUUID(),approvalId:f.plan.id,approvalDigest:digest(canonical(f.plan))};
  const counts=async()=>{const result=[];for(const table of ['agentci_finding_events','agentci_reproduction_plans','agentci_reproduction_operations','agentci_reproduction_dispatch_intents'])result.push(Number((await pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count));return result;};
  return {f,pool,schema,scope,store,selector,registry,history,admissions,request,counts,close:async()=>{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}};
 }catch(e){await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();throw e;}
}
test('atomic reproduction reservation coalesces concurrent retries and replays after later finding disposition',async()=>{
 const f=await fixture();try{
  const results=await Promise.all(Array.from({length:5},()=>f.store.reserve(f.f.initial.id,f.selector)));assert.ok(results.every(r=>canonical(r)===canonical(results[0])));assert.deepEqual(await f.counts(),[2,1,1,1]);
  assert.equal(results[0]!.planDigest,digest(canonical(f.f.plan)));assert.equal(results[0]!.queuedVersion,2);
  await f.history.transition(f.f.initial.id,f.f.initial.subject,{type:'reproduce',receiptId:randomUUID()},2,randomUUID());
  assert.equal((await f.history.get(f.f.initial.id,f.f.initial.subject)).at(-1)!.event.finding.state,'unconfirmed');
  const restarted=new Pool({connectionString:url,options:`-c search_path=${f.schema}`});try{assert.deepEqual(await new ReproductionReservations(restarted,f.scope,f.registry).reserve(f.f.initial.id,f.selector),results[0]);}finally{await restarted.end();}
  await assert.rejects(f.store.reserve(f.f.initial.id,{...f.selector,approvalDigest:digest('changed')}),/idempotency-conflict/);
  await assert.rejects(f.store.reserve(f.f.initial.id,{...f.selector,approvalId:randomUUID()}),/idempotency-conflict/);
  await assert.rejects(f.store.reserve(f.f.initial.id,{...f.selector,operationId:randomUUID()}),/version-conflict/);
  assert.deepEqual(await f.counts(),[3,1,1,1]);
  for(const table of ['agentci_reproduction_operations','agentci_reproduction_dispatch_intents'])await assert.rejects(f.pool.query(`DELETE FROM ${table}`),/Immutable finding event/);
 }finally{await f.close();}
});
test('different concurrent operations have one version winner and conflicting replay never creates work',async()=>{
 const f=await fixture();try{
  const results=await Promise.allSettled([f.store.reserve(f.f.initial.id,f.selector),f.store.reserve(f.f.initial.id,{...f.selector,operationId:randomUUID()})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);assert.deepEqual(await f.counts(),[2,1,1,1]);
 }finally{await f.close();}
});
for(const table of ['agentci_finding_events','agentci_reproduction_plans','agentci_reproduction_operations','agentci_reproduction_dispatch_intents'])test(`failure inserting ${table} rolls back every mutation and retry commits once`,async()=>{
 const f=await fixture();try{
  await f.pool.query("CREATE FUNCTION reject_fixture_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'private failure'; END; $$");await f.pool.query(`CREATE TRIGGER fixture_failure BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION reject_fixture_insert()`);
  await assert.rejects(f.store.reserve(f.f.initial.id,f.selector),/^Error: reproduction-reservation-unavailable$/);assert.deepEqual(await f.counts(),[1,0,0,0]);
  await f.pool.query(`DROP TRIGGER fixture_failure ON ${table}`);await f.store.reserve(f.f.initial.id,f.selector);assert.deepEqual(await f.counts(),[2,1,1,1]);
 }finally{await f.close();}
});
test('approval cannot bypass exact admitted review association, scope, malformed selector or retained admission integrity',async()=>{
 const f=await fixture();try{
  for(const bad of [{...f.selector,command:['sh']},{...f.selector,subject:{...f.selector.subject,organizationId:randomUUID()}},{...f.selector,approvalDigest:digest('wrong')}])await assert.rejects(f.store.reserve(f.f.initial.id,bad));
  const other={...f.request,id:randomUUID()};await f.admissions.admit(other);
  const plan=compileFindingReproduction(f.f.finding,{...f.f.approval,id:randomUUID(),reviewId:other.id},f.f.base,f.f.head,f.f.policy,f.f.limits);
  const registry=await createReproductionApprovalRegistry([{current:f.f.initial,plan,base:f.f.base,head:f.f.head}]);
  await assert.rejects(new ReproductionReservations(f.pool,f.scope,registry).reserve(f.f.initial.id,{...f.selector,approvalId:plan.id,approvalDigest:digest(canonical(plan))}),/admission-conflict/);
  assert.deepEqual(await f.counts(),[1,0,0,0]);
  await f.pool.query('ALTER TABLE agentci_review_admissions DISABLE TRIGGER review_admission_immutable');await f.pool.query('UPDATE agentci_review_admissions SET digest=$1 WHERE id=$2',[digest('corrupt'),f.request.id]);await f.pool.query('ALTER TABLE agentci_review_admissions ENABLE TRIGGER review_admission_immutable');
  await assert.rejects(f.store.reserve(f.f.initial.id,f.selector),/reproduction-reservation-unavailable/);assert.deepEqual(await f.counts(),[1,0,0,0]);
 }finally{await f.close();}
});
test('backend death after plan insert rolls back queue, plan and receipt before safe retry',async()=>{
 const f=await fixture();try{
  await f.pool.query("CREATE FUNCTION terminate_owned_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_terminate_backend(pg_backend_pid()); RETURN NEW; END; $$");
  await f.pool.query('CREATE TRIGGER fixture_death AFTER INSERT ON agentci_reproduction_plans FOR EACH ROW EXECUTE FUNCTION terminate_owned_fixture()');
  await assert.rejects(f.store.reserve(f.f.initial.id,f.selector),/^Error: reproduction-reservation-unavailable$/);assert.deepEqual(await f.counts(),[1,0,0,0]);
  await f.pool.query('DROP TRIGGER fixture_death ON agentci_reproduction_plans');await f.store.reserve(f.f.initial.id,f.selector);assert.deepEqual(await f.counts(),[2,1,1,1]);
 }finally{await f.close();}
});
test('same operation racing two otherwise authorized approvals commits one full-selector identity',async()=>{
 const f=await fixture();try{
  const second=compileFindingReproduction(f.f.finding,{...f.f.approval,id:randomUUID(),reason:'Second authorized assertion'},f.f.base,f.f.head,f.f.policy,f.f.limits);
  const registry=await createReproductionApprovalRegistry([f.f.plan,second].map(plan=>({current:f.f.initial,plan,base:f.f.base,head:f.f.head})));
  const store=new ReproductionReservations(f.pool,f.scope,registry),requests=[f.selector,{...f.selector,approvalId:second.id,approvalDigest:digest(canonical(second))}];
  const results=await Promise.allSettled(requests.map(request=>store.reserve(f.f.initial.id,request)));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const loser=results.find(r=>r.status==='rejected');assert.ok(loser&&loser.status==='rejected');assert.match(loser.reason.message,/idempotency-conflict/);assert.deepEqual(await f.counts(),[2,1,1,1]);
 }finally{await f.close();}
});
for(const target of ['plan','operation','dispatch'] as const)test(`replay rejects tampered retained ${target} even when attacker recomputes available digests`,async()=>{
 const f=await fixture();try{
  await f.store.reserve(f.f.initial.id,f.selector);assert.deepEqual(await f.counts(),[2,1,1,1]);
  const tables={plan:['agentci_reproduction_plans','reproduction_plan_immutable'],operation:['agentci_reproduction_operations','reproduction_operation_immutable'],dispatch:['agentci_reproduction_dispatch_intents','reproduction_dispatch_intent_immutable']} as const;
  const [table,trigger]=tables[target];
  // Bypass immutability only within this test's owned schema to model corrupted
  // retained data. The normal production writer cannot perform these updates.
  await f.pool.query(`ALTER TABLE ${table} DISABLE TRIGGER ${trigger}`);
  if(target==='plan'){
   const altered={...f.f.plan,approval:{...f.f.plan.approval,reason:'Substituted operator approval'}};
   await f.pool.query('UPDATE agentci_reproduction_plans SET plan=$1,digest=$2',[altered,digest(canonical(altered))]);
  }else if(target==='operation'){
   const row=(await f.pool.query('SELECT result FROM agentci_reproduction_operations')).rows[0];
   const altered={...row.result,reviewId:randomUUID()};
   await f.pool.query('UPDATE agentci_reproduction_operations SET result=$1,result_digest=$2',[altered,digest(canonical(altered))]);
  }else await f.pool.query('UPDATE agentci_reproduction_dispatch_intents SET workflow_id=$1',[`agentci:reproduction:${randomUUID()}`]);
  await f.pool.query(`ALTER TABLE ${table} ENABLE TRIGGER ${trigger}`);
  await assert.rejects(f.store.reserve(f.f.initial.id,f.selector),/reproduction-reservation-conflict/);
  assert.deepEqual(await f.counts(),[2,1,1,1],'integrity failure must not create another queue, plan or dispatch');
 }finally{await f.close();}
});
test('migration accepts identical reinstall and rejects changed source or applied checksum without altering retained work',async()=>{
 const f=await fixture();try{
  const source=await readFile(new URL('../../deploy/migrations/014_m3_reproduction_reservations.sql',import.meta.url),'utf8');
  await f.store.reserve(f.f.initial.id,f.selector);const before=await f.counts();
  await f.pool.query(source);assert.deepEqual(await f.counts(),before);
  const c=await f.pool.connect();try{
   const altered=source.replace('workflow_id text NOT NULL','workflow_id text NULL');assert.notEqual(altered,source);
   await assert.rejects(c.query(altered),/Migration source checksum mismatch/);await c.query('ROLLBACK');
   const original=(await c.query("SELECT checksum FROM agentci_schema_migrations WHERE version='014_m3_reproduction_reservations'")).rows[0].checksum;
   await c.query("UPDATE agentci_schema_migrations SET checksum=$1 WHERE version='014_m3_reproduction_reservations'",['0'.repeat(64)]);
   await assert.rejects(c.query(source),/Applied migration checksum mismatch/);await c.query('ROLLBACK');
   await c.query("UPDATE agentci_schema_migrations SET checksum=$1 WHERE version='014_m3_reproduction_reservations'",[original]);
   await c.query(source);
  }finally{c.release();}
  assert.deepEqual(await f.counts(),before);await f.store.reserve(f.f.initial.id,f.selector);assert.deepEqual(await f.counts(),before);
 }finally{await f.close();}
});

test('persisted workflow identity is stable on replay and separates the same plan ID across tenants and repositories',async()=>{
 const planId=randomUUID(),org=randomUUID(),fixtures=[];
 try{
  fixtures.push(await fixture({planId,organizationId:org,repository:'owner/repo'}));
  fixtures.push(await fixture({planId,organizationId:randomUUID(),repository:'owner/repo'}));
  fixtures.push(await fixture({planId,organizationId:org,repository:'owner/another'}));
  const identities=[];
  for(const f of fixtures){
   const first=await f.store.reserve(f.f.initial.id,f.selector);assert.equal(first.reproductionId,planId);
   assert.deepEqual(await f.store.reserve(f.f.initial.id,f.selector),first);
   const rows=(await f.pool.query('SELECT workflow_id FROM agentci_reproduction_dispatch_intents')).rows;assert.equal(rows.length,1);
   assert.equal(rows[0].workflow_id,reproductionWorkflowId(f.scope,planId));identities.push(rows[0].workflow_id);
  }
  assert.equal(new Set(identities).size,3);
 }finally{for(const f of fixtures)await f.close();}
});
