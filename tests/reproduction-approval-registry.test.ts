import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {canonical,digest} from '../packages/review/engine.ts';
import {createReproductionApprovalRegistry} from '../packages/findings/approval-registry.ts';
import {createFindingTransitions,type FindingReceipt} from '../packages/findings/lifecycle.ts';
import {compileFindingReproduction} from '../packages/findings/reproduction.ts';
import {reproductionFixture} from './fixtures/reproduction.ts';
const entry=(f:ReturnType<typeof reproductionFixture>)=>({current:f.initial,plan:f.plan,base:f.base,head:f.head});
const request=(f:ReturnType<typeof reproductionFixture>)=>({subject:f.initial.subject,expectedVersion:1,operationId:randomUUID(),approvalId:f.plan.id,approvalDigest:digest(canonical(f.plan))});
test('approval selection binds current finding and immutable queued successor without mutating either',async()=>{
 const f=reproductionFixture(),registry=await createReproductionApprovalRegistry([entry(f)]),r=request(f),selected=registry.select(r,f.initial);
 assert.deepEqual(selected.plan,f.plan);assert.equal(selected.plan.finding.version,2);assert.equal(selected.plan.finding.state,'reproduction-pending');assert.equal(f.initial.state,'deduplicated');
 assert.equal(selected.requestDigest,digest(canonical(r)));assert.equal(selected.currentDigest,digest(canonical(f.initial)));
 selected.plan.approval.reason='mutated';selected.request.subject.repository='other/repo';assert.deepEqual(registry.select(r,f.initial).plan,f.plan);
 const changedOperation={...r,operationId:randomUUID()};assert.notEqual(registry.select(changedOperation,f.initial).requestDigest,selected.requestDigest,'selection does not pretend to reserve/deduplicate operations');
});
test('registry clones before asynchronous validation and never consults mutated operator inputs',async()=>{
 const f=reproductionFixture(),original=structuredClone(f),pending=createReproductionApprovalRegistry([entry(f)]);
 f.plan.runner.image=`sha256:${'e'.repeat(64)}`;f.plan.approval.reason='changed';f.head.files['app.mjs']='changed';
 assert.deepEqual((await pending).select(request(original),original.initial).plan,original.plan);
});
test('selector rejects caller execution controls, stale identity, wrong digest and malformed bounds',async()=>{
 const f=reproductionFixture(),registry=await createReproductionApprovalRegistry([entry(f)]),r=request(f);
 for(const bad of [null,[],{...r,command:['sh']},{...r,image:'x'},{...r,budget:1},{...r,expectedVersion:2},{...r,expectedVersion:0},{...r,expectedVersion:10000},{...r,operationId:'bad'},{...r,approvalId:randomUUID()},{...r,approvalDigest:digest('wrong')},{...r,subject:{...r.subject,repository:'other/repo'}},{...r,subject:{...r.subject,extra:true}}])assert.throws(()=>registry.select(bad,f.initial),/invalid-reproduction-approval/);
 assert.throws(()=>registry.select(r,{...f.initial,claim:'Changed assertion'}),/invalid-reproduction-approval/);
 assert.throws(()=>registry.select(r,f.finding),/invalid-reproduction-approval/);
});
test('registry rejects duplicate, altered, invalid lifecycle, source and resource approvals',async()=>{
 const f=reproductionFixture();await assert.rejects(createReproductionApprovalRegistry([entry(f),entry(f)]),/invalid-reproduction-approval/);
 for(const mutate of [(e:any)=>{e.plan.runner.image=`sha256:${'d'.repeat(64)}`;},(e:any)=>{e.plan.finding.version=3;},(e:any)=>{e.current.state='confirmed';},(e:any)=>{e.head.files['app.mjs']='wrong';},(e:any)=>{e.plan.limits.maxTrials=0;},(e:any)=>{e.extra=true;}]){
  const e=structuredClone(entry(f));mutate(e);await assert.rejects(createReproductionApprovalRegistry([e]),/invalid-reproduction-approval/);
 }
 await assert.rejects(createReproductionApprovalRegistry(Array.from({length:33},()=>entry(f))),/invalid-reproduction-approval/);
 await assert.rejects(createReproductionApprovalRegistry(null as never),/invalid-reproduction-approval/);
});

function receiptFor(f:ReturnType<typeof reproductionFixture>,outcome:'error'|'reproduced'):FindingReceipt{
 return {findingId:f.finding.id,subjectDigest:digest(canonical(f.finding.subject)),assertionDigest:f.plan.assertionDigest,evidenceDigest:digest('retained fixture observation '+outcome),actor:'reproduction',outcome,reason:'Retained fixture result'};
}
test('unconfirmed reproduction can select a newly approved retry without reusing prior authority',async()=>{
 const f=reproductionFixture(),transition=createFindingTransitions(async()=>receiptFor(f,'error'));
 const current=(await transition(f.finding,{type:'reproduce',receiptId:randomUUID()},2)).finding;
 assert.equal(current.state,'unconfirmed');assert.equal(current.version,3);
 const queued=(await transition(current,{type:'queue'},3)).finding;
 const approval={...f.approval,id:randomUUID(),findingDigest:digest(canonical(queued))};
 const plan=compileFindingReproduction(queued,approval,f.base,f.head,f.policy,f.limits);
 const registry=await createReproductionApprovalRegistry([{current,plan,base:f.base,head:f.head}]);
 const selector={...request(f),expectedVersion:3,approvalId:plan.id,approvalDigest:digest(canonical(plan))};
 const selected=registry.select(selector,current);
 assert.equal(selected.plan.finding.version,4);assert.equal(selected.plan.finding.state,'reproduction-pending');assert.equal(selected.plan.finding.disposition,null);
 assert.equal(current.disposition?.outcome,'error','selection preserves earlier evidence');
 assert.throws(()=>registry.select({...selector,approvalId:f.plan.id,approvalDigest:digest(canonical(f.plan))},current),/invalid-reproduction-approval/);
 assert.throws(()=>registry.select({...selector,expectedVersion:2},current),/invalid-reproduction-approval/);
});
test('version 9998 preserves queue and terminal headroom; version 9999 cannot begin reproduction',async()=>{
 const f=reproductionFixture(),transition=createFindingTransitions(async()=>receiptFor(f,'reproduced'));
 const current={...f.initial,version:9998},queued=(await transition(current,{type:'queue'},9998)).finding;
 const plan=compileFindingReproduction(queued,{...f.approval,findingDigest:digest(canonical(queued))},f.base,f.head,f.policy,f.limits);
 const registry=await createReproductionApprovalRegistry([{current,plan,base:f.base,head:f.head}]);
 const selected=registry.select({...request(f),expectedVersion:9998,approvalDigest:digest(canonical(plan))},current);
 assert.equal(selected.plan.finding.version,9999);
 const terminal=(await transition(selected.plan.finding,{type:'reproduce',receiptId:randomUUID()},9999)).finding;
 assert.equal(terminal.version,10000);assert.equal(terminal.state,'confirmed');
 const tooLate={...f.initial,version:9999},lateQueue=(await transition(tooLate,{type:'queue'},9999)).finding;
 const latePlan=compileFindingReproduction(lateQueue,{...f.approval,findingDigest:digest(canonical(lateQueue))},f.base,f.head,f.policy,f.limits);
 await assert.rejects(createReproductionApprovalRegistry([{current:tooLate,plan:latePlan,base:f.base,head:f.head}]),/invalid-reproduction-approval/);
 assert.throws(()=>registry.select({...request(f),expectedVersion:9999,approvalDigest:digest(canonical(plan))},tooLate),/invalid-reproduction-approval/);
});
