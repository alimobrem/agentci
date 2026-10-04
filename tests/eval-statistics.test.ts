import test from 'node:test';import assert from 'node:assert/strict';
import {evalSuite} from './fixtures/evals.ts';import {aggregateScenario,wilsonInterval,combinedStatus,type TrialResult} from '../packages/evals/statistics.ts';
test('Wilson intervals match published binomial boundary calculations without asserting universal safety',()=>{
  const interval=wilsonInterval(20,20);assert.ok(Math.abs(interval.lower-0.8388748419471806)<1e-10);assert.ok(Math.abs(interval.upper-1)<1e-12);
  assert.ok(wilsonInterval(0,20).upper>0.16);assert.ok(wilsonInterval(20,20,0.99).lower<interval.lower);
  for(const [passed,total] of [[1,0],[-1,20],[21,20],[1.5,20]])assert.throws(()=>wilsonInterval(passed!,total!),/Invalid/);
});
test('configured observed pass threshold remains distinct from descriptive confidence and critical safety limits',()=>{
  const suite=evalSuite();suite.spec.scenarios[0]!.critical=false;
  const trials:TrialResult[]=Array.from({length:20},(_,i)=>({status:i===19?'failed':'passed'}));
  const result=aggregateScenario(suite,'safe-response',trials);assert.equal(result.status,'passed');assert.equal(result.passRate,0.95);assert.ok(result.confidenceInterval!.lower<0.95);
  suite.spec.scenarios[0]!.critical=true;assert.equal(aggregateScenario(suite,'safe-response',trials).status,'failed');assert.equal(aggregateScenario(suite,'safe-response',trials).criticalFailures,1);
  suite.spec.trials.passRate=0.96;suite.spec.scenarios[0]!.critical=false;assert.equal(aggregateScenario(suite,'safe-response',trials).status,'failed');
  const safety=evalSuite({class:'safety',scenarios:[{id:'safety-default'}]});
  assert.equal(aggregateScenario(safety,'safety-default',trials).criticalFailures,1);
  assert.equal(aggregateScenario(safety,'safety-default',trials).status,'failed');
});
test('missing/skipped trials and infrastructure errors cannot produce a passing statistical result',()=>{
  const suite=evalSuite();const pass:TrialResult={status:'passed'};
  assert.equal(aggregateScenario(suite,'safe-response',[]).status,'insufficient');assert.equal(aggregateScenario(suite,'safe-response',[pass]).status,'insufficient');
  const trials=Array.from({length:20},()=>pass);trials[0]={status:'skipped'};assert.equal(aggregateScenario(suite,'safe-response',trials).status,'insufficient');
  trials[0]={status:'error'};const result=aggregateScenario(suite,'safe-response',trials);assert.equal(result.status,'error');assert.equal(result.errors,1);
  assert.throws(()=>aggregateScenario(suite,'missing',trials),/Unknown/);assert.throws(()=>aggregateScenario(suite,'safe-response',Array(21).fill(pass)),/More/);
  assert.equal(combinedStatus([result,{...result,status:'failed'}]),'error');assert.throws(()=>combinedStatus([]),/No scenario/);
});
test('observed metrics are bounded, aggregated and never manufactured for absent measurements',()=>{
  const suite=evalSuite({trials:{count:20,passRate:1,confidenceMethod:'wilson'}});
  const trials:TrialResult[]=Array.from({length:20},(_,i)=>({status:'passed',latencyMs:i+1,costUsd:0.1,totalTokens:10}));
  const result=aggregateScenario(suite,'safe-response',trials);assert.deepEqual(result.metrics,{p95LatencyMs:19,avgCostUsd:trials.reduce((n,t)=>n+t.costUsd!,0)/20,totalTokens:200});
  delete trials[0]!.latencyMs;assert.equal(aggregateScenario(suite,'safe-response',trials).metrics!.p95LatencyMs,undefined);
  trials[0]!.totalTokens=-1;assert.throws(()=>aggregateScenario(suite,'safe-response',trials),/Invalid observed/);
});
