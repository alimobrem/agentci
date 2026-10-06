import test from 'node:test';import assert from 'node:assert/strict';import {reproductionWorkflowId} from '../packages/findings/workflow-identity.ts';
const scope={organizationId:'11111111-1111-4111-8111-111111111111',repository:'owner/repo'},plan='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',unit='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
test('workflow identities are bounded, stable, scoped and role-separated',()=>{
 const parent=reproductionWorkflowId(scope,plan);assert.equal(parent,reproductionWorkflowId(scope,plan.toUpperCase()));
 const identities=[parent,reproductionWorkflowId(scope,plan,'unit',unit),reproductionWorkflowId(scope,plan,'cleanup',unit),reproductionWorkflowId({...scope,repository:'owner/other'},plan),reproductionWorkflowId({...scope,organizationId:'22222222-2222-4222-8222-222222222222'},plan),reproductionWorkflowId(scope,unit)];
 assert.equal(new Set(identities).size,identities.length);
 for(const kind of ['unit','cleanup'] as const){assert.notEqual(reproductionWorkflowId(scope,plan,kind,unit),reproductionWorkflowId({...scope,repository:'owner/other'},plan,kind,unit));assert.notEqual(reproductionWorkflowId(scope,plan,kind,unit),reproductionWorkflowId({...scope,organizationId:'22222222-2222-4222-8222-222222222222'},plan,kind,unit));}
 for(const id of identities)assert.ok(id.length<80);
 const long=reproductionWorkflowId({...scope,repository:'a'.repeat(127)+'/'+'b'.repeat(128)},plan);assert.equal(long.length,parent.length);assert.ok(!long.includes('a'.repeat(127)));
 for(const args of [[scope,plan,'parent',unit],[scope,plan,'unit'],[scope,plan,'cleanup','bad'],[{...scope,repository:'a/'.padEnd(257,'a')},plan],[{...scope,repository:'../a/b'},plan],[scope,'invalid'],[scope,plan,'unknown']] as any[])assert.throws(()=>reproductionWorkflowId(...args as Parameters<typeof reproductionWorkflowId>),/invalid-reproduction-workflow-identity/);
});
