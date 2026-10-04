import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {randomUUID,createHash} from 'node:crypto';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {setTimeout as delay} from 'node:timers/promises';
import {Pool} from 'pg';import {parse,stringify} from 'yaml';
import {Client,Connection} from '@temporalio/client';import {NativeConnection,Worker} from '@temporalio/worker';
import {ApplicationFailure} from '@temporalio/activity';
import {Store} from '../../packages/storage/postgres.ts';import {EvalStore} from '../../packages/storage/evals.ts';
import {planComparison} from '../../packages/evals/plan.ts';import {compileEvalUnits,controllerEvalPolicy} from '../../packages/evals/orchestration.ts';
import {createEvalActivities} from '../../apps/eval-worker/activities.ts';import {evalSuite} from '../fixtures/evals.ts';
const databaseUrl=process.env.AGENTCI_TEST_DATABASE_URL,temporalAddress=process.env.AGENTCI_TEST_TEMPORAL_ADDRESS,image=process.env.AGENTCI_TEST_RUNNER_IMAGE;
if(!databaseUrl||!temporalAddress||!image)throw new Error('PR parent acceptance requires real PostgreSQL, Temporal and immutable runner; never silently skip');
test('PR eval parent: separate children, baseline/head regression, cancellation, stale identity and replay',{timeout:150000},async()=>{
  const pool=new Pool({connectionString:databaseUrl}),org='00000000-0000-4000-8000-000000000001',repository='example/repo';
  let connection:Connection|undefined,native:NativeConnection|undefined,controller:Worker|undefined,evaluator:Worker|undefined,controllerRun:Promise<void>|undefined,evaluatorRun:Promise<void>|undefined;
  const docker=async(args:string[])=>(await promisify(execFile)('docker',args,{encoding:'utf8',timeout:30000})).stdout.trim();
  try{
    for(const name of ['001_m1.sql','002_m2.sql'])await pool.query(await readFile(new URL(`../../deploy/migrations/${name}`,import.meta.url),'utf8'));
    const store=new Store(pool,org,repository),evals=new EvalStore(pool,org,repository),policy=controllerEvalPolicy({AGENTCI_EVAL_RUNNER_IMAGE:image});await store.ready();
    const config=parse(await readFile(new URL('../../agentci.yaml',import.meta.url),'utf8'));config.spec.specifications.include=['specs/**'];config.spec.evals.include=['evals/**'];
    const sha=()=>createHash('sha1').update(randomUUID()).digest('hex'),suite=evalSuite({runner:{adapter:'command',command:['node','check.mjs'],harness:['check.mjs'],timeoutMs:120000},trials:{count:1,passRate:1,confidenceMethod:'wilson'}});
    const base={sha:sha(),files:{'agentci.yaml':stringify(config),'specs/overview.md':'Private parent fixture content.','specs/requirement.yaml':stringify({id:'REQ-001',title:'Subject behavior',type:'functional',status:'active',text:'Expected behavior.'}),'evals/main.yaml':stringify(suite),'check.mjs':"import{readFileSync}from'node:fs';process.exit(readFileSync('subject.txt','utf8')==='good'?0:1)",'subject.txt':'good'}};
    const head={sha:sha(),files:{...base.files,'subject.txt':'bad','check.mjs':'process.exit(0)','evals/main.yaml':stringify(evalSuite({trials:{count:1,passRate:0,confidenceMethod:'wilson'}}))}};
    const job={repository,installationId:12,pullRequest:74,baseSha:base.sha,headSha:head.sha};
    const stages=new Map<string,{reviewId:string;comparisonId:string;unitIds:string[]}>();let current=true,hang=false,staleAfterStage=false,holdStage=false;let releaseStage:(()=>void)|undefined;
    const activities={
      isEvalCurrent:async()=>current,
      stageEvalReview:async(_job:typeof job,attempt:string)=>{
        if(stages.has(attempt))return stages.get(attempt)!;
        const b=hang?{...base,sha:_job.baseSha,files:{...base.files,'check.mjs':'setInterval(()=>{},1000)'}}:base,h=hang?{...head,sha:_job.headSha,files:{...head.files,'check.mjs':'setInterval(()=>{},1000)'}}:head;
        const plan=planComparison({repository,base:b,head:h}),review=await store.save(plan.analysis,job.pullRequest);
        const staged=await evals.stage(review.id,attempt,b,h,compileEvalUnits(plan,b,h,policy),{suiteChanges:plan.suiteChanges,coverageGaps:plan.coverageGaps,selectionGaps:plan.selectionGaps});
        const result={reviewId:review.id,comparisonId:staged.id,unitIds:staged.unitIds};stages.set(attempt,result);if(staleAfterStage)current=false;if(holdStage)await new Promise<void>(resolve=>{releaseStage=resolve;});return result;
      },
      cancelEvalReview:async(_job:typeof job,attempt:string,id:string)=>{assert.equal(stages.get(attempt)?.comparisonId,id);await evals.cancel(id);},
    };
    connection=await Connection.connect({address:temporalAddress});native=await NativeConnection.connect({address:temporalAddress});const client=new Client({connection});
    const parentQueue='agentci-pr-parent-'+randomUUID(),evalQueue='agentci-pr-eval-'+randomUUID(),workflowsPath=new URL('../../dist/apps/worker/workflows.js',import.meta.url).pathname;
    controller=await Worker.create({connection:native,taskQueue:parentQueue,workflowsPath,activities});
    const execution=createEvalActivities(evals,()=>({image:image!}),{maintenanceMs:100});
    let failChildren=false;
    evaluator=await Worker.create({connection:native,taskQueue:evalQueue,workflowsPath:new URL('../../dist/apps/eval-worker/workflows.js',import.meta.url).pathname,maxHeartbeatThrottleInterval:100,defaultHeartbeatThrottleInterval:100,activities:{runEvalUnit:async(id:string)=>{if(failChildren)throw ApplicationFailure.nonRetryable('Fixture infrastructure failure','FixtureFailure');return execution.runEvalUnit(id);}}});
    controllerRun=controller.run();evaluatorRun=evaluator.run();
    const start=(attempt:string)=>client.workflow.start('evaluatePullRequest',{args:[hang?{...job,baseSha:sha(),headSha:sha()}:job,attempt,evalQueue],workflowId:randomUUID(),taskQueue:parentQueue,workflowExecutionTimeout:'120 seconds'});
    const attempt=randomUUID(),handle=await start(attempt),result=await handle.result() as {status:string;comparisonId:string;reviewId:string};
    assert.equal(result.status,'ready');assert.equal(result.comparisonId,stages.get(attempt)!.comparisonId);
    const comparison=(await evals.comparison(result.comparisonId))!;assert.equal(comparison.comparison.summary.outcome,'failed');assert.deepEqual(comparison.comparison.summary.comparisons[0]!.regressions,['safe-response']);
    await Worker.runReplayHistory({workflowsPath},await handle.fetchHistory(),handle.workflowId);
    const history=JSON.stringify(await handle.fetchHistory());assert.ok(!history.includes('Private parent fixture content.'));assert.ok(!history.includes('readFileSync'));assert.ok(!history.includes('subject.txt'));
    for(const id of stages.get(attempt)!.unitIds){const child=client.workflow.getHandle(`agentci:eval:${result.comparisonId}:${id}`);assert.equal(await child.result(),id);await Worker.runReplayHistory({workflowsPath:new URL('../../dist/apps/eval-worker/workflows.js',import.meta.url).pathname},await child.fetchHistory(),child.workflowId);}
    current=false;const never=randomUUID();assert.deepEqual(await (await start(never)).result(),{status:'superseded'});assert.ok(!stages.has(never));
    current=true;staleAfterStage=true;const staleAttempt=randomUUID(),stale=await start(staleAttempt);assert.deepEqual(await stale.result(),{status:'superseded'});assert.equal((await evals.comparison(stages.get(staleAttempt)!.comparisonId))!.comparison.summary.state,'cancelled');await Worker.runReplayHistory({workflowsPath},await stale.fetchHistory(),stale.workflowId);staleAfterStage=false;
    current=true;holdStage=true;const stageCancelAttempt=randomUUID(),stageCancel=await start(stageCancelAttempt);
    for(let i=0;i<200&&!releaseStage;i++)await delay(25);assert.ok(releaseStage,'cancel-during-stage must observe committed SQL before the response');
    await stageCancel.cancel();releaseStage();await assert.rejects(stageCancel.result());holdStage=false;releaseStage=undefined;
    assert.equal((await evals.comparison(stages.get(stageCancelAttempt)!.comparisonId))!.comparison.summary.state,'cancelled');
    const stagedHistory=await stageCancel.fetchHistory();assert.ok(!JSON.stringify(stagedHistory).includes('startChildWorkflowExecutionInitiatedEventAttributes'));await Worker.runReplayHistory({workflowsPath},stagedHistory,stageCancel.workflowId);
    current=true;hang=true;const cancelAttempt=randomUUID(),cancel=await start(cancelAttempt);
    let live=false;for(let i=0;i<200;i++){const staged=stages.get(cancelAttempt);if(staged&&(await Promise.all(staged.unitIds.map(id=>docker(['ps','--quiet','--filter',`label=agentci.eval.unit=${id}`])))).every(Boolean)){live=true;break;}await delay(25);}assert.ok(live,'parent cancellation must interrupt every actual evaluator child container');
    await cancel.cancel();await assert.rejects(cancel.result());
    for(const id of stages.get(cancelAttempt)!.unitIds){assert.equal(await docker(['ps','--all','--quiet','--filter',`label=agentci.eval.unit=${id}`]),'');assert.equal((await evals.unit(id))!.status,'cancelled');}
    assert.equal((await evals.comparison(stages.get(cancelAttempt)!.comparisonId))!.comparison.summary.state,'cancelled');await Worker.runReplayHistory({workflowsPath},await cancel.fetchHistory(),cancel.workflowId);
    current=true;const runningStaleAttempt=randomUUID(),runningStale=await start(runningStaleAttempt);
    live=false;for(let i=0;i<200;i++){const staged=stages.get(runningStaleAttempt);if(staged&&(await Promise.all(staged.unitIds.map(id=>docker(['ps','--quiet','--filter',`label=agentci.eval.unit=${id}`])))).every(Boolean)){live=true;break;}await delay(25);}assert.ok(live,'stale detection must interrupt every actually running child');
    current=false;assert.deepEqual(await runningStale.result(),{status:'superseded'});
    for(const id of stages.get(runningStaleAttempt)!.unitIds){assert.equal(await docker(['ps','--all','--quiet','--filter',`label=agentci.eval.unit=${id}`]),'');assert.equal((await evals.unit(id))!.status,'cancelled');}
    await Worker.runReplayHistory({workflowsPath},await runningStale.fetchHistory(),runningStale.workflowId);
    hang=false;failChildren=true;current=true;const failedAttempt=randomUUID(),failed=await start(failedAttempt);await assert.rejects(failed.result());assert.equal((await evals.comparison(stages.get(failedAttempt)!.comparisonId))!.comparison.summary.state,'cancelled');await Worker.runReplayHistory({workflowsPath},await failed.fetchHistory(),failed.workflowId);
  }finally{controller?.shutdown();evaluator?.shutdown();await Promise.allSettled([controllerRun,evaluatorRun].filter((p):p is Promise<void>=>!!p));await native?.close();await connection?.close();await pool.end();}
});
