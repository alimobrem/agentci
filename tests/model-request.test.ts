import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {validateModelRequest,assertProviderCapabilities} from '../packages/providers/request.ts';
import {ProviderFailure,type ModelProvider} from '../packages/providers/types.ts';
const fixture=()=>JSON.parse(readFileSync(new URL('../specs/api/fixtures/model-request.json',import.meta.url),'utf8'));
test('normalized model request is strict, detached and never coerces or mutates input',()=>{
 const value=fixture(),before=JSON.stringify(value),request=validateModelRequest(value);assert.deepEqual(request,value);assert.notEqual(request,value);assert.equal(JSON.stringify(value),before);
 for(const change of [{apiKey:'private-fixture'},{provider:'../other'},{requestId:'not-uuid'},{parameters:{maxOutputTokens:'256'}},{policy:{...value.policy,maxAttempts:0}},{policy:{...value.policy,baseDelayMs:2000,maxDelayMs:1000}},{messages:[{role:'tool',content:'result'}]},{messages:[{role:'user',content:'text',toolCallId:'wrong'}]}])assert.throws(()=>validateModelRequest({...value,...change}),error=>error instanceof ProviderFailure&&error.code==='invalid-request'&&!error.message.includes('private'));
 request.metadata.scenario='changed';assert.equal(value.metadata.scenario,'request-conformance');
});
test('requests reject non-JSON extension data, oversized input, recursive data and unresolved schemas',()=>{
 const value=fixture();
 for(const data of [new Map(),undefined,NaN,()=>{},new Date()])assert.throws(()=>validateModelRequest({...value,providerExtensions:{fixture:{data}}}),/invalid-request/);
 const cyclic:any={};cyclic.self=cyclic;assert.throws(()=>validateModelRequest({...value,providerExtensions:{fixture:cyclic}}),/invalid-request/);
 assert.throws(()=>validateModelRequest({...value,system:'x'.repeat(1048577)}),/invalid-request/);
 assert.throws(()=>validateModelRequest({...value,responseSchema:{$ref:'https://untrusted.invalid/schema'}}),/invalid-request/);
 const tool={name:'inspect',description:'Propose inspection',inputSchema:{type:'object'}};assert.throws(()=>validateModelRequest({...value,tools:[tool,tool]}),/invalid-request/);
});
test('provider identity and unsupported capabilities fail before dispatch; extensions remain namespaced',()=>{
 const request=validateModelRequest(fixture());
 const capabilities={stream:true,tools:true,structuredOutput:true,developerInstructions:true,extensions:true};
 const provider:ModelProvider={id:'fixture',upstreamIdentity:'fixture-upstream',capabilities:()=>capabilities,invoke:async()=>{throw Error('Must not dispatch');},async *stream(){throw Error('Must not dispatch');}};
 assertProviderCapabilities(provider,request,true);
 for(const field of ['stream','structuredOutput','developerInstructions'] as const)assert.throws(()=>assertProviderCapabilities({...provider,capabilities:()=>({...capabilities,[field]:false})},request,true),/unsupported-capability/);
 assert.throws(()=>assertProviderCapabilities({...provider,id:'other'},request),/invalid-request/);
 assert.throws(()=>assertProviderCapabilities({...provider,capabilities:()=>({...capabilities,extensions:false})},{...request,providerExtensions:{fixture:{reasoning:'high'}}}),/unsupported-capability/);
 assertProviderCapabilities({...provider,capabilities:()=>({...capabilities,extensions:false})},{...request,providerExtensions:{another:{reasoning:'high'}}});
});

test('tool conversation history preserves proposals and requires one matching result per call',()=>{
 const value=fixture(),call={id:'call-1',name:'inspect',arguments:{path:'fixture.ts'}};
 value.messages.push({role:'assistant',content:'',toolCalls:[call]},{role:'tool',content:'Observed fixture only',toolCallId:'call-1'});
 assert.deepEqual(validateModelRequest(value).messages,value.messages);
 for(const messages of [value.messages.slice(0,-1),[...value.messages,value.messages.at(-1)],[{role:'tool',content:'Unsolicited',toolCallId:'missing'}],[{role:'user',content:'Untrusted',toolCalls:[call]}]])assert.throws(()=>validateModelRequest({...value,messages}),/invalid-request/);
});
