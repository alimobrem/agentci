import {readFileSync} from 'node:fs';
import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {canonical,digest} from '../packages/review/engine.ts';
import {validateReviewAdmission,validateReviewAdmissionApproval,type ReviewAdmissionRequest} from '../packages/reviewers/admission.ts';
const fixture:ReviewAdmissionRequest=JSON.parse(readFileSync(new URL('../specs/api/fixtures/review-admission.json',import.meta.url),'utf8'));
const request=():ReviewAdmissionRequest=>({...structuredClone(fixture),id:randomUUID(),subject:{...fixture.subject,organizationId:randomUUID()}});
test('review admission binds exact scoped subject, immutable profile and execution mode',()=>{
 const input=request(),valid=validateReviewAdmission(input);assert.deepEqual(valid,input);
 const uppercase={...input,id:input.id.toUpperCase(),subject:{...input.subject,organizationId:input.subject.organizationId.toUpperCase()}};
 assert.deepEqual(validateReviewAdmission(uppercase),input);
 for(const value of [{...input,credentials:'secret'},{...input,command:['sh']},{...input,id:'bad'},{...input,mode:'auto'},{...input,profile:{...input.profile,revision:'latest'}},{...input,profile:{...input.profile,id:'https://provider.invalid'}},{...input,subject:{...input.subject,baseSha:input.subject.headSha}},{...input,subject:{...input.subject,pullRequest:1.2}},{...input,subject:{...input.subject,repository:'../owner/repo'}}])assert.throws(()=>validateReviewAdmission(value),/^Error: invalid-review-admission$/);
 valid.profile.id='different';assert.equal(input.profile.id,'security-review','validation must not retain caller-owned mutable data');
});
test('admission approval cannot authorize different source, profile, request or synthetic/live mode',()=>{
 const input=request(),approval={requestDigest:digest(canonical(input)),policyDigest:digest('operator-policy'),profileRevision:input.profile.revision,mode:input.mode};
 assert.deepEqual(validateReviewAdmissionApproval(approval,input),approval);
 const throwing={...approval};Object.defineProperty(throwing,'policyDigest',{enumerable:true,get(){throw Error('private authorization detail');}});
 assert.throws(()=>validateReviewAdmissionApproval(throwing,input),/^Error: invalid-review-admission$/);
 for(const change of [{requestDigest:digest('wrong')},{policyDigest:'latest'},{profileRevision:digest('other')},{mode:'live'},{extra:true}])assert.throws(()=>validateReviewAdmissionApproval({...approval,...change},input));
 for(const change of [{id:randomUUID()},{subject:{...input.subject,headSha:'c'.repeat(40)}},{profile:{...input.profile,revision:digest('changed')}}])assert.throws(()=>validateReviewAdmissionApproval(approval,{...input,...change}));
});
