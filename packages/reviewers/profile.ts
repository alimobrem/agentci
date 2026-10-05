import {canonical,digest} from '../review/engine.ts';
import {nameUuid} from '../evals/request-id.ts';
import {buildReviewContext} from './context.ts';
import {validateReviewAdmission} from './admission.ts';
import {prepareReviewerRequest,type ReviewerRequestConfig} from './request.ts';
import type {ReviewerSelection} from './snapshot-context.ts';
export interface ReviewerProfile {
 schemaVersion:'v1alpha1';id:string;mode:'synthetic'|'live';
 budget:{id:string;limitUsdMicros:number};timeoutMs:number;differentProvider:boolean;
 selection:ReviewerSelection[];
 reviewers:(Omit<ReviewerRequestConfig,'policy'> & {policy:Omit<ReviewerRequestConfig['policy'],'deadlineAt'>})[];
}
const subject={organizationId:'00000000-0000-4000-8000-000000000001',repository:'validation/profile',pullRequest:1,baseSha:'a'.repeat(40),headSha:'b'.repeat(40)};
const id='00000000-0000-4000-8000-000000000002';
const exact=(v:any,keys:string[])=>v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const fail=():never=>{throw new Error('invalid-reviewer-profile');};
/** Operator-owned configuration only. Validation is not provider registration,
 * authentication, secret filtering, or authority to spend from the named budget.
 * The revision covers the complete normalized profile; retain old revisions.
 */
export function validateReviewerProfile(value:unknown):{profile:ReviewerProfile;revision:string}{
 try{
  const v=value as ReviewerProfile;
  if(!exact(v,['schemaVersion','id','mode','budget','timeoutMs','differentProvider','selection','reviewers'])||v.schemaVersion!=='v1alpha1'||typeof v.id!=='string'||!/^[A-Za-z0-9._-]{1,128}$/.test(v.id)||!['synthetic','live'].includes(v.mode)||typeof v.differentProvider!=='boolean'||!Number.isSafeInteger(v.timeoutMs)||v.timeoutMs<1000||v.timeoutMs>86400000)fail();
  if(!exact(v.budget,['id','limitUsdMicros'])||typeof v.budget.id!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v.budget.id)||!Number.isSafeInteger(v.budget.limitUsdMicros)||v.budget.limitUsdMicros<1)fail();
  if(!Array.isArray(v.selection)||!v.selection.length||v.selection.length>64)fail();
  const documents=v.selection.map(ref=>{if(!exact(ref,['kind','side','path'])||!['source','requirement'].includes(ref.kind))fail();return {...ref,content:'',digest:digest('')};});
  const selection=buildReviewContext(subject,documents).documents.map(({kind,side,path})=>({kind:kind as ReviewerSelection['kind'],side,path}));
  if(!Array.isArray(v.reviewers)||!v.reviewers.length||v.reviewers.length>7)fail();
  const roles=new Set<string>();
  const reviewers=v.reviewers.map(config=>{
   if(!exact(config,['role','policyVersion','provider','model','parameters','policy','responseSchema','providerExtensions'])||!exact(config.policy,['maxAttempts','baseDelayMs','maxDelayMs'])||roles.has(config.role))fail();
   roles.add(config.role);
   const prepared=prepareReviewerRequest(id,{...config,policy:{...config.policy,deadlineAt:1}},subject,documents).request;
   return {role:config.role,policyVersion:config.policyVersion,provider:prepared.provider,model:prepared.model,parameters:prepared.parameters,policy:{maxAttempts:prepared.policy.maxAttempts,baseDelayMs:prepared.policy.baseDelayMs,maxDelayMs:prepared.policy.maxDelayMs},responseSchema:prepared.responseSchema!,providerExtensions:prepared.providerExtensions};
  }).sort((a,b)=>a.role<b.role?-1:a.role>b.role?1:0);
  const profile:ReviewerProfile={schemaVersion:'v1alpha1',id:v.id,mode:v.mode,budget:{id:v.budget.id.toLowerCase(),limitUsdMicros:v.budget.limitUsdMicros},timeoutMs:v.timeoutMs,differentProvider:v.differentProvider,selection,reviewers};
  const encoded=canonical(profile);if(Buffer.byteLength(encoded)>262144)fail();
  return {profile,revision:digest(encoded)};
 }catch{return fail();}
}
/** Use the persisted admission time, never the retry's wall clock. Only IDs and
 * digests belong in workflow history; profiles and source are activity-local.
 */
export function bindReviewerProfile(requestValue:unknown,profileValue:unknown,admittedAtMs:number){
 try{
  const request=validateReviewAdmission(requestValue),{profile,revision}=validateReviewerProfile(profileValue);
  if(request.profile.id!==profile.id||request.profile.revision!==revision||request.mode!==profile.mode||!Number.isSafeInteger(admittedAtMs)||admittedAtMs<1||!Number.isSafeInteger(admittedAtMs+profile.timeoutMs))fail();
  const deadlineAt=admittedAtMs+profile.timeoutMs;
  return {request,profile,revision,deadlineAt,roles:profile.reviewers.map(config=>({requestId:nameUuid(request.id,`agentci:reviewer:v1:${revision}:${config.role}`),config:{...config,policy:{...config.policy,deadlineAt}}}))};
 }catch{return fail();}
}
