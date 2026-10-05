import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {createXAITransport} from '../packages/providers/xai-transport.ts';
import {ProviderFailure} from '../packages/providers/types.ts';
const fixture=()=>({...JSON.parse(readFileSync(new URL('../specs/api/fixtures/model-request.json',import.meta.url),'utf8')),provider:'xai',policy:{deadlineAt:Date.now()+60000,maxAttempts:1,baseDelayMs:0,maxDelayMs:0}});
const context=()=>({attemptId:'fixture-attempt',signal:new AbortController().signal});
const payload={id:'fixture-response',object:'response',model:'fixture-model',status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'{"claim":"fixture"}'}]}],usage:{input_tokens:1,output_tokens:2,total_tokens:3}};
test('xAI SDK sends explicit key to fixed origin with retries and storage disabled',async()=>{
 let calls=0;const transport=createXAITransport('synthetic-fixture',async(input)=>{
  calls++;assert.ok(input instanceof Request);assert.equal(input.url,'https://api.x.ai/v1/responses');assert.equal(input.method,'POST');assert.equal(input.redirect,'error');assert.equal(input.headers.get('authorization'),'Bearer synthetic-fixture');
  const body=await input.json();assert.equal(body.store,false);assert.equal(body.stream,false);assert.equal(body.service_tier,'default');assert.ok(body.include.includes('reasoning.encrypted_content'));
  return new Response(JSON.stringify(payload),{headers:{'content-type':'application/json','x-request-id':'fixture-id'}});
 });
 const result=await transport.raw(fixture(),context());assert.equal(calls,1);assert.deepEqual(result.payload,payload);assert.equal(result.requestId,'fixture-id');
});
test('xAI HTTP errors preserve retry delays and unknown-dispatch accounting without SDK retries',async()=>{
 for(const status of [401,403,429,503]){
  let calls=0;const transport=createXAITransport('synthetic-fixture',async()=>{calls++;return new Response('private upstream details',{status,headers:{'retry-after':'2'}});});
  await assert.rejects(transport.raw(fixture(),context()),(error:unknown)=>{
   assert.ok(error instanceof ProviderFailure);assert.equal(error.code,status===429?'rate-limit':status===503?'transport':'authentication');assert.equal(error.retryable,status===429||status===503);assert.equal(error.dispatch,status===503?'possibly-sent':'not-sent');assert.equal(error.message.includes('private'),false);if(status===429)assert.equal(error.retryAfterMs,2000);return true;
  });assert.equal(calls,1);
 }
});
test('xAI rejects expired, aborted, redirected, malformed and oversized responses',async()=>{
 let calls=0;const transport=createXAITransport('synthetic-fixture',async()=>{calls++;throw Error();});
 const req=fixture();req.policy.deadlineAt=Date.now()-1;await assert.rejects(transport.raw(req,context()),/deadline/);
 const controller=new AbortController();controller.abort();await assert.rejects(transport.raw(fixture(),{attemptId:'cancelled',signal:controller.signal}),/cancelled/);assert.equal(calls,0);
 for(const response of [()=>new Response('',{status:302}),()=>new Response('not-json',{headers:{'content-type':'application/json'}}),()=>new Response('x'.repeat(4194305),{headers:{'content-type':'application/json'}})]){
  await assert.rejects(createXAITransport('synthetic-fixture',async()=>response()).raw(fixture(),context()),(error:unknown)=>error instanceof ProviderFailure&&error.dispatch==='possibly-sent');
 }
});
test('xAI SDK parses SSE and rejects a stream without terminal completion',async()=>{
 const frames=[{type:'response.created',response:{...payload,status:'in_progress',output:[]}},{type:'response.completed',response:payload}];
 for(const complete of [true,false]){
  const transport=createXAITransport('synthetic-fixture',async()=>new Response((complete?frames:frames.slice(0,1)).map(event=>`data: ${JSON.stringify(event)}\n\n`).join(''),{headers:{'content-type':'text/event-stream'}}));
  const read=async()=>{const result=[];for await(const frame of transport.events(fixture(),context()))result.push(frame.event.type);return result;};
  if(complete)assert.deepEqual(await read(),['response.created','response.completed']);else await assert.rejects(read(),/invalid-output|transport/);
 }
});
test('xAI streaming error cannot release a potentially billable attempt',async()=>{
 let calls=0;const transport=createXAITransport('synthetic-fixture',async()=>{calls++;return new Response('data: {"type":"error","status":429,"message":"private stream detail"}\n\n',{headers:{'content-type':'text/event-stream'}});});
 await assert.rejects(async()=>{for await(const _frame of transport.events(fixture(),context())){}},(error:unknown)=>{
  assert.ok(error instanceof ProviderFailure);assert.equal(error.dispatch,'possibly-sent');assert.equal(error.code,'rate-limit');assert.equal(error.message.includes('private'),false);return true;
 });assert.equal(calls,1);
});
test('ambient xAI debug logging fails before dispatch without changing global settings',async()=>{
 const previous=process.env.XAI_DEBUG;let calls=0;
 try{
  process.env.XAI_DEBUG='1';const transport=createXAITransport('synthetic-fixture',async()=>{calls++;throw Error();});
  await assert.rejects(transport.raw(fixture(),context()),/invalid-request/);assert.equal(calls,0);assert.equal(process.env.XAI_DEBUG,'1');
 }finally{if(previous===undefined)delete process.env.XAI_DEBUG;else process.env.XAI_DEBUG=previous;}
});
