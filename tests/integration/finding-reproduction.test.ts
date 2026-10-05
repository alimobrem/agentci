import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {reproductionFixture} from '../fixtures/reproduction.ts';
import {reproductionReceipt} from '../../packages/findings/reproduction.ts';
import {executeSuite} from '../../packages/evals/execution.ts';
import {containerEngine} from '../../packages/evals/runner.ts';
import type {EvalUnit} from '../../packages/storage/evals.ts';
const image=process.env.AGENTCI_TEST_RUNNER_IMAGE;
if(!image)throw Error('Finding reproduction integration requires AGENTCI_TEST_RUNNER_IMAGE; never silently skip');
test('real isolated reproduction confirms the fixture defect but rejects negative and crashed assertions',{timeout:90000},async()=>{
 for(const [options,outcome] of [[{},'reproduced'],[{source:"export function allowed(ns){return ns==='safe';}"},'not-reproduced'],[{script:"throw Error('fixture crash')"},'error']] as const){
  const f=reproductionFixture(image,options),id=randomUUID(),ownership={unitId:id,leaseToken:randomUUID()};
  const run=await executeSuite(f.finding.subject.repository,f.head,f.approval.suite,f.policy,{assertionSnapshot:f.base,runId:id,ownership});
  const unit:EvalUnit={id,jobId:randomUUID(),definition:f.plan.definition,inputs:{base:{snapshot:f.base,omitted:[]},head:{snapshot:f.head,omitted:[]}},status:'completed',cancelRequested:false,result:run};
  assert.equal(reproductionReceipt(f.plan,unit).outcome,outcome);
  assert.equal(execFileSync(containerEngine(),['ps','-aq','--filter','label=agentci.purpose=eval-runner','--filter',`label=agentci.eval.unit=${id}`],{encoding:'utf8'}).trim(),'');
 }
});
