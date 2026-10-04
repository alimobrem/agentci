import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {Octokit} from '@octokit/rest';
import {Pool} from 'pg';
import {parse,stringify} from 'yaml';
import {ApplicationFailure} from '@temporalio/activity';
import {Store} from '../../packages/storage/postgres.ts';
import {EvalStore} from '../../packages/storage/evals.ts';
import {controllerEvalPolicy} from '../../packages/evals/orchestration.ts';
import {createEvalReviewActivities} from '../../apps/worker/eval-activities.ts';
import {evalSuite} from '../fixtures/evals.ts';
const databaseUrl=process.env.AGENTCI_TEST_DATABASE_URL;
if(!databaseUrl)throw new Error('Eval review staging requires real PostgreSQL; never silently skip');
test('Git HTTP and PostgreSQL staging retain exact plans, retry identity, gaps and sanitized failures',{timeout:30000},async()=>{
  const pool=new Pool({connectionString:databaseUrl}),org='00000000-0000-4000-8000-000000000001',repository='example/repo';
  const config=parse(await readFile(new URL('../../agentci.yaml',import.meta.url),'utf8'));config.spec.specifications.include=['specs/**'];config.spec.evals.include=['evals/**'];
  const sha=()=>createHash('sha1').update(randomUUID()).digest('hex');
  const base={sha:sha(),files:{'agentci.yaml':stringify(config),'specs/overview.md':'Fixture specification.','evals/main.yaml':stringify(evalSuite({models:['model-a','model-b']})),'prompts/main.md':'baseline','check.mjs':'process.exit(0)','.env.example':'must-not-enter-history'}};
  const head={sha:sha(),files:{...base.files,'prompts/main.md':'changed','evals/main.yaml':stringify(evalSuite({trials:{count:1,passRate:0,confidenceMethod:'wilson'}}))}};
  const emptyBase={sha:sha(),files:{'agentci.yaml':stringify(config),'specs/overview.md':'Fixture specification.','prompts/main.md':'baseline'}},emptyHead={sha:sha(),files:{...emptyBase.files,'prompts/main.md':'changed','specs/requirement.yaml':stringify({id:'REQ-NEW',title:'New requirement',type:'functional',status:'active',text:'New behavior.'})}};
  const snapshots=[base,head,emptyBase,emptyHead],trees=new Map<string,unknown>(),blobs=new Map<string,{sha:string;content:string;encoding:string}>(),requests:string[]=[];
  for(const snapshot of snapshots){
    const tree=Object.entries(snapshot.files).map(([path,value])=>{const bytes=Buffer.from(value),id=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');blobs.set(id,{sha:id,content:bytes.toString('base64'),encoding:'base64'});return {path,sha:id,type:'blob',mode:'100644',size:bytes.length};});
    trees.set(snapshot.sha,{sha:snapshot.sha,truncated:false,tree});
  }
  let fail=false;
  const server=createServer((req,res)=>{
    requests.push(req.url!);res.setHeader('Content-Type','application/json');
    if(fail){res.statusCode=503;res.end(JSON.stringify({message:'private-fixture-response'}));return;}
    const path=new URL(req.url!,'http://localhost').pathname.split('/'),id=path.at(-1),operation=path.at(-2);
    const value=operation==='pulls'&&id==='73'?{state:'open',base:{sha:base.sha},head:{sha:head.sha}}:operation==='commits'&&snapshots.some(s=>s.sha===id)?{sha:id,tree:{sha:id}}:operation==='trees'?trees.get(id!):operation==='blobs'?blobs.get(id!):undefined;
    if(!value)res.statusCode=404;res.end(JSON.stringify(value??{message:'unknown'}));
  });server.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    for(const name of ['001_m1.sql','002_m2.sql'])await pool.query(await readFile(new URL(`../../deploy/migrations/${name}`,import.meta.url),'utf8'));
    const store=new Store(pool,org,repository),evals=new EvalStore(pool,org,repository);await store.ready();
    const client=new Octokit({baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}`,auth:'private-fixture-token',log:{debug(){},info(){},warn(){},error(){}}});
    const policy=controllerEvalPolicy({AGENTCI_EVAL_RUNNER_IMAGE:'sha256:'+'a'.repeat(64)}),scope={repository,installationId:12};
    const activities=createEvalReviewActivities(client,store,evals,scope,policy),job={...scope,pullRequest:73,baseSha:base.sha,headSha:head.sha},attempt=randomUUID();
    assert.equal(await activities.isEvalCurrent(job),true);assert.equal(await activities.isEvalCurrent({...job,headSha:'f'.repeat(40)}),false);
    const staged=await activities.stageEvalReview(job,attempt),retry=await activities.stageEvalReview(job,attempt);assert.deepEqual(retry,staged);assert.equal(staged.unitIds.length,4);
    assert.deepEqual(Object.keys(staged).sort(),['comparisonId','reviewId','unitIds']);assert.ok(!JSON.stringify(staged).includes('private-fixture'));assert.ok(!JSON.stringify(staged).includes('must-not-enter-history'));
    assert.ok(requests.includes(`/repos/example/repo/git/commits/${base.sha}`));assert.ok(requests.includes(`/repos/example/repo/git/commits/${head.sha}`));
    for(const id of staged.unitIds){const unit=(await evals.unit(id))!;assert.equal(unit.definition.assertionSide,'base');assert.equal(unit.definition.suite.spec.trials.count,20);assert.ok(['model-a','model-b'].includes(unit.definition.model!));}
    const compare=(await evals.comparison(staged.comparisonId))!;assert.equal(compare.comparison.summary.outcome,'pending');assert.ok(compare.comparison.suiteChanges.some(c=>c.kind==='modified'));
    const altered=createEvalReviewActivities(client,store,evals,scope,{...policy,image:'sha256:'+'b'.repeat(64)});
    await assert.rejects(altered.stageEvalReview(job,attempt),e=>e instanceof ApplicationFailure&&e.nonRetryable===true&&e.type==='EvalReviewConfiguration');
    const before=requests.length;await assert.rejects(activities.stageEvalReview({...job,installationId:13},attempt),e=>e instanceof ApplicationFailure&&e.nonRetryable===true);assert.equal(requests.length,before);
    const emptyJob={...job,baseSha:emptyBase.sha,headSha:emptyHead.sha},emptyAttempt=randomUUID(),empty=await activities.stageEvalReview(emptyJob,emptyAttempt);
    assert.deepEqual(empty.unitIds,[]);assert.deepEqual(await activities.stageEvalReview(emptyJob,emptyAttempt),empty);
    const emptyComparison=(await evals.comparison(empty.comparisonId))!;assert.equal(emptyComparison.comparison.summary.outcome,'insufficient');assert.ok(emptyComparison.comparison.coverageGaps.includes('REQ-NEW'));
    const frames=[];for await(const frame of evals.exportComparison(empty.comparisonId))frames.push(frame);assert.equal(frames.at(-2)!.type,'summary');assert.equal(frames.at(-1)!.type,'end');
    await assert.rejects(activities.cancelEvalReview(job,randomUUID(),staged.comparisonId),e=>e instanceof ApplicationFailure&&e.nonRetryable===true);assert.equal((await evals.comparison(staged.comparisonId))!.comparison.cancelRequested,false);
    await activities.cancelEvalReview(job,attempt,staged.comparisonId);await activities.cancelEvalReview(job,attempt,staged.comparisonId);assert.equal((await evals.comparison(staged.comparisonId))!.comparison.summary.state,'cancelled');
    fail=true;await assert.rejects(activities.stageEvalReview(job,randomUUID()),e=>e instanceof ApplicationFailure&&!e.nonRetryable&&e.type==='EvalReviewUnavailable'&&!JSON.stringify(e).includes('private-fixture')&&e.cause===undefined);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));await pool.end();}
});
