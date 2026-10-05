import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {randomUUID} from 'node:crypto';
import {createReviewerRuntime,validateReviewerRuntime,loadReviewerRuntime} from '../packages/runtime/reviewers.ts';
import {prepareReviewerRequest} from '../packages/reviewers/request.ts';
import {digest} from '../packages/review/engine.ts';
const fixture=()=>JSON.parse(readFileSync(new URL('../deploy/reviewers.synthetic.example.json',import.meta.url),'utf8'));
test('operator runtime registers all synthetic roles with no network or credential path',async t=>{
 t.mock.method(globalThis,'fetch',async()=>{throw Error('Fixture must never use network');});
 const definition=fixture(),runtime=createReviewerRuntime(definition,{});assert.equal(runtime.definition.profiles[0]!.reviewers.length,7);assert.equal(runtime.registrations[0]!.execution,'fixture');
 definition.profiles[0].id='mutated';assert.equal(runtime.definition.profiles[0]!.id,'synthetic-dogfood');
 const profile=runtime.definition.profiles[0]!,subject={organizationId:randomUUID(),repository:'owner/repo',pullRequest:1,baseSha:'a'.repeat(40),headSha:'b'.repeat(40)},documents=[{kind:'source',side:'head',path:'README.md',content:'fixture evidence',digest:digest('fixture evidence')}];
 for(const config of profile.reviewers){const request=prepareReviewerRequest(randomUUID(),{...config,policy:{...config.policy,deadlineAt:Date.now()+10000}},subject,documents).request;const result=await runtime.registrations[0]!.provider.invoke(request,{attemptId:randomUUID(),signal:new AbortController().signal});assert.deepEqual(result.structuredOutput,{findings:[]});assert.equal(result.usage.costUsdMicros,0);}
 const proposed=fixture();proposed.providers[0].scenario='proposed-defect';const adapter=createReviewerRuntime(proposed,{}).registrations[0]!.provider,config=profile.reviewers[0]!,request=prepareReviewerRequest(randomUUID(),{...config,policy:{...config.policy,deadlineAt:Date.now()+10000}},subject,documents).request;
 const response=await adapter.invoke(request,{attemptId:randomUUID(),signal:new AbortController().signal});assert.equal((response.structuredOutput as any).findings.length,1);assert.match((response.structuredOutput as any).findings[0].claim,/Synthetic/);
});
test('runtime rejects implicit external dispatch, inline credentials, arbitrary endpoints and malformed identities',async()=>{
 const d=fixture();
 for(const change of [{apiKey:'private'},{providers:[{...d.providers[0],url:'https://untrusted.invalid'}]},{profiles:[{...d.profiles[0],mode:'live'}]},{providers:[d.providers[0],d.providers[0]]},{codingProvenance:[{providerId:'fixture',model:'fixture',headSha:'main',evidenceDigest:digest('claim')}]}])assert.throws(()=>validateReviewerRuntime({...d,...change}),/^Error: invalid-reviewer-runtime$/);
 const external=fixture();external.providers=[{kind:'openai',models:[{model:'test-model',contextTokens:10000,maxOutputTokens:1000,capabilities:{stream:false,tools:false,structuredOutput:true,developerInstructions:true,extensions:false},temperature:false,topP:false,inputUsdMicrosPerMillion:1000,outputUsdMicrosPerMillion:1000,pricingRevision:'fixture-only'}]}];external.profiles[0].mode='live';for(const role of external.profiles[0].reviewers){role.provider='openai';role.model='test-model';role.providerExtensions={};}
 assert.throws(()=>createReviewerRuntime(external,{}),/^Error: invalid-reviewer-runtime$/);
 const configured=createReviewerRuntime(external,{OPENAI_API_KEY:'fixture-not-a-real-key'});assert.equal(configured.registrations[0]!.execution,'external');assert.ok(!JSON.stringify(configured.definition).includes('fixture-not-a-real-key'));assert.equal(configured.policyDigest,createReviewerRuntime(external,{OPENAI_API_KEY:'rotated-fixture-key'}).policyDigest);
 assert.equal(await loadReviewerRuntime({}),null);await assert.rejects(loadReviewerRuntime({AGENTCI_REVIEWER_CONFIG_FILE:'relative.json'}),/^Error: invalid-reviewer-runtime$/);
});
