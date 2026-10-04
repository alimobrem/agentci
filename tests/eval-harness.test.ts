import test from 'node:test';import assert from 'node:assert/strict';
import{baselineHarness}from'../packages/evals/harness.ts';import{evalSuite}from'./fixtures/evals.ts';
import{executeSuite}from'../packages/evals/execution.ts';
import{projectEvalInputs}from'../packages/evals/runner.ts';
const base={sha:'a'.repeat(40),files:{'evals/check.mjs':'assertion','src/subject.mjs':'base'}};
test('baseline assertion content is fixed while subject content and exact subject commit remain head-bound',()=>{
 const suite=evalSuite({runner:{adapter:'command',command:['node','evals/check.mjs'],harness:['evals/check.mjs'],timeoutMs:1000}});
 const head={sha:'b'.repeat(40),files:{'evals/check.mjs':'always pass','src/subject.mjs':'regression'}};
 const fixed=baselineHarness(suite,base,head);
 assert.equal(fixed.snapshot.sha,head.sha);assert.equal(fixed.snapshot.files['evals/check.mjs'],'assertion');assert.equal(fixed.snapshot.files['src/subject.mjs'],'regression');assert.equal(head.files['evals/check.mjs'],'always pass');
 assert.equal(fixed.revision,baselineHarness(suite,base,base).revision);
 assert.notEqual(fixed.revision,baselineHarness(suite,head,head).revision);
 assert.throws(()=>baselineHarness(suite,{...base,files:{'src/subject.mjs':'base'}},head),/Missing/);
});
test('protected tracked paths are omitted explicitly and cannot become hidden assertion inputs',async()=>{
 const policy={image:'sha256:'+'f'.repeat(64)},snapshot={...base,files:{...base.files,'.env.example':'placeholder','.env':'synthetic-test-secret'}};
 const projected=projectEvalInputs(snapshot);assert.deepEqual(projected.omitted,['.env','.env.example']);assert.equal(projected.snapshot.files['.env'],undefined);
 const result=await executeSuite('owner/repo',snapshot,evalSuite({trials:{count:1,passRate:1,confidenceMethod:'wilson'}}),policy,{},async(input)=>{assert.equal(input.files['.env'],undefined);return {sourceSha:input.sha,image:policy.image,status:'completed',exitCode:0};});
 assert.deepEqual(result.subject.omittedInputs,projected.omitted);assert.match(result.subject.inputDigest,/^sha256:/);assert.equal(result.runnerImage,policy.image);
 await assert.rejects(executeSuite('owner/repo',snapshot,evalSuite({runner:{adapter:'command',command:['node'],harness:['.env'],timeoutMs:1000}}),policy),/protected input/);
 assert.throws(()=>projectEvalInputs({...snapshot,files:{'../.env':'synthetic'}}),/Invalid/);
});
test('default baseline eval namespace restores deleted tests and removes newly injected assertion files',()=>{
 const assertions={...base,files:{...base.files,'agentci.yaml':'spec:\n  evals:\n    include: [evals/**]\n'}};
 const head={sha:'b'.repeat(40),files:{'src/subject.mjs':'regression','evals/injected.mjs':'overwrite tests'}};
 const fixed=baselineHarness(evalSuite(),assertions,head);
 assert.equal(fixed.snapshot.files['evals/check.mjs'],'assertion');assert.equal(fixed.snapshot.files['evals/injected.mjs'],undefined);
});
