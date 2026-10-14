import test from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {randomUUID} from 'node:crypto';
// @ts-expect-error Operational helper.
import {customerContainerInspectionFormat,parseCustomerInspection,validateCustomerRunnerInspection} from '../../scripts/lib/customer-evaluator-container.mjs';
// @ts-expect-error Operational helper.
import {CUSTOMER_POSTGRES_IMAGE} from '../../scripts/lib/customer-ci-database.mjs';
test('actual Docker inspection projects large metadata and environment names without values; foreign runner proof fails',()=>{
 const owner=randomUUID(),name='agentci-inspection-'+owner,image=CUSTOMER_POSTGRES_IMAGE,sentinel='INSPECTION-VALUE-SENTINEL';let id:string|undefined;
 const command=(args:string[],maxBuffer=65536)=>execFileSync('docker',args,{env:{PATH:process.env.PATH},encoding:'utf8',timeout:15000,maxBuffer,stdio:['ignore','pipe','pipe']});
 try{
  id=command(['create','--name',name,'--label','agentci.customer.owner='+owner,'--label','irrelevant.large='+'x'.repeat(20000),'--env','EXAMPLE_INSPECTION_VALUE='+sentinel,image]).trim();assert.match(id,/^[a-f0-9]{64}$/);
  assert.throws(()=>command(['inspect',id!],8192),(error:any)=>error.code==='ENOBUFS','Original full inspection exceeds the former 8192-byte cap');
  const output=command(['inspect',id,'--format',customerContainerInspectionFormat]);assert.ok(Buffer.byteLength(output)<8192);assert.ok(!output.includes(sentinel));assert.ok(!output.includes('irrelevant.large'));const info=parseCustomerInspection(output);assert.equal(info.Id,id);assert.equal(info.Name,'/'+name);assert.equal(info.Config.Image,image);assert.equal(info.Config.Labels['agentci.customer.owner'],owner);assert.ok(info.Config.Env.includes('EXAMPLE_INSPECTION_VALUE'));
  assert.throws(()=>validateCustomerRunnerInspection(info,{unitId:'foreign-unit',leaseToken:'foreign-lease',image}),/mismatch/);
 }finally{if(id){const owned=parseCustomerInspection(command(['inspect',id,'--format',customerContainerInspectionFormat]));assert.equal(owned.Id,id);assert.equal(owned.Name,'/'+name);assert.equal(owned.Config.Image,image);assert.equal(owned.Config.Labels['agentci.customer.owner'],owner);command(['rm','--force','--volumes',id]);assert.equal(command(['ps','--all','--quiet','--filter','name=^/'+name+'$']).trim(),'');}}
});
