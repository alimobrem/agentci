import test from 'node:test';import assert from 'node:assert/strict';
import {evalSuite} from './fixtures/evals.ts';
import {adapterCommand,normalizeTrial} from '../packages/evals/adapters.ts';
import {validateEvalSuite} from '../packages/evals/contracts.ts';
import type {RunnerResult} from '../packages/evals/runner.ts';
const result=(report:string,exitCode=0):RunnerResult=>({sourceSha:'a'.repeat(40),image:'sha256:'+'b'.repeat(64),status:'completed',exitCode,report});
test('native reports must account for every scenario and agree with process outcome',()=>{
  const suite=evalSuite({runner:{adapter:'native',command:['node','eval.mjs'],report:'result.json',timeoutMs:1000}});
  const valid={schemaVersion:'v1alpha1',results:[{scenario:'safe-response',status:'passed',totalTokens:3}]};
  assert.equal(normalizeTrial(suite,result(JSON.stringify(valid))).results['safe-response']!.status,'passed');
  for(const data of [{...valid,results:[]},{...valid,results:[...valid.results,...valid.results]},{...valid,results:[{...valid.results[0],costUsd:-1}]},{...valid,extra:true}])assert.equal(normalizeTrial(suite,result(JSON.stringify(data))).error,'invalid-report');
  assert.equal(normalizeTrial(suite,result(JSON.stringify(valid),1)).error,'invalid-report');
  assert.equal(normalizeTrial(suite,{...result(''),status:'timeout'}).results['safe-response']!.status,'error');
});
test('pytest XML maps stable scenarios, preserves skipped/error outcomes and rejects ambiguous reports',()=>{
  const suite=evalSuite({runner:{adapter:'pytest',command:['python','-m','pytest'],report:'junit.xml',timeoutMs:1000},scenarios:[{id:'one',selector:'test_example.test_one'}]});
  const xml=(body:string)=>`<testsuites><testsuite><testcase classname="test_example" name="test_one" time="0.01">${body}</testcase></testsuite></testsuites>`;
  assert.deepEqual(normalizeTrial(suite,result(xml(''))).results.one,{status:'passed',latencyMs:10});
  assert.equal(normalizeTrial(suite,result(xml('<failure/>'),1)).results.one!.status,'failed');
  assert.equal(normalizeTrial(suite,result(xml('<error/>'),1)).results.one!.status,'error');
  assert.equal(normalizeTrial(suite,result(xml('<skipped/>'))).results.one!.status,'skipped');
  for(const report of ['<!DOCTYPE x [<!ENTITY a SYSTEM "file:///etc/passwd">]>'+xml(''),'<testsuites/>',xml('<failure/><skipped/>'),xml('').replace('test_one','unknown'),xml('').replace('</testcase>','')])assert.equal(normalizeTrial(suite,result(report)).error,'invalid-report');
  for(const exit of [2,3,4,5,6])assert.equal(normalizeTrial(suite,result(xml(''),exit)).error,'pytest-execution-error');
  assert.ok(adapterCommand(suite).includes('--junitxml=/workspace/junit.xml'));
  suite.spec.runner.command.push('--junitxml=other');assert.throws(()=>adapterCommand(suite),/managed/);
});
test('selectors and command arguments cannot alias assertions or contain NUL bytes',()=>{
  assert.throws(()=>validateEvalSuite(evalSuite({runner:{adapter:'native',command:['node'],report:'r.json',timeoutMs:1000},scenarios:[{id:'one',selector:'same'},{id:'two',selector:'same'}]})),/Duplicate scenario selector/);
  assert.throws(()=>validateEvalSuite(evalSuite({runner:{adapter:'command',command:['node','bad\0arg'],timeoutMs:1000}})),/Invalid runner arguments/);
});
