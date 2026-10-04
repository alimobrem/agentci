import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {randomUUID,createHash} from 'node:crypto';import {createServer} from 'node:http';import {once} from 'node:events';
import {Octokit} from '@octokit/rest';import {Pool} from 'pg';import {parse,stringify} from 'yaml';import {ApplicationFailure} from '@temporalio/activity';
import {Store} from '../../packages/storage/postgres.ts';import {EvalStore} from '../../packages/storage/evals.ts';import {planComparison} from '../../packages/evals/plan.ts';import {compileEvalUnits,controllerEvalPolicy} from '../../packages/evals/orchestration.ts';
import {createEvalReviewActivities} from '../../apps/worker/eval-activities.ts';import {executeStoredUnit} from '../../apps/eval-worker/unit.ts';import {evalPublicationKey} from '../../packages/github/eval-check.ts';import {evalSuite} from '../fixtures/evals.ts';
const databaseUrl=process.env.AGENTCI_TEST_DATABASE_URL,image=process.env.AGENTCI_TEST_RUNNER_IMAGE;
if(!databaseUrl||!image)throw new Error('Check acceptance requires real PostgreSQL and immutable isolated runner; never silently skip');
test('SQL/HTTP Check publication: complete regressions, stale races, scoped retries, ambiguous writes and lock contention',{timeout:60000},async()=>{
  const pool=new Pool({connectionString:databaseUrl}),org='00000000-0000-4000-8000-000000000001',repository='example/repo';
  const sha=()=>createHash('sha1').update(randomUUID()).digest('hex');
  const config=parse(await readFile(new URL('../../agentci.yaml',import.meta.url),'utf8'));config.spec.specifications.include=['specs/**'];config.spec.evals.include=['evals/**'];
  const suite=evalSuite({runner:{adapter:'command',command:['node','check.mjs'],harness:['check.mjs'],timeoutMs:5000},trials:{count:2,passRate:1,confidenceMethod:'wilson'}});
  const base={sha:sha(),files:{'agentci.yaml':stringify(config),'specs/requirement.yaml':stringify({id:'REQ-001',title:'Subject behavior',type:'functional',status:'active',text:'Expected behavior.'}),'evals/main.yaml':stringify(suite),'check.mjs':"import{readFileSync}from'node:fs';process.exit(readFileSync('subject.txt','utf8')==='good'?0:1)",'subject.txt':'good'}};
  const head={sha:sha(),files:{...base.files,'subject.txt':'bad','check.mjs':'process.exit(0)','evals/main.yaml':stringify(evalSuite({trials:{count:1,passRate:0,confidenceMethod:'wilson'}}))}},job={repository,installationId:12,pullRequest:75,baseSha:base.sha,headSha:head.sha};
  const state={stale:false,flipAfterList:false,ambiguous:false,creations:0,updates:0,runs:[] as any[],reads:0};
  const server=createServer(async(req,res)=>{
    const url=new URL(req.url!,'http://localhost'),path=url.pathname;let output:unknown;
    if(req.method==='GET'&&path.endsWith('/pulls/75')){state.reads++;output={state:'open',base:{sha:base.sha},head:{sha:state.stale?'c'.repeat(40):head.sha}};}
    else if(req.method==='GET'&&path.endsWith('/check-runs')){const runs=url.searchParams.get('filter')==='all'?state.runs:state.runs.slice(-1);output={total_count:runs.length,check_runs:runs};if(state.flipAfterList)state.stale=true;}
    else if((req.method==='POST'||req.method==='PATCH')&&path.includes('/check-runs')){
      let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);
      if(req.method==='POST'){state.creations++;const run={...body,id:100+state.creations,app:{id:42}};state.runs.push(run);output=run;if(state.ambiguous){state.ambiguous=false;res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({message:'private-fixture-response'}));return;}}
      else{state.updates++;const run=state.runs.find(r=>r.id===Number(path.split('/').at(-1)));assert.ok(run);Object.assign(run,body);output=run;}
    }else{res.writeHead(404);res.end('{}');return;}
    res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(output));
  });server.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    for(const name of ['001_m1.sql','002_m2.sql'])await pool.query(await readFile(new URL(`../../deploy/migrations/${name}`,import.meta.url),'utf8'));
    const store=new Store(pool,org,repository),evals=new EvalStore(pool,org,repository);await store.ready();
    const plan=planComparison({repository,base,head}),review=await store.save(plan.analysis,job.pullRequest),policy=controllerEvalPolicy({AGENTCI_EVAL_RUNNER_IMAGE:image});
    const storedPlan={suiteChanges:plan.suiteChanges,coverageGaps:plan.coverageGaps,selectionGaps:plan.selectionGaps},units=compileEvalUnits(plan,base,head,policy),attempt=randomUUID(),staged=await evals.stage(review.id,attempt,base,head,units,storedPlan);
    const client=new Octokit({baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}`,auth:'private-fixture-token',log:{debug(){},info(){},warn(){},error(){}}}),activities=createEvalReviewActivities(client,store,evals,{repository,installationId:12,appId:42,publicUrl:'https://example.invalid'},policy);
    const publish=()=>activities.publishEvalReview(job,attempt,review.id,staged.id);
    await assert.rejects(publish(),e=>e instanceof ApplicationFailure&&!e.nonRetryable);assert.equal(state.creations,0,'queued evidence must not publish a completed Check');
    for(const id of staged.unitIds)await executeStoredUnit(evals,id,{image:image!});
    assert.equal((await evals.comparison(staged.id))!.comparison.summary.outcome,'failed');
    const external=`agentci:evals:${job.pullRequest}:${job.baseSha}:${job.headSha}:${attempt}`;
    state.runs.push({id:1,name:'agentci/evals',head_sha:job.headSha,external_id:external,app:{id:99}},{id:2,name:'agentci/evals',head_sha:'c'.repeat(40),external_id:external,app:{id:42}},{id:3,name:'agentci/review',head_sha:job.headSha,external_id:external,app:{id:42}});
    state.ambiguous=true;await assert.rejects(publish(),e=>e instanceof ApplicationFailure&&!JSON.stringify(e).includes('private-fixture')&&e.cause===undefined);assert.equal(state.creations,1);
    assert.equal(await publish(),'published');assert.equal(state.creations,1,'ambiguous committed write must reconcile instead of duplicating');assert.equal(state.updates,1);
    const check=state.runs.find(r=>r.id===101)!;assert.equal(check.name,'agentci/evals');assert.equal(check.conclusion,'neutral');assert.equal(check.head_sha,head.sha);assert.match(check.output.summary,/behavioral evaluation: \*\*failed\*\*/);assert.match(check.output.summary,/Regression: safe-response/);assert.match(check.output.summary,/pass-rate delta -1/);assert.match(check.output.summary,/Removed scenario|Suite behavior: modified/);assert.match(check.output.summary,/Complete export/);assert.ok(Buffer.byteLength(check.output.summary)<60000);assert.ok(!check.output.summary.includes('readFileSync'));assert.ok(!check.output.summary.includes('private-fixture-token'));
    const writes=state.creations+state.updates;state.stale=true;assert.equal(await publish(),'superseded');assert.equal(state.creations+state.updates,writes);state.stale=false;
    state.flipAfterList=true;assert.equal(await publish(),'superseded');assert.equal(state.creations+state.updates,writes,'PR changed after Check-list read must not be written');state.flipAfterList=false;state.stale=false;
    let unlock:()=>void=()=>{},acquired:()=>void=()=>{};const locked=new Promise<void>(resolve=>{acquired=resolve;});const hold=store.withPublicationLock(evalPublicationKey(job),async()=>{acquired();await new Promise<void>(resolve=>{unlock=resolve;});});await locked;
    try{await assert.rejects(publish(),e=>e instanceof ApplicationFailure&&!e.nonRetryable);assert.equal(state.creations+state.updates,writes);}finally{unlock();await hold;}
    assert.equal(await publish(),'published');
    await assert.rejects(activities.publishEvalReview(job,randomUUID(),review.id,staged.id));await assert.rejects(activities.publishEvalReview(job,attempt,randomUUID(),staged.id));await assert.rejects(activities.publishEvalReview({...job,installationId:13},attempt,review.id,staged.id),e=>e instanceof ApplicationFailure&&e.nonRetryable===true);
    assert.equal(await activities.failEvalReview(job,attempt),'published');assert.equal(state.creations,1);assert.equal(check.conclusion,'action_required');assert.match(check.output.summary,/No passing behavioral result/);assert.equal(check.details_url,`https://example.invalid/v1/eval-comparisons/${staged.id}`);assert.match(check.output.summary,/request a fresh attempt with agentci review/);assert.match(check.output.summary,/does not rerun it/);assert.match(check.output.summary,/Complete export/);
    assert.equal(await publish(),'published');assert.equal(check.conclusion,'neutral');assert.match(check.output.summary,/\*\*failed\*\*/);
    const gapAttempt=randomUUID(),gap=await evals.stage(review.id,gapAttempt,base,head,[],{suiteChanges:[],coverageGaps:['REQ-NEW'],selectionGaps:[]});assert.equal(await activities.publishEvalReview(job,gapAttempt,review.id,gap.id),'published');const gapCheck=state.runs.find(r=>r.id===102)!;assert.equal(gapCheck.conclusion,'action_required');assert.match(gapCheck.output.summary,/\*\*insufficient\*\*/);assert.match(gapCheck.output.summary,/Uncovered requirement: REQ-NEW/);
    await activities.cancelEvalReview(job,gapAttempt,gap.id);assert.equal(gapCheck.output.title,'AgentCI evals cancelled');assert.equal(gapCheck.details_url,`https://example.invalid/v1/eval-comparisons/${gap.id}`);assert.match(gapCheck.output.summary,new RegExp(`review: ${review.id}; attempt: ${gapAttempt}`));assert.match(gapCheck.output.summary,/fresh attempt/);await assert.rejects(activities.publishEvalReview(job,gapAttempt,review.id,gap.id));
    // GitHub defaults to latest-only reads. An older exact attempt must still reconcile after a newer run exists.
    assert.equal(await publish(),'published');assert.equal(state.creations,2,'older attempt retry after newer Check must not duplicate');assert.equal(check.conclusion,'neutral');assert.equal(gapCheck.output.title,'AgentCI evals cancelled');
    state.stale=true;const beforeFailure=state.creations+state.updates,beforeCreations=state.creations;assert.equal(await activities.failEvalReview(job,gapAttempt),'published');assert.equal(state.creations+state.updates,beforeFailure+1,'existing stale attempt may be terminalized, never passed');assert.equal(gapCheck.conclusion,'action_required');assert.equal(await activities.failEvalReview(job,randomUUID()),'superseded');assert.equal(state.creations,beforeCreations,'stale terminal recovery cannot create a new Check');
    assert.deepEqual(state.runs.filter(r=>r.id<100).map(r=>r.output),[undefined,undefined,undefined],'other App, stale head and original M1 Check remain untouched');
    state.stale=false;const noPlan=randomUUID();assert.equal(await activities.failEvalReview(job,noPlan),'published');const noPlanCheck=state.runs.find(r=>r.external_id.endsWith(':'+noPlan))!;assert.match(noPlanCheck.output.summary,/No staged comparison evidence/);assert.equal(noPlanCheck.details_url,undefined);const beforeMismatch=state.creations+state.updates;await assert.rejects(activities.failEvalReview({...job,pullRequest:76},attempt));assert.equal(state.creations+state.updates,beforeMismatch,'mismatched retained identity cannot publish');
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));await pool.end();}
});
