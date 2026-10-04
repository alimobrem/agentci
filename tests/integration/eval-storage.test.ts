import {containerEngine} from '../../packages/evals/runner.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {Pool} from 'pg';
import {stringify} from 'yaml';
import {parseYaml} from '../../packages/project/index.ts';
import {analyze,canonical,digest} from '../../packages/review/engine.ts';
import {Store} from '../../packages/storage/postgres.ts';
import {EvalStore,EvalLeaseLost,ImmutableEvalConflict,type EvalUnitDefinition} from '../../packages/storage/evals.ts';
import {executeSuite} from '../../packages/evals/execution.ts';
import {validateComparisonRecord} from '../../packages/evals/comparison.ts';
import {createControlApi} from '../../apps/control/server.ts';
import {AgentCIClient} from '../../packages/client/index.ts';
import {runIsolated} from '../../packages/evals/runner.ts';
import {evalSuite} from '../fixtures/evals.ts';
import {executeStoredUnit,cleanupCancelledUnit,EvalUnitBusy} from '../../apps/eval-worker/unit.ts';
import {requireEvalPrivileges} from '../../apps/eval-worker/privileges.ts';
const databaseUrl=process.env.AGENTCI_TEST_DATABASE_URL,image=process.env.AGENTCI_TEST_RUNNER_IMAGE;
if(!databaseUrl||!image)throw new Error('M2 durable eval tests require real PostgreSQL and an immutable runner image; never silently skip');
const org='00000000-0000-4000-8000-000000000001',repository='example/repo';
const sha=()=>createHash('sha1').update(randomUUID()).digest('hex');
test('PostgreSQL eval recovery: immutable exact inputs, fenced leases, retained observations, restart, cancellation and scope',{timeout:120000},async()=>{
  const pool=new Pool({connectionString:databaseUrl}),restartPool=new Pool({connectionString:databaseUrl});
  try{
    for(const name of ['001_m1.sql','002_m2.sql'])await pool.query(await readFile(new URL(`../../deploy/migrations/${name}`,import.meta.url),'utf8'));
    const reviewStore=new Store(pool,org,repository);await reviewStore.ready();
    const config=parseYaml(await readFile(new URL('../../agentci.yaml',import.meta.url),'utf8')) as any;config.spec.specifications.include=['specs/**'];
    const assertion="import{readFileSync}from'node:fs';process.exit(readFileSync('subject.txt','utf8')==='good'?0:1);";
    const base={sha:sha(),files:{'agentci.yaml':stringify(config),'specs/overview.md':'Fixture specification.','check.mjs':assertion,'subject.txt':'good','.env.example':'synthetic-staged-secret-must-be-omitted'}};
    const head={sha:sha(),files:{...base.files,'check.mjs':'process.exit(0)','subject.txt':'bad'}};
    const review=await reviewStore.save(analyze({repository,base,head}),1);
    const suite=evalSuite({runner:{adapter:'command',command:['node','check.mjs'],harness:['check.mjs'],timeoutMs:5000},trials:{count:3,passRate:1,confidenceMethod:'wilson'}});
    const definitions:EvalUnitDefinition[]=(['base','head'] as const).map(side=>({suite,side,assertionSide:'base',runner:{runnerImage:image!}}));
    const plan={suiteChanges:[],coverageGaps:[],selectionGaps:[]},store=new EvalStore(pool,org,repository),attempt=randomUUID();
    const jobs=await Promise.all(Array.from({length:5},()=>store.stage(review.id,attempt,base,head,definitions,plan)));
    assert.equal(new Set(jobs.map(j=>j.id)).size,1);assert.deepEqual(jobs[0]!.unitIds,jobs[1]!.unitIds);
    const job=jobs[0]!,baseId=job.unitIds[0]!,headId=job.unitIds[1]!;
    const queued=validateComparisonRecord((await store.comparison(job.id))!);assert.equal(queued.comparison.summary.outcome,'pending');assert.equal(queued.comparison.units.length,2);
    assert.ok(!JSON.stringify(queued).includes('synthetic-staged-secret'));assert.ok(!JSON.stringify(queued).includes(assertion));assert.equal(await store.comparison(randomUUID()),undefined);
    const unit=(await store.unit(baseId))!;assert.equal(unit.definition.side,'base');
    assert.ok(!JSON.stringify(unit.inputs).includes('synthetic-staged-secret'));assert.deepEqual(unit.inputs.base.omitted,['.env.example']);
    await assert.rejects(store.stage(review.id,attempt,base,{...head,files:{...head.files,'subject.txt':'other'}},definitions,plan),ImmutableEvalConflict);
    const claims=await Promise.all(Array.from({length:8},()=>store.claim(baseId)));
    assert.equal(claims.filter(Boolean).length,1);const first=claims.find(Boolean)!;
    const running=(await store.comparison(job.id))!;assert.equal(running.comparison.summary.state,'running');assert.ok(!JSON.stringify(running).includes(first));
    await store.renew(baseId,first);
    let executions=0;
    const executor:Parameters<typeof executeSuite>[5]=async(...args)=>{executions++;return runIsolated(...args);};
    await assert.rejects(executeSuite(repository,unit.inputs.base.snapshot,suite,{image:image!},{runId:baseId,assertionSnapshot:unit.inputs.base.snapshot,priorOmittedInputs:unit.inputs.base.omitted,
      loadTrial:index=>store.trial(baseId,index),saveTrial:async(index,checkpoint)=>{await store.recordTrial(baseId,first,index,checkpoint);throw new Error('Simulated process death after committed observation');}},executor),/Simulated process death/);
    assert.equal(executions,1);assert.equal((await store.trial(baseId,0))?.results['safe-response']!.status,'passed');
    await pool.query("UPDATE agentci_eval_units SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[baseId]);
    const restarted=new EvalStore(restartPool,org,repository);await restarted.ready();const second=(await restarted.claim(baseId))!;assert.ok(second&&second!==first);
    await assert.rejects(store.renew(baseId,first),EvalLeaseLost);
    await assert.rejects(store.recordTrial(baseId,first,1,{results:{'safe-response':{status:'failed'}}}),EvalLeaseLost);
    const resumed=await executeSuite(repository,unit.inputs.base.snapshot,suite,{image:image!},{runId:baseId,assertionSnapshot:unit.inputs.base.snapshot,priorOmittedInputs:unit.inputs.base.omitted,
      loadTrial:index=>restarted.trial(baseId,index),saveTrial:(index,checkpoint)=>restarted.recordTrial(baseId,second,index,checkpoint)},executor);
    assert.equal(executions,3,'the committed first trial must not execute again');assert.equal(resumed.status,'passed');
    await assert.rejects(restarted.recordTrial(baseId,second,0,{results:{'safe-response':{status:'failed'}}}),ImmutableEvalConflict);
    const completed=await restarted.complete(baseId,second,resumed);assert.equal(completed.id,baseId);assert.deepEqual(completed.subject.omittedInputs,['.env.example']);
    assert.equal(completed.artifacts.length,1);assert.deepEqual(await restarted.complete(baseId,second,resumed),completed);assert.equal(await store.claim(baseId),undefined);
    const retained=[];for(let index=0;index<3;index++)retained.push({index,...(await store.trial(baseId,index))!});
    assert.equal(completed.artifacts[0]!.digest,digest(canonical(retained)));
    const partial=(await store.comparison(job.id))!;assert.equal(partial.comparison.summary.outcome,'pending');assert.equal(partial.comparison.summary.comparisons.length,0);
    await assert.rejects(restarted.complete(baseId,second,{...resumed,subject:{...resumed.subject,inputDigest:'sha256:'+'f'.repeat(64)}}),ImmutableEvalConflict);
    const headUnit=(await store.unit(headId))!,headToken=(await store.claim(headId))!;
    const regressed=await executeSuite(repository,headUnit.inputs.head.snapshot,suite,{image:image!},{runId:headId,assertionSnapshot:headUnit.inputs.base.snapshot,priorOmittedInputs:headUnit.inputs.head.omitted,
      loadTrial:index=>store.trial(headId,index),saveTrial:(index,checkpoint)=>store.recordTrial(headId,headToken,index,checkpoint)});
    assert.equal(regressed.status,'failed');assert.equal(regressed.scenarios[0]!.failed,3);assert.equal((await store.complete(headId,headToken,regressed)).status,'failed');
    const comparison=validateComparisonRecord((await restarted.comparison(job.id))!);assert.equal(comparison.comparison.summary.state,'completed');assert.equal(comparison.comparison.summary.outcome,'failed');assert.deepEqual(comparison.comparison.summary.comparisons[0]!.regressions,['safe-response']);assert.equal(comparison.comparison.reviewId,review.id);assert.equal(comparison.comparison.attemptId,attempt);
    assert.deepEqual(await store.comparison(job.id),comparison);
    assert.deepEqual(await store.comparison(job.id.toUpperCase()),comparison);
    const exports:unknown[][]=[];for(const id of [job.id,job.id.toUpperCase()]){const items=[];for await(const item of store.exportComparison(id))items.push(item);exports.push(items);}assert.deepEqual(exports[1],exports[0]);
    const api=createControlApi({repository,installationId:12,secret:'s'.repeat(32),evidenceToken:'e'.repeat(32)},reviewStore,store);api.listen(0,'127.0.0.1');await once(api,'listening');
    try{
      const client=new AgentCIClient({url:`http://127.0.0.1:${(api.address() as {port:number}).port}`,token:'e'.repeat(32)});
      assert.deepEqual(await client.evalComparison(job.id,{...comparison.comparison.subject,organizationId:org,reviewId:review.id,attemptId:attempt}),comparison);
      const upperIdentity={...comparison.comparison.subject,organizationId:org.toUpperCase(),reviewId:review.id.toUpperCase(),attemptId:attempt.toUpperCase()};
      assert.deepEqual(await client.evalComparison(job.id.toUpperCase(),upperIdentity),comparison);
      let streamedUnits=0,streamedComparisons=0,streamedOutcome='';
      for await(const item of client.evalComparisonExport(job.id.toUpperCase(),upperIdentity)){
        if(item.type==='unit')streamedUnits++;if(item.type==='comparison'){streamedComparisons++;assert.deepEqual(item.data.regressions,['safe-response']);}if(item.type==='summary')streamedOutcome=item.data.outcome;
      }
      assert.equal(streamedUnits,2);assert.equal(streamedComparisons,1);assert.equal(streamedOutcome,'failed');
      const protectedFiles=Object.fromEntries(Array.from({length:1100},(_,index)=>[`.env.${index}-`+'x'.repeat(4000),'synthetic omitted fixture']));
      const largeBase={sha:sha(),files:{...base.files,...protectedFiles}},largeHead={sha:sha(),files:{...head.files,...protectedFiles}};
      const largeReview=await reviewStore.save(analyze({repository,base:largeBase,head:largeHead}),2),largeAttempt=randomUUID();
      const largeJob=await store.stage(largeReview.id,largeAttempt,largeBase,largeHead,definitions,plan);
      for(const id of largeJob.unitIds)await executeStoredUnit(store,id,{image:image!});
      const largeIdentity={repository,pullRequest:2,baseSha:largeBase.sha,headSha:largeHead.sha,organizationId:org,reviewId:largeReview.id,attemptId:largeAttempt};
      await assert.rejects(client.evalComparison(largeJob.id,largeIdentity),/response-too-large/);
      let largeUnits=0,largeComplete=false;
      for await(const item of client.evalComparisonExport(largeJob.id,largeIdentity)){
        if(item.type==='unit'){largeUnits++;assert.equal(item.data.result!.subject.omittedInputs.length,1101);}
        if(item.type==='summary'){largeComplete=true;assert.equal(item.data.outcome,'failed');assert.equal(item.data.unitCount,2);}
      }
      assert.equal(largeUnits,2);assert.ok(largeComplete,'actual >4 MiB database evidence must remain completely consumable');
    }finally{await new Promise<void>(resolve=>api.close(()=>resolve()));}
    assert.equal(await new EvalStore(pool,randomUUID(),repository).comparison(job.id),undefined);assert.equal(await new EvalStore(pool,org,'other/repo').comparison(job.id),undefined);
    await assert.rejects(pool.query('UPDATE agentci_eval_jobs SET inputs=$2 WHERE id=$1',[job.id,{}]),/Immutable eval job/);
    await assert.rejects(pool.query('UPDATE agentci_eval_units SET result=$2 WHERE id=$1',[baseId,{}]),/Immutable eval unit/);
    await assert.rejects(pool.query('UPDATE agentci_eval_trials SET checkpoint=$2 WHERE unit_id=$1 AND trial=0',[baseId,{results:{}}]),/Immutable eval trial/);
    const another=await store.stage(review.id,randomUUID(),base,head,definitions,plan);assert.notEqual(another.id,job.id);
    const cancelledId=another.unitIds[0]!,cancelToken=(await store.claim(cancelledId))!;
    await store.recordTrial(cancelledId,cancelToken,0,{results:{'safe-response':{status:'passed'}}});
    const incomplete=await executeSuite(repository,base,suite,{image:image!},{runId:cancelledId},async(snapshot)=>({sourceSha:snapshot.sha,image,status:'completed',exitCode:0}));
    await assert.rejects(store.complete(cancelledId,cancelToken,incomplete),/missing eval trials/);
    await assert.rejects(store.recordTrial(cancelledId,cancelToken,1,{results:{'safe-response':{status:'passed',costUsd:-1}}}),/checkpoint metric/);
    const snapshot=store.exportComparison(another.id);assert.equal((await snapshot.next()).value?.type,'header');
    try{
      await store.cancel(another.id);let snapshotOutcome='';for await(const item of snapshot)if(item.type==='summary')snapshotOutcome=item.data.outcome;
      assert.equal(snapshotOutcome,'pending','concurrent cancellation cannot mix a new state into an existing snapshot');
    }finally{await snapshot.return(undefined);}
    assert.equal((await store.unit(cancelledId))!.status,'cancelled');assert.equal(await store.claim(cancelledId),undefined);
    const abandoned=store.exportComparison(another.id);await abandoned.next();await abandoned.return(undefined);assert.equal((await pool.query('SELECT 1 AS value')).rows[0].value,1);
    assert.equal((await store.comparison(another.id))!.comparison.summary.outcome,'insufficient');
    await assert.rejects(store.recordTrial(cancelledId,cancelToken,1,{results:{'safe-response':{status:'passed'}}}),EvalLeaseLost);
    assert.ok(await store.trial(cancelledId,0),'cancellation preserves completed observations');
    await store.cancel(another.id);await assert.rejects(pool.query('UPDATE agentci_eval_jobs SET cancel_requested=false WHERE id=$1',[another.id]),/Immutable eval job/);
    const wrong=new EvalStore(pool,'00000000-0000-4000-8000-000000000002',repository);
    await assert.rejects(wrong.ready(),/another deployment/);assert.equal(await wrong.unit(baseId),undefined);assert.equal(await wrong.trial(baseId,0),undefined);assert.equal(await wrong.claim(baseId),undefined);
    const slow=evalSuite({runner:{adapter:'command',command:['node','-e','setTimeout(()=>process.exit(0),2000)'],timeoutMs:10000},trials:{count:1,passRate:1,confidenceMethod:'wilson'}});
    const recoverJob=await store.stage(review.id,randomUUID(),base,head,[{suite:slow,side:'base',assertionSide:'base',runner:{runnerImage:image!}}],plan),recoverId=recoverJob.unitIds[0]!;
    const child=spawn(process.execPath,['--import','tsx','--input-type=module','-e',
      `import {Pool} from 'pg';import {EvalStore} from './packages/storage/evals.ts';import {executeStoredUnit} from './apps/eval-worker/unit.ts';const pool=new Pool({connectionString:process.env.AGENTCI_TEST_DATABASE_URL});try{await executeStoredUnit(new EvalStore(pool,${JSON.stringify(org)},${JSON.stringify(repository)}),${JSON.stringify(recoverId)},${JSON.stringify({image})});}finally{await pool.end();}`],{stdio:'ignore'});
    const docker=async(args:string[])=>(await promisify(execFile)(containerEngine(),args,{encoding:'utf8',timeout:30000})).stdout.trim();
    try{
      let container='';for(let i=0;i<100;i++){container=await docker(['ps','--quiet','--no-trunc','--filter',`label=agentci.eval.unit=${recoverId}`]);if(container)break;await delay(30);}
      assert.ok(container,'real leased worker must create a live owned container');
      const oldLease=(await store.leaseState(recoverId))!;assert.equal(oldLease.live,true);assert.ok(oldLease.token);
      const exited=once(child,'exit');child.kill('SIGKILL');assert.equal((await exited)[1],'SIGKILL');
      assert.equal(await docker(['ps','--quiet','--no-trunc','--filter',`id=${container}`]),container);
      await pool.query("UPDATE agentci_eval_units SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[recoverId]);
      const recovered=await executeStoredUnit(restarted,recoverId,{image:image!});assert.equal(recovered.status,'passed');
      assert.equal(await docker(['ps','--all','--quiet','--filter',`label=agentci.eval.unit=${recoverId}`]),'');
      await assert.rejects(store.release(recoverId,oldLease.token!),EvalLeaseLost);
      await assert.rejects(store.withLease(recoverId,oldLease.token!,async()=>{throw new Error('Stale owner reached cleanup');}),EvalLeaseLost);
      assert.deepEqual(await executeStoredUnit(restarted,recoverId,{image:image!}),recovered,'completed redelivery must return retained evidence');
    }finally{
      child.kill('SIGKILL');const remaining=await docker(['ps','--all','--quiet','--filter',`label=agentci.eval.unit=${recoverId}`]);if(remaining)await docker(['rm','--force','--volumes',...remaining.split('\n')]);
    }
    const abortJob=await store.stage(review.id,randomUUID(),base,head,[{suite:slow,side:'base',assertionSide:'base',runner:{runnerImage:image!}}],plan),abortId=abortJob.unitIds[0]!;
    const abort=new AbortController(),abortTimer=setTimeout(()=>abort.abort(),300);
    try{await assert.rejects(executeStoredUnit(store,abortId,{image:image!},{signal:abort.signal}),/cancelled/);}finally{clearTimeout(abortTimer);}
    assert.equal((await store.unit(abortId))!.status,'cancelled');assert.equal((await store.unit(abortId))!.result,undefined);
    assert.equal(await docker(['ps','--all','--quiet','--filter',`label=agentci.eval.unit=${abortId}`]),'');
    const cleanupSuite=evalSuite({runner:{adapter:'command',command:['node','-e','process.exit(0)'],timeoutMs:5000},trials:{count:1,passRate:1,confidenceMethod:'wilson'}});
    const cleanupJob=await store.stage(review.id,randomUUID(),base,head,[{suite:cleanupSuite,side:'base',assertionSide:'base',runner:{runnerImage:image!}}],plan),cleanupId=cleanupJob.unitIds[0]!;
    const wrapperDirectory=await mkdtemp(join(tmpdir(),'agentci-cleanup-refusal-')),realDocker=(await promisify(execFile)('which',[containerEngine()],{encoding:'utf8'})).stdout.trim();
    try{
      const wrapper=join(wrapperDirectory,containerEngine());
      await writeFile(wrapper,`#!/usr/bin/env node\nconst{execFileSync,spawnSync}=require('node:child_process');const args=process.argv.slice(2),real=${JSON.stringify(realDocker)};if(args[0]==='rm'){const target=args.at(-1);let labels={};try{labels=JSON.parse(execFileSync(real,['inspect','--format','{{json .Config.Labels}}',target],{encoding:'utf8',stdio:['ignore','pipe','ignore']}));}catch{}if(labels['agentci.eval.unit']===${JSON.stringify(cleanupId)}){process.stderr.write('Injected unit-specific cleanup refusal');process.exit(7);}}const result=spawnSync(real,args,{stdio:'inherit'});process.exit(result.status??1);\n`);await chmod(wrapper,0o755);
      const script=`import{Pool}from'pg';import{EvalStore}from'./packages/storage/evals.ts';import{executeStoredUnit}from'./apps/eval-worker/unit.ts';const pool=new Pool({connectionString:process.env.AGENTCI_TEST_DATABASE_URL});try{await executeStoredUnit(new EvalStore(pool,${JSON.stringify(org)},${JSON.stringify(repository)}),${JSON.stringify(cleanupId)},${JSON.stringify({image})});process.exitCode=2;}catch(error){if(!error.message.includes('Runner cleanup failed'))process.exitCode=3;}finally{await pool.end();}`;
      await promisify(execFile)(process.execPath,['--import','tsx','--input-type=module','-e',script],{env:{...process.env,PATH:wrapperDirectory+':'+process.env.PATH},timeout:30000});
      const refused=(await store.unit(cleanupId))!;assert.equal(refused.status,'queued');assert.equal(refused.result,undefined);assert.equal(await store.trial(cleanupId,0),undefined);
      assert.ok(await docker(['ps','--all','--quiet','--filter',`label=agentci.eval.unit=${cleanupId}`]),'cleanup refusal must leave a real container, never a successful result');
      assert.equal((await executeStoredUnit(store,cleanupId,{image:image!})).status,'passed','recovered owner cleans the refused container before completing a new trial');
      assert.equal(await docker(['ps','--all','--quiet','--filter',`label=agentci.eval.unit=${cleanupId}`]),'');
    }finally{const remaining=await docker(['ps','--all','--quiet','--filter',`label=agentci.eval.unit=${cleanupId}`]);if(remaining)await docker(['rm','--force','--volumes',...remaining.split('\n')]);await rm(wrapperDirectory,{recursive:true,force:true});}
    const hangingSuite=evalSuite({runner:{adapter:'command',command:['node','-e','setInterval(()=>{},1000)'],timeoutMs:120000},trials:{count:1,passRate:1,confidenceMethod:'wilson'}});
    const crashJob=await store.stage(review.id,randomUUID(),base,head,[{suite:hangingSuite,side:'base',assertionSide:'base',runner:{runnerImage:image!}}],plan),neighborJob=await store.stage(review.id,randomUUID(),base,head,[{suite:hangingSuite,side:'base',assertionSide:'base',runner:{runnerImage:image!}}],plan);
    const crashId=crashJob.unitIds[0]!,neighborId=neighborJob.unitIds[0]!;
    const spawnEval=(id:string)=>spawn(process.execPath,['--import','tsx','--input-type=module','-e',`import{Pool}from'pg';import{EvalStore}from'./packages/storage/evals.ts';import{executeStoredUnit}from'./apps/eval-worker/unit.ts';const pool=new Pool({connectionString:process.env.AGENTCI_TEST_DATABASE_URL});try{await executeStoredUnit(new EvalStore(pool,${JSON.stringify(org)},${JSON.stringify(repository)}),${JSON.stringify(id)},${JSON.stringify({image})},{maintenanceMs:100});}catch{process.exitCode=1;}finally{await pool.end();}`],{stdio:'ignore'});
    const crashed=spawnEval(crashId),neighbor=spawnEval(neighborId),owned=(id:string)=>docker(['ps','--all','--quiet','--no-trunc','--filter',`label=agentci.eval.unit=${id}`]);
    try{
      let both=false;for(let i=0;i<100;i++){if((await Promise.all([crashId,neighborId].map(id=>docker(['ps','--quiet','--no-trunc','--filter',`label=agentci.eval.unit=${id}`])))).every(Boolean)){both=true;break;}await delay(30);}assert.ok(both,'cancelled orphan test must observe both actual containers');
      await assert.rejects(cleanupCancelledUnit(store,crashId),EvalUnitBusy);assert.ok(await owned(crashId),'active units must not be reaped');
      const exited=once(crashed,'exit');crashed.kill('SIGKILL');assert.equal((await exited)[1],'SIGKILL');assert.ok(await owned(crashId),'worker death must leave a real orphan');
      await store.cancel(crashJob.id);assert.equal((await store.unit(crashId))!.status,'cancelled');assert.equal(await store.claim(crashId),undefined);
      await assert.rejects(cleanupCancelledUnit(wrong,crashId),/another deployment scope/);assert.ok(await owned(crashId),'cross-scope cleanup cannot reach the daemon');
      await Promise.all([cleanupCancelledUnit(store,crashId),cleanupCancelledUnit(store,crashId.toUpperCase())]);await cleanupCancelledUnit(store,crashId);
      assert.equal(await owned(crashId),'');assert.ok(await owned(neighborId),'cancelled cleanup preserves another active unit');
      assert.equal((await store.comparison(crashJob.id))!.comparison.summary.state,'cancelled');
    }finally{
      const exit=neighbor.exitCode===null&&neighbor.signalCode===null?once(neighbor,'exit'):Promise.resolve();crashed.kill('SIGKILL');neighbor.kill('SIGKILL');await exit;await store.cancel(neighborJob.id);
      for(const id of [crashId,neighborId]){const remaining=await owned(id);if(remaining)await docker(['rm','--force','--volumes',...remaining.split('\n')]);}
    }
    await pool.query(await readFile(new URL('../../deploy/migrations/002_m2_eval_role.sql',import.meta.url),'utf8'));
    await assert.rejects(requireEvalPrivileges(pool),/restricted database login/);
    const login='agentci_test_eval_'+randomUUID().replaceAll('-',''),password=randomUUID()+randomUUID();
    await pool.query(`CREATE ROLE ${login} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS IN ROLE agentci_eval_executor`);
    const loginUrl=new URL(databaseUrl!);loginUrl.username=login;loginUrl.password=password;
    const restricted=new Pool({connectionString:loginUrl.toString(),max:2});
    try{
      await requireEvalPrivileges(restricted);
      assert.equal((await restricted.query('SELECT current_user AS name')).rows[0].name,login,'must authenticate as a separate login, not SET ROLE on admin');
      for(const table of ['agentci_reviews','agentci_deliveries','agentci_jobs'])await assert.rejects(restricted.query(`SELECT * FROM ${table} LIMIT 1`),error=>(error as {code:string}).code==='42501');
      await assert.rejects(restricted.query('CREATE TABLE public.agentci_forbidden_eval_table(id integer)'),error=>(error as {code:string}).code==='42501');
      await assert.rejects(restricted.query('UPDATE agentci_eval_jobs SET cancel_requested=true WHERE id=$1',[job.id]),error=>(error as {code:string}).code==='42501');
      await assert.rejects(restricted.query('UPDATE agentci_eval_units SET definition=$2 WHERE id=$1',[baseId,{}]),error=>(error as {code:string}).code==='42501');
      const scoped=new EvalStore(restricted,org,repository),leastJob=await store.stage(review.id,randomUUID(),base,head,definitions,plan);
      assert.equal((await executeStoredUnit(scoped,leastJob.unitIds[0]!,{image:image!})).status,'passed','separate least-privilege login must execute and retain all trials');
    }finally{await restricted.end();await pool.query(`DROP OWNED BY ${login}`);await pool.query(`DROP ROLE ${login}`);}
  }finally{await restartPool.end();await pool.end();}
});
