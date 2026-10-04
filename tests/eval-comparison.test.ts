import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {evalSuite} from './fixtures/evals.ts';
import {executeSuite} from '../packages/evals/execution.ts';
import {createEvalComparison,validateEvalComparison,comparisonRecord,validateComparisonRecord,type ComparisonInput,type ComparisonUnit} from '../packages/evals/comparison.ts';
const base={sha:'a'.repeat(40),files:{'check.mjs':'base'}},head={sha:'b'.repeat(40),files:{'check.mjs':'head'}},policy={image:'sha256:'+'f'.repeat(64)};
async function fixture(headStatus:'passed'|'failed'|'error'='passed'):Promise<ComparisonInput>{
 const suite=evalSuite({trials:{count:2,passRate:1,confidenceMethod:'wilson'}});
 const units:ComparisonUnit[]=[];
 for(const side of ['base','head'] as const){
  const id=randomUUID(),snapshot=side==='base'?base:head;
  const result=await executeSuite('example/repo',snapshot,suite,policy,{runId:id,assertionSnapshot:base},async()=>({sourceSha:snapshot.sha,image:policy.image,status:side==='head'&&headStatus==='error'?'error':'completed',exitCode:side==='head'&&headStatus!=='passed'?1:0}));
  units.push({id,suite:suite.metadata.id,revision:result.revision,side,assertionSide:'base',trials:2,passRate:1,maxCriticalFailures:0,scenarioIds:['safe-response'],runnerImage:policy.image,status:'completed',result});
 }
 return {id:randomUUID(),reviewId:randomUUID(),attemptId:randomUUID(),organizationId:randomUUID(),subject:{repository:'example/repo',pullRequest:1,baseSha:base.sha,headSha:head.sha},cancelRequested:false,units,suiteChanges:[],coverageGaps:[],selectionGaps:[]};
}
test('comparison evidence derives exact-source regressions and rejects forged summaries/digests',async()=>{
 const value=createEvalComparison(await fixture('failed'));assert.equal(value.summary.outcome,'failed');assert.deepEqual(value.summary.comparisons[0]!.regressions,['safe-response']);assert.equal(value.summary.comparisons[0]!.deltas[0]!.passRateDelta,-1);
 assert.deepEqual(validateComparisonRecord(comparisonRecord(value)).comparison,value);
 assert.throws(()=>validateEvalComparison({...value,summary:{...value.summary,outcome:'passed'}}),/contradicts/);
 assert.throws(()=>validateComparisonRecord({...comparisonRecord(value),digest:'sha256:'+'0'.repeat(64)}),/digest/);
 assert.throws(()=>validateComparisonRecord({...comparisonRecord(value),id:randomUUID()}),/identity/);
 assert.throws(()=>validateEvalComparison({...value,inputs:{secret:'must never be serialized'}}),/contract/);
 const head=value.units.find(u=>u.side==='head')!,run=head.result!;
 assert.throws(()=>createEvalComparison({...value,units:[value.units[0]!,{...head,result:{...run,status:'passed',scenarios:run.scenarios.map(s=>({...s,status:'passed'}))}}]}),/threshold/);
});
test('pending, cancelled, incomplete pair and missing coverage never pass',async()=>{
 const input=await fixture();assert.equal(createEvalComparison(input).summary.outcome,'passed');
 for(const field of ['coverageGaps','selectionGaps'] as const)assert.equal(createEvalComparison({...input,[field]:['missing']}).summary.outcome,'insufficient');
 assert.equal(createEvalComparison({...input,cancelRequested:true}).summary.outcome,'insufficient');
 const {result,...planned}=input.units[1]!;
 assert.equal(createEvalComparison({...input,units:[input.units[0]!,{...planned,status:'queued'}]}).summary.outcome,'pending');
 assert.equal(createEvalComparison({...input,units:[input.units[0]!,{...planned,status:'running'}]}).summary.state,'running');
 assert.equal(createEvalComparison({...input,units:[input.units[0]!,{...planned,status:'cancelled'}]}).summary.outcome,'insufficient');
 assert.deepEqual(createEvalComparison({...input,units:[input.units[0]!]}).summary.executionGaps,['missing-head-unit:behavior']);
 assert.equal(createEvalComparison({...input,units:[]}).summary.outcome,'no-evals');
 assert.equal(createEvalComparison(await fixture('error')).summary.outcome,'error');
 assert.throws(()=>createEvalComparison({...input,units:[input.units[0]!,{...planned,status:'completed'}]}),/retained result/);
});
test('unit results and planned pairs cannot substitute source, assertion, model or runner provenance',async()=>{
 const input=await fixture(),unit=input.units[1]!,run=unit.result!;
 for(const result of [{...run,id:randomUUID()},{...run,subject:{...run.subject,repository:'wrong/repo'}},{...run,subject:{...run.subject,gitSha:base.sha}},{...run,subject:{...run.subject,assertionGitSha:head.sha}},{...run,model:'unplanned'},{...run,runnerImage:'sha256:'+'1'.repeat(64)},{...run,revision:'sha256:'+'1'.repeat(64)}])assert.throws(()=>createEvalComparison({...input,units:[input.units[0]!,{...unit,result}]}),/provenance/);
 assert.throws(()=>createEvalComparison({...input,units:[unit,unit]}),/Duplicate/);
 const {result,...planned}=unit;
 assert.throws(()=>createEvalComparison({...input,units:[input.units[0]!,{...planned,status:'queued',revision:'sha256:'+'1'.repeat(64)}]}),/plan provenance/);
 assert.throws(()=>createEvalComparison({...input,units:[{...planned,side:'head',assertionSide:'head',status:'queued'}]}),/added suite/);
 const added=createEvalComparison({...input,units:[{...planned,side:'head',assertionSide:'head',status:'queued'}],suiteChanges:[{suite:unit.suite,kind:'added',headRevision:'sha256:'+'1'.repeat(64),addedScenarios:['safe-response'],removedScenarios:[]}]});assert.equal(added.summary.comparisons.length,0);assert.equal(added.summary.outcome,'pending');
 const missing=createEvalComparison({...input,units:[],suiteChanges:added.suiteChanges});assert.equal(missing.summary.outcome,'insufficient');assert.deepEqual(missing.summary.executionGaps,['missing-suite-unit:behavior']);
});
