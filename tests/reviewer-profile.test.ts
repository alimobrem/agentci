import {readFileSync} from 'node:fs';
import test from 'node:test';import assert from 'node:assert/strict';
import {validateReviewerProfile,bindReviewerProfile,type ReviewerProfile} from '../packages/reviewers/profile.ts';
const admission=JSON.parse(readFileSync(new URL('../specs/api/fixtures/review-admission.json',import.meta.url),'utf8'));
const model=JSON.parse(readFileSync(new URL('../specs/api/fixtures/model-request.json',import.meta.url),'utf8'));
const fixture=():ReviewerProfile=>({schemaVersion:'v1alpha1',id:'security-review',mode:'synthetic',budget:{id:'abcdefab-1111-4111-8111-111111111111',limitUsdMicros:10000},timeoutMs:300000,differentProvider:false,selection:[{kind:'source',side:'head',path:'src/main.ts'}],reviewers:[{role:'security',policyVersion:'v1',provider:model.provider,model:model.model,parameters:model.parameters,policy:{maxAttempts:2,baseDelayMs:100,maxDelayMs:1000},responseSchema:model.responseSchema,providerExtensions:model.providerExtensions}]});
test('profile binds immutable configuration, shared budget and fixed per-role retry identities',()=>{
 const input=fixture(),{profile,revision}=validateReviewerProfile(input),request={...admission,profile:{id:profile.id,revision}};
 const first=bindReviewerProfile(request,profile,1700000000000),retry=bindReviewerProfile(request,JSON.parse(JSON.stringify(profile)),1700000000000);
 assert.deepEqual(retry,first);assert.equal(first.deadlineAt,1700000300000);assert.equal(first.roles[0]!.config.policy.deadlineAt,first.deadlineAt);
 const other=bindReviewerProfile({...request,id:'22222222-2222-4222-8222-222222222222'},profile,1700000000000);
 assert.notEqual(other.roles[0]!.requestId,first.roles[0]!.requestId);assert.deepEqual(other.profile.budget,first.profile.budget);
 input.selection[0]!.path='changed';assert.equal(profile.selection[0]!.path,'src/main.ts');
 for(const change of [{timeoutMs:1000},{differentProvider:true},{budget:{...profile.budget,limitUsdMicros:1}},{selection:[{kind:'source',side:'base',path:'src/main.ts'}]}])assert.throws(()=>bindReviewerProfile(request,{...profile,...change},1700000000000),/invalid-reviewer-profile/);
 assert.throws(()=>bindReviewerProfile({...request,mode:'live'},profile,1700000000000));
 assert.throws(()=>bindReviewerProfile(request,profile,Number.MAX_SAFE_INTEGER));
});
test('profile rejects commands, mutable deadlines, invalid scopes and duplicate roles before dispatch',()=>{
 const p=fixture();
 for(const change of [{command:['sh']},{credentials:'private'},{timeoutMs:0},{reviewers:[p.reviewers[0],p.reviewers[0]]},{reviewers:[{...p.reviewers[0],policy:{...p.reviewers[0]!.policy,deadlineAt:1}}]},{budget:{...p.budget,id:'new-budget'}},{selection:[{kind:'source',side:'head',path:'../secret'}]},{selection:[p.selection[0],p.selection[0]]},{reviewers:[{...p.reviewers[0],role:'unknown'}]}])assert.throws(()=>validateReviewerProfile({...p,...change}),/^Error: invalid-reviewer-profile$/);
 const throwing={...p};Object.defineProperty(throwing,'selection',{enumerable:true,get(){throw Error('private credential detail');}});assert.throws(()=>validateReviewerProfile(throwing),/^Error: invalid-reviewer-profile$/);
 const upper={...p,budget:{...p.budget,id:p.budget.id.toUpperCase()}};assert.equal(validateReviewerProfile(upper).revision,validateReviewerProfile(p).revision);
});
