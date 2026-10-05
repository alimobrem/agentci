import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {createAnthropicTransport} from '../packages/providers/anthropic-transport.ts';
const request=()=>({...JSON.parse(readFileSync(new URL('../specs/api/fixtures/model-request.json',import.meta.url),'utf8')),provider:'anthropic',developer:'',policy:{deadlineAt:Date.now()+5000,maxAttempts:2,baseDelayMs:1,maxDelayMs:5}});
const context=()=>({attemptId:'attempt-1',signal:new AbortController().signal});
const response=()=>({id:'msg-fixture',type:'message',role:'assistant',model:'fixture-model',stop_reason:'end_turn',content:[{type:'text',text:'{"claim":"fixture"}'}],usage:{input_tokens:1,output_tokens:1,cache_creation_input_tokens:0,cache_read_input_tokens:0}});
test('Anthropic SDK uses pinned origin, explicit key and standard service',async()=>{
 const transport=createAnthropicTransport('synthetic-fixture',async(input,init)=>{
  assert.equal(String(input),'https://api.anthropic.com/v1/messages');assert.equal(init?.redirect,'error');const headers=new Headers(init?.headers);assert.equal(headers.get('x-api-key'),'synthetic-fixture');assert.equal(headers.has('authorization'),false);assert.equal(JSON.parse(init!.body as string).service_tier,'standard_only');
  return new Response(JSON.stringify(response()),{headers:{'content-type':'application/json','request-id':'req-fixture'}});
 });const result=await transport.invoke(request(),context());assert.equal(result.providerRequestId,'req-fixture');assert.equal(result.observedModel,'fixture-model');
});
test('Anthropic SDK cannot retry internally or expose provider messages',async()=>{
 for(const status of [401,429,529]){
  let calls=0;const transport=createAnthropicTransport('synthetic-fixture',async()=>{calls++;return new Response(JSON.stringify({type:'error',error:{type:'overloaded_error',message:'private-fixture'}}),{status,headers:{'content-type':'application/json','retry-after':'2'}});});
  await assert.rejects(transport.invoke(request(),context()),(error:any)=>error.message===(status===401?'authentication':status===429?'rate-limit':'transport')&&(status===401||error.retryAfterMs===2000));assert.equal(calls,1);
 }
});
test('Anthropic transport rejects expired, cancelled, redirected and oversized responses',async()=>{
 let calls=0;const transport=createAnthropicTransport('synthetic-fixture',async()=>{calls++;return new Response('x'.repeat(4194305));});const req=request();req.policy.deadlineAt=Date.now()-1;await assert.rejects(transport.invoke(req,context()),/deadline/);const c=new AbortController();c.abort();await assert.rejects(transport.invoke(request(),{attemptId:'a',signal:c.signal}),/cancelled/);assert.equal(calls,0);await assert.rejects(transport.invoke(request(),context()),/invalid-output/);
 const redirect=createAnthropicTransport('synthetic-fixture',async()=>new Response(null,{status:302,headers:{location:'https://untrusted.invalid'}}));await assert.rejects(redirect.invoke(request(),context()),/transport/);
});
test('Anthropic SDK parses SSE while retaining the upstream request identity',async()=>{
 const events=[{type:'message_start',message:{...response(),content:[],stop_reason:null}},{type:'message_stop'}];
 const transport=createAnthropicTransport('synthetic-fixture',async()=>new Response(events.map(event=>`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''),{headers:{'content-type':'text/event-stream','request-id':'req-stream'}}));
 const observed=[];for await(const frame of transport.events(request(),context())){observed.push(frame.event.type);assert.equal(frame.requestId,'req-stream');}assert.deepEqual(observed,['message_start','message_stop']);
});
