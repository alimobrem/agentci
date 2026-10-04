import test from 'node:test';import assert from 'node:assert/strict';
import {evalSuite} from './fixtures/evals.ts';
import {executeSuite,executeComparison,compareRuns,executeModelMatrix} from '../packages/evals/execution.ts';
const policy={image:'sha256:'+'f'.repeat(64)},base={sha:'a'.repeat(40),files:{'check.mjs':'base'}},head={sha:'b'.repeat(40),files:{'check.mjs':'head'}};
test('baseline-configured repeated trials expose behavioral regression and preserve exact commit identities',async()=>{
  const suite=evalSuite({trials:{count:3,passRate:1,confidenceMethod:'wilson'}});
  const observed:string[]=[];
  const comparison=await executeComparison('owner/repo',base,head,suite,policy,{},async(snapshot,config)=>{
    observed.push(snapshot.sha);assert.deepEqual(config,suite);
    return {sourceSha:snapshot.sha,image:policy.image,status:'completed',exitCode:snapshot.sha===base.sha?0:1};
  });
  assert.equal(observed.length,6);assert.equal(comparison.base.subject.gitSha,base.sha);assert.equal(comparison.head.subject.gitSha,head.sha);
  assert.deepEqual(comparison.regressions,['safe-response']);assert.equal(comparison.deltas[0]!.passRateDelta,-1);assert.equal(comparison.head.scenarios[0]!.criticalFailures,3);
  assert.throws(()=>compareRuns(comparison.base,{...comparison.head,revision:'sha256:'+'0'.repeat(64)}),/same baseline/);
  assert.throws(()=>compareRuns(comparison.base,{...comparison.head,subject:{repository:'wrong/repo',gitSha:head.sha}}),/identities/);
});
test('model matrix evaluates every configured variant on both commits with a total budget',async()=>{
  const suite=evalSuite({models:['model-a','model-b'],representative:true,trials:{count:2,passRate:1,confidenceMethod:'wilson'}});
  const calls:string[]=[];
  const execute:Parameters<typeof executeModelMatrix>[6]=async(snapshot,_suite,_policy,options)=>{calls.push(`${snapshot.sha}:${options.model}`);return {sourceSha:snapshot.sha,image:policy.image,status:'completed',exitCode:0};};
  const matrix=await executeModelMatrix('owner/repo',base,head,suite,policy,{},execute);
  assert.equal(matrix.complete,true);assert.equal(matrix.completedVariants,2);assert.equal(calls.length,8);assert.deepEqual(matrix.comparisons.map(c=>c.head.model),['model-a','model-b']);
  await assert.rejects(executeModelMatrix('owner/repo',base,head,suite,policy,{maxTotalTrials:7},execute),/total trial budget/);
  const abort=new AbortController();abort.abort();assert.equal((await executeModelMatrix('owner/repo',base,head,suite,policy,{signal:abort.signal},execute)).complete,false);
});
test('trial budgets, explicit model variants, error and cancellation outcomes cannot quietly pass',async()=>{
  const suite=evalSuite({trials:{count:3,passRate:1,confidenceMethod:'wilson'}});
  await assert.rejects(executeSuite('owner/repo',base,suite,policy,{maxTrials:2}),/budget/);
  await assert.rejects(executeSuite('owner/repo',base,evalSuite({models:['model-a']}),policy),/explicit variant/);
  const aborted=new AbortController();aborted.abort();
  const incomplete=await executeSuite('owner/repo',base,suite,policy,{signal:aborted.signal},async()=>{throw Error('must not run');});assert.equal(incomplete.status,'insufficient');
  const errors=await executeSuite('owner/repo',base,suite,policy,{},async()=>({sourceSha:base.sha,image:policy.image,status:'error',exitCode:null,error:'infrastructure'}));assert.equal(errors.status,'error');assert.equal(errors.scenarios[0]!.errors,3);
  await assert.rejects(executeSuite('owner/repo',base,suite,policy,{},async()=>({sourceSha:head.sha,image:policy.image,status:'completed',exitCode:0})),/identity mismatch/);
});
