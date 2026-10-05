import {readFile} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {canonical,digest} from '../review/engine.ts';
import {validateReviewerProfile,type ReviewerProfile} from '../reviewers/profile.ts';
import {createOpenAIProvider,type OpenAIModelProfile} from '../providers/openai.ts';
import {createAnthropicProvider,type AnthropicModelProfile} from '../providers/anthropic.ts';
import {createXAIProvider,type XAIModelProfile} from '../providers/xai.ts';
import {ProviderFailure,type ModelProvider} from '../providers/types.ts';
import type {TrustedCodingProvenance} from '../reviewers/independence.ts';
import {findingProposalSchema} from '../findings/model.ts';
export type ReviewerProviderDefinition={kind:'fixture';model:string;scenario:'clean'|'proposed-defect'}|{kind:'openai'|'anthropic'|'xai';models:(OpenAIModelProfile|AnthropicModelProfile|XAIModelProfile)[]};
export interface ReviewerRuntimeDefinition {schemaVersion:'v1alpha1';profiles:ReviewerProfile[];providers:ReviewerProviderDefinition[];codingProvenance:TrustedCodingProvenance[]}
const exact=(v:any,keys:string[])=>v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
function fail():never{throw Error('invalid-reviewer-runtime');}
const identifier=(s:unknown)=>typeof s==='string'&&/^[a-z0-9][a-z0-9._-]{0,127}$/.test(s);
export function validateReviewerRuntime(value:unknown):ReviewerRuntimeDefinition{
 try{
  if(!exact(value,['schemaVersion','profiles','providers','codingProvenance']))fail();const v=value as ReviewerRuntimeDefinition;
  if(v.schemaVersion!=='v1alpha1'||!Array.isArray(v.profiles)||!v.profiles.length||v.profiles.length>64||!Array.isArray(v.providers)||!v.providers.length||v.providers.length>4||!Array.isArray(v.codingProvenance)||v.codingProvenance.length>1024)fail();
  const profiles=v.profiles.map(p=>validateReviewerProfile(p).profile);
  if(new Set(profiles.map(p=>canonical([p.id,validateReviewerProfile(p).revision]))).size!==profiles.length)fail();
  const providers=v.providers.map(p=>{
   if(p.kind==='fixture'){if(!exact(p,['kind','model','scenario'])||!identifier(p.model)||!['clean','proposed-defect'].includes(p.scenario))fail();return structuredClone(p);}
   if(!exact(p,['kind','models'])||!['openai','anthropic','xai'].includes(p.kind)||!Array.isArray(p.models)||!p.models.length||p.models.length>64)fail();
   for(const model of p.models){
    const required=['model','contextTokens','maxOutputTokens','capabilities','temperature','topP','inputUsdMicrosPerMillion','outputUsdMicrosPerMillion','pricingRevision'];
    const optional=['responseModels',...(p.kind==='anthropic'?['requireSignedToolHistory']:p.kind==='xai'?['requireToolContinuation']:[])];
    if(!model||typeof model!=='object'||required.some(k=>!Object.hasOwn(model,k))||Object.keys(model).some(k=>![...required,...optional].includes(k))||!exact(model.capabilities,['stream','tools','structuredOutput','developerInstructions','extensions']))fail();
    if(typeof model.model!=='string'||!model.model||model.model.length>256||typeof model.pricingRevision!=='string'||!model.pricingRevision||model.pricingRevision.length>256||[model.contextTokens,model.maxOutputTokens,model.inputUsdMicrosPerMillion,model.outputUsdMicrosPerMillion].some(n=>!Number.isSafeInteger(n)||n<1)||model.maxOutputTokens>model.contextTokens||typeof model.temperature!=='boolean'||typeof model.topP!=='boolean'||Object.values(model.capabilities).some(v=>typeof v!=='boolean'))fail();
    if(model.responseModels!==undefined&&(!Array.isArray(model.responseModels)||!model.responseModels.length||model.responseModels.length>32||new Set(model.responseModels).size!==model.responseModels.length||model.responseModels.some(m=>typeof m!=='string'||!m||m.length>256)))fail();
    for(const key of ['requireSignedToolHistory','requireToolContinuation'])if(Object.hasOwn(model,key)&&typeof (model as unknown as Record<string,unknown>)[key]!=='boolean')fail();
   }
   return structuredClone(p);
  });
  if(new Set(providers.map(p=>p.kind)).size!==providers.length)fail();
  for(const profile of profiles)for(const role of profile.reviewers){
   const provider=providers.find(p=>p.kind===role.provider);if(!provider||(profile.mode==='synthetic')!==(provider.kind==='fixture')||canonical(role.responseSchema)!==canonical(findingProposalSchema))fail();
   if(provider.kind==='fixture'?role.model!==provider.model:!provider.models.some(m=>m.model===role.model))fail();
  }
  const codingProvenance=v.codingProvenance.map(p=>{if(!exact(p,['providerId','model','headSha','evidenceDigest'])||!identifier(p.providerId)||typeof p.model!=='string'||!p.model||p.model.length>256||typeof p.headSha!=='string'||!/^[a-f0-9]{40}$/.test(p.headSha)||typeof p.evidenceDigest!=='string'||!/^sha256:[a-f0-9]{64}$/.test(p.evidenceDigest))fail();return structuredClone(p);});
  if(new Set(codingProvenance.map(p=>p.headSha)).size!==codingProvenance.length)fail();
  const result={schemaVersion:'v1alpha1' as const,profiles,providers,codingProvenance};if(Buffer.byteLength(canonical(result))>1048576)fail();return result;
 }catch{return fail();}
}
/** No fetch/SDK/credential path exists in this deterministic synthetic provider. */
function fixtureProvider(definition:Extract<ReviewerProviderDefinition,{kind:'fixture'}>):ModelProvider{
 const d={...definition};return {id:'fixture',upstreamIdentity:'fixture',capabilities:()=>({stream:false,tools:false,structuredOutput:true,developerInstructions:false,extensions:false}),
  estimateCost:request=>{if(request.model!==d.model)throw new ProviderFailure('invalid-request');return {upperBoundUsdMicros:1,pricingRevision:'synthetic-zero-cost-v1',maxInputTokens:65536,maxOutputTokens:request.parameters.maxOutputTokens};},
  async invoke(request,context){
   if(context.signal.aborted)throw new ProviderFailure('cancelled');if(request.provider!=='fixture'||request.model!==d.model)throw new ProviderFailure('invalid-request');
   const documents=JSON.parse(request.messages[0]!.content).documents as {kind:string;side:string;path:string;content:string;digest:string}[],source=documents.find(d=>d.kind==='source'&&d.side==='head');
   if(d.scenario==='proposed-defect'&&!source)throw new ProviderFailure('invalid-request');
   const findings=d.scenario==='clean'?[]:[{category:'correctness',severity:'medium',claim:'Synthetic fixture proposal; reproduction is required',evidence:[{side:'head',path:source!.path,digest:source!.digest,startLine:1,endLine:1}]}];
   return {schemaVersion:'v1alpha1',requestId:request.requestId,attemptId:context.attemptId,provider:'fixture',model:d.model,status:'completed',text:'Synthetic fixture review',structuredOutput:{findings},toolCalls:[],usage:{inputTokens:0,outputTokens:0,costUsdMicros:0,costKind:'reported',pricingRevision:null},providerRequestId:null};
  },async *stream(){throw new ProviderFailure('unsupported-capability');},
 };
}
/** Secrets are resolved only here and never returned in config/policy evidence. */
export function createReviewerRuntime(value:unknown,env:NodeJS.ProcessEnv=process.env){
 try{
  const definition=validateReviewerRuntime(value),registrations=definition.providers.map(p=>{
   if(p.kind==='fixture')return {provider:fixtureProvider(p),execution:'fixture' as const};
   const key=env[{openai:'OPENAI_API_KEY',anthropic:'ANTHROPIC_API_KEY',xai:'XAI_API_KEY'}[p.kind]];if(typeof key!=='string'||!key||key.length>16384)fail();
   const provider=p.kind==='openai'?createOpenAIProvider(key,p.models):p.kind==='anthropic'?createAnthropicProvider(key,p.models):createXAIProvider(key,p.models);
   return {provider,execution:'external' as const};
  });
  return {definition,policyDigest:digest(canonical(definition)),registrations};
 }catch{return fail();}
}
/** Pure configuration loading: no provider construction or credential lookup. */
export async function loadReviewerDefinition(env:NodeJS.ProcessEnv=process.env){
 const path=env.AGENTCI_REVIEWER_CONFIG_FILE;if(path===undefined)return null;
 try{if(!path||!isAbsolute(path))fail();const text=await readFile(path,'utf8');if(Buffer.byteLength(text)>1048576)fail();return validateReviewerRuntime(JSON.parse(text));}catch{return fail();}
}
export async function loadReviewerRuntime(env:NodeJS.ProcessEnv=process.env){
 const definition=await loadReviewerDefinition(env);return definition?createReviewerRuntime(definition,env):null;
}
