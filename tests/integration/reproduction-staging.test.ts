import {FindingHistoryStore} from '../../packages/storage/finding-history.ts';import {executeStoredUnit} from '../../apps/eval-worker/unit.ts';import {Pool} from 'pg';import {executeSuite} from '../../packages/evals/execution.ts';import {analyze} from '../../packages/review/engine.ts';import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {randomUUID} from 'node:crypto';import {once} from 'node:events';
import {reproductionStagingFixture} from '../helpers/reproduction-staging-fixture.ts';import {Store} from '../../packages/storage/postgres.ts';import {ReproductionEvalInputLimit,ReproductionEvalStore} from '../../packages/storage/reproduction-evals.ts';import {EvalStore} from '../../packages/storage/evals.ts';import {FindingReproductionStore} from '../../packages/storage/finding-reproduction.ts';import {canonical,digest} from '../../packages/review/engine.ts';import {createControlApi} from '../../apps/control/server.ts';
async function fixture(extraFiles?:Record<string,string>,image?:string){const f=await reproductionStagingFixture({...(extraFiles?{extraFiles}:{}),...(image?{image}:{})});try{await new Store(f.pool,f.scope.organizationId,f.scope.repository).ready();await f.pool.query(await readFile(new URL('../../deploy/migrations/015_m3_reproduction_eval_source.sql',import.meta.url),'utf8'));await f.store.reserve(f.f.initial.id,f.selector);const staging=new ReproductionEvalStore(f.pool,f.scope,f.registry),evals=new EvalStore(f.pool,f.scope.organizationId,f.scope.repository);return {...f,staging,evals};}catch(e){await f.close();throw e;}}
test('admission-only reproduction stages once without legacy evidence and retains typed recovery',async()=>{
 const f=await fixture();try{
  assert.equal((await f.pool.query('SELECT count(*) FROM agentci_reviews')).rows[0].count,'0');
  const results=await Promise.all(Array.from({length:3},()=>f.staging.stage(f.f.plan.id,f.f.base,f.f.head)));assert.ok(results.every(x=>canonical(x)===canonical(results[0])));
  const staged=results[0]!,unit=await f.evals.unit(staged.unitId);assert.ok(unit);assert.equal(unit.jobId,staged.jobId);
  const job=(await f.pool.query('SELECT * FROM agentci_eval_jobs')).rows[0];assert.equal(job.review_id,null);assert.equal(job.source.admissionId,f.request.id);assert.equal(job.source.planId,f.f.plan.id);
  assert.equal(await f.evals.recoveryPlan(f.f.plan.id),undefined,'legacy recovery does not mislabel admission IDs');
  assert.equal((await f.staging.recoveryPlan(f.f.plan.id))!.source.admissionId,f.request.id);
  await assert.rejects(f.evals.comparison(staged.jobId),/unsupported-eval-source/);await assert.rejects(f.evals.exportComparison(staged.jobId).next(),/unsupported-eval-source/);
  await assert.rejects(f.staging.stage(f.f.plan.id,f.f.base,{...f.f.head,files:{...f.f.head.files,'app.mjs':'substituted'}}));
  assert.equal((await f.pool.query('SELECT count(*) FROM agentci_eval_jobs')).rows[0].count,'1');
 }finally{await f.close();}
});
async function insertJob(f:Awaited<ReturnType<typeof fixture>>,job:any){
 const cols=['id','review_id','attempt_key','repository','pull_request','base_sha','head_sha','digest','inputs','plan','source','source_base_canonical','source_head_canonical','source_definition_canonical','source_payload_canonical'];
 return f.pool.query(`INSERT INTO agentci_eval_jobs(${cols.join(',')}) VALUES(${cols.map((_,i)=>'$'+(i+1)).join(',')})`,cols.map(k=>job[k]));
}
function rehash(job:any){job.source_base_canonical=canonical(job.inputs.base.snapshot.files);job.source_head_canonical=canonical(job.inputs.head.snapshot.files);job.source_definition_canonical=canonical(job.plan.units[0]);job.source_payload_canonical=canonical({source:job.source,attemptKey:job.attempt_key,repository:job.repository,pullRequest:job.pull_request,inputs:job.inputs,plan:job.plan});job.digest=digest(job.source_payload_canonical);}
test('database rejects null/source/authority substitutions and self-rehashed input or unit bypass',async()=>{
 const f=await fixture();try{
  const staged=await f.staging.stage(f.f.plan.id,f.f.base,f.f.head),original=(await f.pool.query('SELECT * FROM agentci_eval_jobs')).rows[0];
  for(const mutate of [(j:any)=>{j.source=null;},(j:any)=>{j.source.organizationId=null;},(j:any)=>{delete j.source.operationId;},(j:any)=>{j.source.organizationId=randomUUID();},(j:any)=>{j.source.admissionId=randomUUID();},(j:any)=>{j.source.extra=true;},(j:any)=>{j.source.planDigest=digest('wrong');},(j:any)=>{j.inputs.head.snapshot.files['app.mjs']='forged';rehash(j);},(j:any)=>{j.inputs.head.snapshot.files['app.mjs']='forged';j.source.inputDigests.head=digest(canonical(j.inputs.head.snapshot.files));rehash(j);},(j:any)=>{j.plan.units[0].suite.spec.runner.command=['node','evil.mjs'];j.source.definitionDigest=digest(canonical(j.plan.units[0]));rehash(j);}]){
   const job=structuredClone(original);job.id=randomUUID();mutate(job);await assert.rejects(insertJob(f,job),e=>/source|authority/i.test(String(e))&&!/duplicate key/.test(String(e)));
  }
  const wrong=structuredClone(f.f.plan.definition);wrong.suite.spec.runner.command=['node','other.mjs'];
  await assert.rejects(f.pool.query('INSERT INTO agentci_eval_units(id,job_id,suite_id,model_key,side,definition,digest) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),staged.jobId,wrong.suite.metadata.id,'',wrong.side,wrong,digest(canonical(wrong))]),/Reproduction unit authority mismatch/);
  await f.pool.query('UPDATE agentci_scope SET organization_id=$1',[randomUUID()]);
  try{await assert.rejects(insertJob(f,{...original,id:randomUUID()}),/Reproduction eval authority unavailable/);}finally{await f.pool.query('UPDATE agentci_scope SET organization_id=$1',[f.scope.organizationId]);}
  assert.equal((await f.pool.query('SELECT count(*) FROM agentci_eval_jobs')).rows[0].count,'1');
 }finally{await f.close();}
});
test('worker rejects corrupted executable bytes despite recomputed job hash, and typed recovery rejects source substitution',async()=>{
 const f=await fixture();try{
  const staged=await f.staging.stage(f.f.plan.id,f.f.base,f.f.head),original=(await f.pool.query('SELECT * FROM agentci_eval_jobs')).rows[0];
  const altered=structuredClone(original);altered.inputs.head.snapshot.files['app.mjs']='forged';rehash(altered);
  await f.pool.query('ALTER TABLE agentci_eval_jobs DISABLE TRIGGER agentci_eval_job_immutable');
  await f.pool.query('UPDATE agentci_eval_jobs SET inputs=$1,digest=$2',[altered.inputs,altered.digest]);
  await f.pool.query('ALTER TABLE agentci_eval_jobs ENABLE TRIGGER agentci_eval_job_immutable');
  await assert.rejects(f.evals.unit(staged.unitId),/Eval source authority mismatch/);await assert.rejects(f.staging.recoveryPlan(f.f.plan.id));
 }finally{await f.close();}
});
test('reproduction cancellation before and during typed staging leaves no executable uncancelled unit',async()=>{
 const before=await fixture();try{
  const store=new FindingReproductionStore(before.pool,before.scope,before.history,before.evals,{approvedPlan:async()=>before.f.plan},before.staging);
  assert.deepEqual(await store.cancel(before.f.plan.id),{jobId:null,unitIds:[]});await assert.rejects(store.stage(before.f.plan.id,before.f.base,before.f.head));assert.equal(await before.staging.recoveryPlan(before.f.plan.id),undefined);await assert.rejects(store.readReceipt(before.f.plan.id,before.f.initial.subject));
 }finally{await before.close();}
 const f=await fixture();try{
  const store=new FindingReproductionStore(f.pool,f.scope,f.history,f.evals,{approvedPlan:async()=>f.f.plan},f.staging);
  // Hold the SQL insert after the initial cancellation fence. A durable cancel
  // commits while the new eval job is invisible; the postcommit fence must catch it.
  const gate=await f.pool.connect();await gate.query('SELECT pg_advisory_lock(815015)');
  await f.pool.query('CREATE FUNCTION hold_staging() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(815015); RETURN NEW; END; $$');
  await f.pool.query('CREATE TRIGGER fixture_hold BEFORE INSERT ON agentci_eval_jobs FOR EACH ROW EXECUTE FUNCTION hold_staging()');
  const pending=store.stage(f.f.plan.id,f.f.base,f.f.head);const rejected=assert.rejects(pending);
  try{
   let waiting=false;for(let i=0;i<100;i++){const r=await f.pool.query("SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=815015 AND NOT granted");if(r.rowCount){waiting=true;break;}await new Promise(r=>setTimeout(r,10));}assert.ok(waiting);
   assert.deepEqual(await store.cancel(f.f.plan.id),{jobId:null,unitIds:[]});
  }finally{await gate.query('SELECT pg_advisory_unlock(815015)');gate.release();await rejected;}
  const recovery=await f.staging.recoveryPlan(f.f.plan.id);assert.ok(recovery);assert.equal((await f.evals.unit(recovery.unitIds[0]!))!.status,'cancelled');
 }finally{await f.close();}
});
test('M2 comparison and export authenticate before explicit new-source rejection without streaming',async()=>{
 const f=await fixture();let server:ReturnType<typeof createControlApi>|undefined;try{
  const staged=await f.staging.stage(f.f.plan.id,f.f.base,f.f.head),config={...f.scope,installationId:1,secret:'s'.repeat(32),evidenceToken:'r'.repeat(32)};
  server=createControlApi(config,{ready:async()=>{},recordDelivery:async()=>{throw Error();},evidence:async()=>undefined},f.evals);server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  for(const suffix of ['','/export']){const url=`${origin}/v1/eval-comparisons/${staged.jobId}${suffix}`;assert.equal((await fetch(url)).status,401);const response=await fetch(url,{headers:{authorization:`Bearer ${config.evidenceToken}`}});assert.equal(response.status,409);assert.match(response.headers.get('content-type')??'',/application\/json/);assert.deepEqual(await response.json(),{error:{code:'unsupported-eval-source'}});}
 }finally{if(server){server.closeAllConnections();await new Promise<void>(r=>server!.close(()=>r()));}await f.close();}
});
test('unchanged evaluator table grants support typed unit recovery, checkpoints and completion without authority access',async()=>{
 const f=await fixture(),role=`eval_staging_${randomUUID().replaceAll('-','')}`,password=randomUUID()+randomUUID();let restricted:Pool|undefined,created=false;
 try{
  await f.pool.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);created=true;
  await f.pool.query(`GRANT USAGE ON SCHEMA ${f.schema} TO ${role}`);
  await f.pool.query(`GRANT SELECT ON agentci_scope,agentci_eval_jobs,agentci_eval_units,agentci_eval_trials TO ${role}`);
  await f.pool.query(`GRANT UPDATE(status,lease_token,lease_until,result,result_digest,completed_at) ON agentci_eval_units TO ${role}`);
  await f.pool.query(`GRANT INSERT ON agentci_eval_trials TO ${role}`);
  const url=new URL(process.env.AGENTCI_TEST_DATABASE_URL!);url.username=role;url.password=password;
  restricted=new Pool({connectionString:url.toString(),options:`-c search_path=${f.schema}`});assert.equal((await restricted.query('SELECT current_user')).rows[0].current_user,role);
  for(const table of ['agentci_reviews','agentci_review_admissions','agentci_reproduction_operations','agentci_reproduction_plans'])await assert.rejects(restricted.query(`SELECT * FROM ${table}`),(e:any)=>e.code==='42501');
  const staged=await f.staging.stage(f.f.plan.id,f.f.base,f.f.head),worker=new EvalStore(restricted,f.scope.organizationId,f.scope.repository),unit=(await worker.unit(staged.unitId))!;await worker.ready();
  await assert.rejects(restricted.query('UPDATE agentci_eval_units SET definition=$1 WHERE id=$2',[{},unit.id]),(e:any)=>e.code==='42501');await assert.rejects(restricted.query('UPDATE agentci_eval_jobs SET inputs=$1 WHERE id=$2',[{},unit.jobId]),(e:any)=>e.code==='42501');
  const first=(await worker.claim(unit.id))!;assert.ok(first);await worker.recordTrial(unit.id,first,0,{results:{'namespace-bypass':{status:'passed'}}});await worker.release(unit.id,first);
  const second=(await worker.claim(unit.id))!;assert.ok(second&&first!==second);
  const run=await executeSuite(f.scope.repository,unit.inputs.head.snapshot,unit.definition.suite,f.f.policy,{runId:unit.id,assertionSnapshot:unit.inputs.base.snapshot,priorOmittedInputs:unit.inputs.head.omitted,loadTrial:i=>worker.trial(unit.id,i),saveTrial:(i,c)=>worker.recordTrial(unit.id,second,i,c)},async()=>{throw Error('retained checkpoint must prevent execution');});
  const completed=await worker.complete(unit.id,second,run);assert.equal(completed.status,'passed');assert.deepEqual((await f.staging.recoveryPlan(f.f.plan.id))!.completedUnitIds,[unit.id]);assert.equal((await f.pool.query('SELECT count(*) FROM agentci_reviews')).rows[0].count,'0');
 }finally{await restricted?.end();if(created){await f.pool.query(`DROP OWNED BY ${role}`);await f.pool.query(`DROP ROLE ${role}`);}await f.close();}
});
test('canonical Unicode and escaped bytes survive JSONB storage; migration repeat is stable and changed body or checksum rejects',async()=>{
 const f=await fixture({'z-last.txt':'héllo\n"quoted"\\path\t🙂','a-first.txt':'雪'});try{
  const sql=await readFile(new URL('../../deploy/migrations/015_m3_reproduction_eval_source.sql',import.meta.url),'utf8');await f.pool.query(sql);
  const staged=await f.staging.stage(f.f.plan.id,f.f.base,f.f.head),job=(await f.pool.query('SELECT * FROM agentci_eval_jobs')).rows[0];assert.equal(job.source_head_canonical,canonical(f.f.head.files));assert.notEqual(job.source_head_canonical,(await f.pool.query('SELECT (inputs->\'head\'->\'snapshot\'->\'files\')::text AS serialized FROM agentci_eval_jobs')).rows[0].serialized);assert.ok(await f.evals.unit(staged.unitId));
  const c=await f.pool.connect();try{await assert.rejects(c.query(sql.replace('ALTER TABLE agentci_eval_jobs ALTER COLUMN review_id DROP NOT NULL;','ALTER TABLE agentci_eval_jobs ALTER COLUMN review_id DROP NOT NULL; -- changed')),/Migration source checksum mismatch/);await c.query('ROLLBACK');await c.query("UPDATE agentci_schema_migrations SET checksum=$1 WHERE version='015_m3_reproduction_eval_source'",['0'.repeat(64)]);await assert.rejects(c.query(sql),/Applied migration checksum mismatch/);await c.query('ROLLBACK');}finally{c.release();}
 }finally{await f.close();}
});
test('missing typed migration never falls back; legacy stage hash/comparison/export remain identical across upgrade',async()=>{
 const f=await reproductionStagingFixture();try{
  const legacy=new Store(f.pool,f.scope.organizationId,f.scope.repository);await legacy.ready();await f.store.reserve(f.f.initial.id,f.selector);const typed=new ReproductionEvalStore(f.pool,f.scope,f.registry);await assert.rejects(typed.stage(f.f.plan.id,f.f.base,f.f.head),/column .*source.* does not exist/);assert.equal((await f.pool.query('SELECT count(*) FROM agentci_eval_jobs')).rows[0].count,'0');
  const config=await readFile(new URL('../../agentci.yaml',import.meta.url),'utf8'),base={...f.f.base,files:{...f.f.base.files,'agentci.yaml':config,'specs/agentci-full-spec.md':'Fixture specification.'}},head={...f.f.head,files:{...f.f.head.files,'agentci.yaml':config,'specs/agentci-full-spec.md':'Fixture specification.'}};const review=await legacy.save(analyze({repository:f.scope.repository,base,head}),f.f.initial.subject.pullRequest),evals=new EvalStore(f.pool,f.scope.organizationId,f.scope.repository),attempt=randomUUID();const args:Parameters<EvalStore['stage']>=[review.id,attempt,base,head,[f.f.plan.definition],{suiteChanges:[],coverageGaps:[],selectionGaps:[]}];
  const before=await evals.stage(...args),comparison=await evals.comparison(before.id),stream=[];for await(const frame of evals.exportComparison(before.id))stream.push(frame);const hash=(await f.pool.query('SELECT digest FROM agentci_eval_jobs WHERE id=$1',[before.id])).rows[0].digest;
  await f.pool.query(await readFile(new URL('../../deploy/migrations/015_m3_reproduction_eval_source.sql',import.meta.url),'utf8'));assert.deepEqual(await evals.stage(...args),before);assert.equal((await f.pool.query('SELECT digest FROM agentci_eval_jobs WHERE id=$1',[before.id])).rows[0].digest,hash);assert.deepEqual(await evals.comparison(before.id),comparison);const after=[];for await(const frame of evals.exportComparison(before.id))after.push(frame);assert.deepEqual(after,stream);assert.ok(await evals.unit(before.unitIds[0]!));assert.equal((await evals.recoveryPlan(attempt))!.reviewId,review.id);
 }finally{await f.close();}
});

test('admission-only staged unit executes the approved assertion in the real isolated runner and retains receipt across recovery',async()=>{
 const image=process.env.AGENTCI_TEST_RUNNER_IMAGE;if(!image)throw Error('Typed staging execution acceptance requires an immutable runner image');
 const f=await fixture(undefined,image);try{
  const history=new FindingHistoryStore(f.pool,f.scope,{reviewer:async()=>({result:f.f.reviewer,documents:f.f.documents}),receipt:(id,subject)=>store.readReceipt(id,subject)});const store=new FindingReproductionStore(f.pool,f.scope,history,f.evals,{approvedPlan:async()=>f.f.plan},f.staging),staged=await store.stage(f.f.plan.id,f.f.base,f.f.head);
  const run=await executeStoredUnit(f.evals,staged.unitId,{image});assert.equal(run.status,'passed');
  await store.finalize(f.f.plan.id);const receipt=await store.readReceipt(f.f.plan.id,f.f.initial.subject);assert.equal(receipt.outcome,'reproduced');
  assert.deepEqual(await store.stage(f.f.plan.id,f.f.base,f.f.head),staged);assert.deepEqual(await executeStoredUnit(f.evals,staged.unitId,{image}),run);assert.equal((await f.pool.query('SELECT count(*) FROM agentci_reviews')).rows[0].count,'0');
 }finally{await f.close();}
});
test('retained operation/plan corruption rejects staging and recovery; failed unit insert rolls back the job',async()=>{
 for(const kind of ['operation','plan'] as const){const f=await fixture();try{
  await f.staging.stage(f.f.plan.id,f.f.base,f.f.head);
  if(kind==='operation'){await f.pool.query('ALTER TABLE agentci_reproduction_operations DISABLE TRIGGER reproduction_operation_immutable');await f.pool.query("UPDATE agentci_reproduction_operations SET request=jsonb_set(request,'{expectedVersion}','900')");await f.pool.query('ALTER TABLE agentci_reproduction_operations ENABLE TRIGGER reproduction_operation_immutable');}
  else{await f.pool.query('ALTER TABLE agentci_reproduction_plans DISABLE TRIGGER reproduction_plan_immutable');await f.pool.query("UPDATE agentci_reproduction_plans SET plan=jsonb_set(plan,'{approval,reason}','\"substituted\"')");await f.pool.query('ALTER TABLE agentci_reproduction_plans ENABLE TRIGGER reproduction_plan_immutable');}
  await assert.rejects(f.staging.stage(f.f.plan.id,f.f.base,f.f.head),/reproduction-eval-conflict/);await assert.rejects(f.staging.recoveryPlan(f.f.plan.id),/reproduction-eval-conflict/);
 }finally{await f.close();}}
 const f=await fixture();try{
  await f.pool.query("CREATE FUNCTION reject_fixture_unit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture interrupted transaction'; END; $$");await f.pool.query('CREATE TRIGGER fixture_reject_unit BEFORE INSERT ON agentci_eval_units FOR EACH ROW EXECUTE FUNCTION reject_fixture_unit()');
  await assert.rejects(f.staging.stage(f.f.plan.id,f.f.base,f.f.head),/reproduction-eval-unavailable/);assert.equal((await f.pool.query('SELECT count(*) FROM agentci_eval_jobs')).rows[0].count,'0');assert.equal((await f.pool.query('SELECT count(*) FROM agentci_eval_units')).rows[0].count,'0');
  await f.pool.query('DROP TRIGGER fixture_reject_unit ON agentci_eval_units');assert.ok(await f.staging.stage(f.f.plan.id,f.f.base,f.f.head));
 }finally{await f.close();}
});

test('oversized approved staging payload fails permanently before insertion without shrinking source',async()=>{
 // Exercise the independent storage ceiling, behind the production registry's
 // separate aggregate loading cap. Plan compilation and SQL reservation are real.
 const files=Object.fromEntries(Array.from({length:9},(_,i)=>[`large-${i}.txt`,'x'.repeat(2*1024*1024)]));
 const f=await reproductionStagingFixture({extraFiles:files,registryFactory:async entries=>({select(value,current){const request=value as any,plan=entries[0]!.plan;assert.equal(request.approvalId,plan.id);assert.equal(request.approvalDigest,digest(canonical(plan)));return {request,requestDigest:digest(canonical(request)),currentDigest:digest(canonical(current)),planDigest:digest(canonical(plan)),plan:structuredClone(plan)};}})});
 try{
  await new Store(f.pool,f.scope.organizationId,f.scope.repository).ready();await f.pool.query(await readFile(new URL('../../deploy/migrations/015_m3_reproduction_eval_source.sql',import.meta.url),'utf8'));await f.store.reserve(f.f.initial.id,f.selector);
  const before=digest(canonical({base:f.f.base,head:f.f.head})),staging=new ReproductionEvalStore(f.pool,f.scope,f.registry);
  await assert.rejects(staging.stage(f.f.plan.id,f.f.base,f.f.head),e=>e instanceof ReproductionEvalInputLimit&&e.message==='reproduction-eval-input-limit'&&e.retryable===false);
  assert.equal(digest(canonical({base:f.f.base,head:f.f.head})),before);assert.equal((await f.pool.query('SELECT count(*) FROM agentci_eval_jobs')).rows[0].count,'0');assert.equal((await f.pool.query('SELECT count(*) FROM agentci_eval_units')).rows[0].count,'0');
 }finally{await f.close();}
});
