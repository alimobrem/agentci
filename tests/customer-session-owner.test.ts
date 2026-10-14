import test from 'node:test';import assert from 'node:assert/strict';
// @ts-ignore Trusted bounded customer owner.
import {customerSessionOwner} from '../scripts/lib/customer-session-owner.mjs';
const proof=()=>({assertionContainers:{ownedAssertionContainers:0},controllerProcesses:{ownedProcessesRemaining:0},evaluator:{ownedEvaluatorContainers:0},temporalConnection:null,evaluatorRole:null,databasePool:null});
const fixture=(id:string,namespace:string,close:()=>Promise<unknown>)=>({scope:{organizationId:id,repository:'alimobrem/agentci-onboarding-demo'},namespace,reservations:[],diagnosticsSnapshot:()=>({events:[]}),close,quiesce:async()=>{},forceQuiesce:()=>{}});
test('both scopes are attempted on failure, successful cleanup is retained, database removal waits for both proofs',async()=>{
 const owner=customerSessionOwner(),calls:string[]=[];let fail=true;
 owner.register('primary',fixture('primary','default',async()=>{calls.push('primary');return proof();}));
 owner.register('staged-cancellation',fixture('staged','isolated',async()=>{calls.push('staged');if(fail)throw Error('failure');return proof();}));
 const name='customer_staged_'+'a'.repeat(32);owner.registerDatabase({name,close:async()=>{calls.push('database');return {name,result:'passed',ownedDatabases:0};}});
 await assert.rejects(owner.close({}),/cleanup recovery/);assert.deepEqual(calls,['staged','primary']);assert.ok(owner.snapshot()[0].cleanup);assert.equal(owner.snapshot()[1].cleanup,undefined);
 fail=false;const result=await owner.close({});assert.deepEqual(calls,['staged','primary','staged','database']);assert.equal(result.sessions.length,2);assert.equal(result.isolatedDatabases[0].ownedDatabases,0);assert.equal(result.assertionContainers.ownedAssertionContainers,0);
});
test('same organization, namespace, wrong repository and a third session cannot widen the owner',()=>{
 const make=()=>{const owner=customerSessionOwner();owner.register('primary',fixture('primary','default',async()=>proof()));return owner;};
 for(const candidate of [fixture('primary','isolated',async()=>proof()),fixture('isolated','default',async()=>proof()),{...fixture('isolated','isolated',async()=>proof()),scope:{organizationId:'isolated',repository:'alimobrem/agentci'}}])assert.throws(()=>make().register('staged-cancellation',candidate));
 const owner=make();owner.register('staged-cancellation',fixture('isolated','isolated',async()=>proof()));assert.throws(()=>owner.register('third',fixture('third','third',async()=>proof())));
});
test('force quiescence reaches both sessions even if one closure throws',()=>{const owner=customerSessionOwner(),calls:string[]=[];for(const [label,id] of [['primary','one'],['staged-cancellation','two']] as const)owner.register(label,{...fixture(id,id,async()=>proof()),forceQuiesce:()=>{calls.push(id);if(id==='one')throw Error();}});owner.forceQuiesce();assert.deepEqual(calls,['one','two']);});
test('concurrent close joins one cleanup, and abort fences isolated database removal',async()=>{
 const owner=customerSessionOwner(),controller=new AbortController();let calls=0,removed=0,release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
 owner.register('primary',fixture('primary','default',async()=>{calls++;await gate;controller.abort();return proof();}));
 const name='customer_staged_'+'b'.repeat(32);owner.registerDatabase({name,close:async()=>{removed++;return {name,result:'passed',ownedDatabases:0};}});
 const first=owner.close({signal:controller.signal}),second=owner.close({signal:controller.signal});assert.equal(first,second);release();await assert.rejects(first,/aborted/);assert.equal(calls,1);assert.equal(removed,0);assert.deepEqual(owner.databaseSnapshot(),[{name,cleanup:null}]);
 const cleaned=await owner.close({});assert.equal(calls,1);assert.equal(removed,1);assert.equal(cleaned.isolatedDatabases[0].ownedDatabases,0);
});
