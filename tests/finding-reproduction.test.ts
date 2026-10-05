import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {reproductionFixture} from './fixtures/reproduction.ts';
import {compileFindingReproduction,reproductionReceipt} from '../packages/findings/reproduction.ts';
import {executeSuite} from '../packages/evals/execution.ts';
import type {EvalUnit} from '../packages/storage/evals.ts';
import {digest,canonical} from '../packages/review/engine.ts';
async function result(status:'passed'|'failed'|'error'|'skipped',options:{crash?:boolean;missing?:boolean}={}){
 const f=reproductionFixture(),id=randomUUID();
 const run=await executeSuite(f.finding.subject.repository,f.head,f.approval.suite,f.policy,{assertionSnapshot:f.base,runId:id},async snapshot=>({sourceSha:snapshot.sha,image:f.policy.image,status:options.crash?'error':'completed',exitCode:options.crash?null:status==='failed'||status==='error'?1:0,...(options.missing?{}:{report:JSON.stringify({schemaVersion:'v1alpha1',results:[{scenario:'namespace-bypass',status}]})})}));
 const unit:EvalUnit={id,jobId:randomUUID(),definition:f.plan.definition,inputs:{base:{snapshot:f.base,omitted:[]},head:{snapshot:f.head,omitted:[]}},status:'completed',cancelRequested:false,result:run};return {...f,unit};
}
test('reproduction approval binds exact finding version, evidence, assertion, resources and structured report',()=>{
 const f=reproductionFixture();
 for(const approval of [{...f.approval,findingDigest:digest('wrong')},{...f.approval,scenarioId:'missing'},{...f.approval,suite:{...f.approval.suite,spec:{...f.approval.suite.spec,runner:{adapter:'command' as const,command:['true'],timeoutMs:1000}}}},{...f.approval,suite:{...f.approval.suite,spec:{...f.approval.suite.spec,runner:{...f.approval.suite.spec.runner,harness:['app.mjs']}}}}])assert.throws(()=>compileFindingReproduction(f.finding,approval,f.base,f.head,f.policy,f.limits));
 assert.throws(()=>compileFindingReproduction(f.initial,f.approval,f.base,f.head,f.policy,f.limits));
 assert.throws(()=>compileFindingReproduction(f.finding,f.approval,f.base,{...f.head,files:{...f.head.files,'app.mjs':'changed'}},f.policy,f.limits));
 assert.throws(()=>compileFindingReproduction(f.finding,f.approval,f.base,f.head,{image:'mutable:latest'},f.limits));
 assert.throws(()=>compileFindingReproduction(f.finding,f.approval,f.base,f.head,f.policy,{...f.limits,maxTrials:0}));
 assert.throws(()=>compileFindingReproduction(f.finding,f.approval,f.base,f.head,f.policy,{...f.limits,maxTimeoutMs:1000}));
});
test('structured finding assertion confirms only its authorized complete outcome',async()=>{
 const yes=await result('passed');assert.equal(reproductionReceipt(yes.plan,yes.unit).outcome,'reproduced');
 const no=await result('failed');assert.equal(reproductionReceipt(no.plan,no.unit).outcome,'not-reproduced');
 const approval={...no.approval,reproducedStatus:'failed' as const};const plan=compileFindingReproduction(no.finding,approval,no.base,no.head,no.policy,no.limits);assert.equal(reproductionReceipt(plan,no.unit).outcome,'reproduced');
 for(const status of ['error','skipped'] as const){const f=await result(status);assert.equal(reproductionReceipt(f.plan,f.unit).outcome,'error');}
 for(const options of [{crash:true},{missing:true}]){const f=await result('passed',options);assert.equal(reproductionReceipt(f.plan,f.unit).outcome,'error');}
});
test('receipt rejects substituted runs and pending work; cancellation retains explicit nonconfirmation',async()=>{
 const f=await result('passed');
 for(const change of [{id:randomUUID()},{runnerImage:`sha256:${'2'.repeat(64)}`},{revision:digest('wrong')},{subject:{...f.unit.result!.subject,gitSha:'c'.repeat(40)}},{subject:{...f.unit.result!.subject,inputDigest:digest('wrong')}}])assert.throws(()=>reproductionReceipt(f.plan,{...f.unit,result:{...f.unit.result!,...change}}));
 assert.throws(()=>reproductionReceipt(f.plan,{...f.unit,status:'pending',result:undefined}));
 const cancelled={...f.unit,status:'cancelled',cancelRequested:true,result:undefined};const receipt=reproductionReceipt(f.plan,cancelled);assert.equal(receipt.outcome,'error');assert.match(receipt.reason,/cancelled/);
 assert.notEqual(receipt.evidenceDigest,reproductionReceipt(f.plan,f.unit).evidenceDigest);
 const tampered=structuredClone(f.plan);tampered.approval.findingDigest=digest(canonical({...f.finding,version:3}));assert.throws(()=>reproductionReceipt(tampered,f.unit));
});
