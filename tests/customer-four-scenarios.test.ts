import test from 'node:test';import assert from 'node:assert/strict';import {canonical} from '../packages/review/engine.ts';
// @ts-ignore Trusted customer orchestration.
import {runCustomerFourScenarios} from '../scripts/lib/customer-four-scenarios.mjs';
function fixture(organizationId:string,namespace:string){
 const counts=new Map<string,number>(),events:string[]=[],receipt={value:{outcome:'reproduced'}};
 const session:any={scope:{organizationId,repository:'alimobrem/agentci-onboarding-demo'},namespace,production:{canonical},initialize:async()=>events.push('initialize'),review:async(kind:string)=>({kind,admission:{subject:{organizationId,repository:'alimobrem/agentci-onboarding-demo',pullRequest:kind==='fixed'?5:4,baseSha:'base',headSha:kind==='fixed'?'fixed':'seeded'}}}),unsupported:async()=>({approval:'none'}),approve:async(r:any)=>r,
  reserve:async(r:any)=>{const count=(counts.get(r.kind)??0)+1;if(count>3)throw Error('attempt-limit');counts.set(r.kind,count);events.push('reserve:'+r.kind+':'+count);return {kind:r.kind,count};},startConsumer:async()=>{},settled:async(_r:any,ref:any)=>ref.kind==='fixed'&&ref.count===2?{receipt:null,nonExecution:{},settlement:{kind:'never-staged'}}:{receipt:ref.kind==='seeded'?receipt:{value:{outcome:'not-reproduced'}},nonExecution:null},observe:async()=>({}),physical:async()=>({fixtureOnly:true}),active:async()=>({fixtureOnly:true}),killAndRecover:async()=>({checkpoint:{}}),verifyCheckpoint:async(r:any)=>r,
  client:{cancelReproduction:async()=>{},reproductionStatus:async()=>({receipt})}};
 return {session,counts,events};
}
test('staged cancellation uses a different organization and namespace while the primary stays within three fixed attempts',async()=>{
 const primary=fixture('primary','default'),staged=fixture('isolated','staged');let created=0;
 const evidence=await runCustomerFourScenarios(primary.session,async()=>{},{createStagedSession:async()=>{created++;assert.equal(primary.counts.get('fixed'),3);return staged.session;}});
 assert.equal(created,1);assert.equal(primary.counts.get('fixed'),3);assert.equal(staged.counts.get('fixed'),1);assert.equal(staged.events[0],'initialize');assert.equal(evidence.scenarios.length,4);assert.equal(evidence.scenarios[3].stagedCancellation.scope.organizationId,'isolated');assert.equal(evidence.originalConfirmedReceiptImmutable,true);
});
test('a new admission sharing the organization or Temporal namespace cannot execute staged cancellation',async()=>{
 for(const [organizationId,namespace] of [['primary','isolated'],['isolated','default']] as const){const primary=fixture('primary','default'),staged=fixture(organizationId,namespace);await assert.rejects(runCustomerFourScenarios(primary.session,async()=>{},{createStagedSession:async()=>staged.session}),/Distinct customer staged scope/);assert.deepEqual(staged.events,[]);}
});
test('changed fixed fixture is rejected before staged approval or reservation',async()=>{
 const primary=fixture('primary','default'),staged=fixture('isolated','staged'),read=staged.session.review;staged.session.review=async(kind:string)=>{const r=await read(kind);r.admission.subject.headSha='changed';return r;};
 await assert.rejects(runCustomerFourScenarios(primary.session,async()=>{},{createStagedSession:async()=>staged.session}),/changed approved fixed fixture/);assert.equal(staged.counts.size,0);
});
