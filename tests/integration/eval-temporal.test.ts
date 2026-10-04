import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {randomUUID,createHash} from 'node:crypto';
import {spawn,execFile} from 'node:child_process';import {promisify} from 'node:util';import {once} from 'node:events';import {setTimeout as delay} from 'node:timers/promises';
import {Pool} from 'pg';import {stringify} from 'yaml';
import {Client,Connection} from '@temporalio/client';import {NativeConnection,Worker} from '@temporalio/worker';import {Context} from '@temporalio/activity';
import {Store} from '../../packages/storage/postgres.ts';import {EvalStore} from '../../packages/storage/evals.ts';
import {analyze} from '../../packages/review/engine.ts';import {parseYaml} from '../../packages/project/index.ts';
import {createEvalActivities} from '../../apps/eval-worker/activities.ts';import {evalSuite} from '../fixtures/evals.ts';
const databaseUrl=process.env.AGENTCI_TEST_DATABASE_URL,temporalAddress=process.env.AGENTCI_TEST_TEMPORAL_ADDRESS,image=process.env.AGENTCI_TEST_RUNNER_IMAGE;
if(!databaseUrl||!temporalAddress||!image)throw new Error('Temporal eval acceptance requires real PostgreSQL, Temporal and immutable runner image; never silently skip');
const org='00000000-0000-4000-8000-000000000001',repository='example/repo',sha=()=>createHash('sha1').update(randomUUID()).digest('hex');
const docker=async(args:string[])=>(await promisify(execFile)('docker',args,{encoding:'utf8',timeout:30000})).stdout.trim();
test('separate eval worker: restricted startup, committed-trial retry, cancellation cleanup and replay',{timeout:120000},async()=>{
  const admin=new Pool({connectionString:databaseUrl}),login='agentci_test_temporal_'+randomUUID().replaceAll('-',''),password=randomUUID()+randomUUID();
  let restricted:Pool|undefined,connection:Connection|undefined,native:NativeConnection|undefined,worker:Worker|undefined,run:Promise<void>|undefined,child:ReturnType<typeof spawn>|undefined,roleCreated=false;
  try{
    for(const name of ['001_m1.sql','002_m2.sql','002_m2_eval_role.sql'])await admin.query(await readFile(new URL(`../../deploy/migrations/${name}`,import.meta.url),'utf8'));
    await admin.query(`CREATE ROLE ${login} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS IN ROLE agentci_eval_executor`);
    roleCreated=true;
    const url=new URL(databaseUrl!);url.username=login;url.password=password;restricted=new Pool({connectionString:url.toString(),max:4});
    const reviewStore=new Store(admin,org,repository);await reviewStore.ready();const control=new EvalStore(admin,org,repository),store=new EvalStore(restricted,org,repository);
    const config=parseYaml(await readFile(new URL('../../agentci.yaml',import.meta.url),'utf8')) as any;config.spec.specifications.include=['specs/**'];
    const base={sha:sha(),files:{'agentci.yaml':stringify(config),'specs/overview.md':'Eval worker fixture.'}},head={sha:sha(),files:{...base.files,'subject.txt':'changed'}};
    const review=await reviewStore.save(analyze({repository,base,head}),1),plan={suiteChanges:[],coverageGaps:[],selectionGaps:[]};
    const stage=async(count:number,script:string)=>{
      const suite=evalSuite({runner:{adapter:'command',command:['node','-e',script],timeoutMs:30000},trials:{count,passRate:1,confidenceMethod:'wilson'}});
      return (await control.stage(review.id,randomUUID(),base,head,[{suite,side:'base',assertionSide:'base',runner:{runnerImage:image!}}],plan)).unitIds[0]!;
    };
    connection=await Connection.connect({address:temporalAddress!});native=await NativeConnection.connect({address:temporalAddress!});const client=new Client({connection});
    const workflowsPath=new URL('../../dist/apps/eval-worker/workflows.js',import.meta.url).pathname;
    const initialId=await stage(1,'process.exit(process.env.GITHUB_TOKEN||process.env.AGENTCI_EVIDENCE_TOKEN?1:0)');
    child=spawn(process.execPath,['dist/apps/eval-worker/main.js'],{stdio:'ignore',env:{PATH:process.env.PATH,
      AGENTCI_REPOSITORY:repository,AGENTCI_ORGANIZATION_ID:org,AGENTCI_EVAL_DATABASE_URL:url.toString(),AGENTCI_EVAL_RUNNER_IMAGE:image,TEMPORAL_ADDRESS:temporalAddress}});
    const initial=await client.workflow.start('evaluateUnit',{args:[initialId],taskQueue:'agentci-eval-v1',workflowId:randomUUID(),workflowExecutionTimeout:'40 seconds'});
    await Promise.race([initial.result(),once(child,'exit').then(()=>{throw new Error('Isolated worker exited before accepting a unit');})]);
    assert.equal((await store.unit(initialId))!.result!.status,'passed');
    const childExit=once(child,'exit');child.kill('SIGTERM');await childExit;child=undefined;
    await Worker.runReplayHistory({workflowsPath},await initial.fetchHistory(),initial.workflowId);
    const queue='agentci-eval-test-'+randomUUID(),retryId=await stage(3,'process.exit(0)');
    const record=store.recordTrial.bind(store);let writes=0,failOnce=true;
    store.recordTrial=async(...args)=>{await record(...args);writes++;if(args[0]===retryId&&failOnce){failOnce=false;throw new Error('Simulated interruption after durable trial commit');}};
    const activities=createEvalActivities(store,()=>({image:image!}),{maintenanceMs:100}),attempts:number[]=[],missingId=randomUUID(),missingAttempts:number[]=[];
    const makeWorker=()=>Worker.create({connection:native!,taskQueue:queue,workflowsPath,maxHeartbeatThrottleInterval:100,defaultHeartbeatThrottleInterval:100,
      shutdownGraceTime:500,activities:{runEvalUnit:async(id:string)=>{if(id===retryId)attempts.push(Context.current().info.attempt);if(id===missingId)missingAttempts.push(Context.current().info.attempt);return activities.runEvalUnit(id);}}});
    worker=await makeWorker();run=worker.run();
    const retry=await client.workflow.start('evaluateUnit',{args:[retryId],workflowId:randomUUID(),taskQueue:queue,workflowExecutionTimeout:'40 seconds'});
    assert.equal(await retry.result(),retryId);assert.deepEqual(attempts,[1,2]);assert.equal(writes,3,'committed first trial is replayed without writing another observation');
    assert.equal((await store.unit(retryId))!.result!.status,'passed');await Worker.runReplayHistory({workflowsPath},await retry.fetchHistory(),retry.workflowId);
    const missing=await client.workflow.start('evaluateUnit',{args:[missingId],workflowId:randomUUID(),taskQueue:queue,workflowExecutionTimeout:'40 seconds'});
    await assert.rejects(missing.result(),error=>{let cause=error as {cause?:unknown;type?:string;nonRetryable?:boolean};while(cause.cause)cause=cause.cause as typeof cause;return cause.type==='InvalidEvalUnit'&&cause.nonRetryable===true;});
    assert.deepEqual(missingAttempts,[1]);await Worker.runReplayHistory({workflowsPath},await missing.fetchHistory(),missing.workflowId);
    const cancelId=await stage(1,'setInterval(()=>{},1000)'),cancel=await client.workflow.start('evaluateUnit',{args:[cancelId],workflowId:randomUUID(),taskQueue:queue,workflowExecutionTimeout:'40 seconds'});
    let live='';for(let i=0;i<200;i++){live=await docker(['ps','--quiet','--filter',`label=agentci.eval.unit=${cancelId}`]);if(live)break;await delay(25);}assert.ok(live,'cancel test must observe an actual running container');
    await cancel.cancel();await assert.rejects(cancel.result());
    assert.equal(await docker(['ps','--all','--quiet','--filter',`label=agentci.eval.unit=${cancelId}`]),'','workflow cancellation must wait for actual container cleanup');
    assert.equal((await store.unit(cancelId))!.status,'cancelled');assert.equal((await store.unit(cancelId))!.result,undefined);
    await Worker.runReplayHistory({workflowsPath},await cancel.fetchHistory(),cancel.workflowId);
    const interruptedId=await stage(1,'setTimeout(()=>process.exit(0),2000)'),interrupted=await client.workflow.start('evaluateUnit',{args:[interruptedId],workflowId:randomUUID(),taskQueue:queue,workflowExecutionTimeout:'40 seconds'});
    let running='';for(let i=0;i<200;i++){running=await docker(['ps','--quiet','--filter',`label=agentci.eval.unit=${interruptedId}`]);if(running)break;await delay(25);}assert.ok(running,'shutdown must interrupt an actually running container');
    worker.shutdown();await run;worker=undefined;
    assert.equal((await store.unit(interruptedId))!.status,'queued','worker shutdown must release for retry, not permanently cancel');
    assert.equal(await docker(['ps','--all','--quiet','--filter',`label=agentci.eval.unit=${interruptedId}`]),'');
    worker=await makeWorker();run=worker.run();assert.equal(await interrupted.result(),interruptedId);
    assert.equal((await store.unit(interruptedId))!.result!.status,'passed');
    await Worker.runReplayHistory({workflowsPath},await interrupted.fetchHistory(),interrupted.workflowId);
    const history=JSON.stringify(await retry.fetchHistory());assert.ok(!history.includes(password));assert.ok(!history.includes('Eval worker fixture.'),'snapshots stay out of workflow history');
  }finally{
    if(child){const exited=once(child,'exit');child.kill('SIGTERM');await exited;}
    if(worker){worker.shutdown();await run;}await native?.close();await connection?.close();await restricted?.end();
    if(roleCreated){await admin.query(`DROP OWNED BY ${login}`);await admin.query(`DROP ROLE IF EXISTS ${login}`);}await admin.end();
  }
});
