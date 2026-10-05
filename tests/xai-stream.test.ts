import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {XAIStreamTranslator} from '../packages/providers/xai-stream.ts';
import {createXAITransport} from '../packages/providers/xai-transport.ts';
const fixture=()=>({...JSON.parse(readFileSync(new URL('../specs/api/fixtures/model-request.json',import.meta.url),'utf8')),provider:'xai'});
function frames(){
 const item={id:'item-1',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'{"claim":"fixture"}'}]};
 const response={id:'response-1',model:'fixture-model',status:'completed',output:[item],usage:{input_tokens:1,output_tokens:2,total_tokens:3}};
 return [{type:'response.created',response:{...response,status:'in_progress',output:[]}},{type:'response.output_item.added',output_index:0,item:{...item,status:'in_progress',content:[]}},{type:'response.output_text.delta',delta:'{"claim":"fixture"}'},{type:'response.output_text.done',text:'{"claim":"fixture"}'},{type:'response.output_item.done',output_index:0,item},{type:'response.completed',response}];
}
test('xAI accepts omitted optional locators and consistent explicit sequence numbers',()=>{
 for(const numbered of [false,true]){
  const translator=new XAIStreamTranslator(fixture(),'attempt');let emitted=0;
  for(const [sequence_number,event] of frames().entries())emitted+=translator.accept(numbered?{...event,sequence_number}:event,null).length;
  assert.equal(emitted,4);assert.deepEqual(translator.finish().structuredOutput,{claim:'fixture'});
 }
});
test('xAI rejects broken sequence, ambiguous locator, changed identity and inconsistent final output',()=>{
 const variants=[
  (events:any[])=>events.map((e,i)=>({...e,sequence_number:i===2?4:i})),
  (events:any[])=>events.map((e,i)=>i===2?{...e,item_id:'wrong'}:e),
  (events:any[])=>events.map((e,i)=>i===5?{...e,response:{...e.response,id:'wrong'}}:e),
  (events:any[])=>events.map((e,i)=>i===5?{...e,response:{...e.response,output:[]}}:e),
  (events:any[])=>events.filter((_,i)=>i!==4),
  (events:any[])=>[...events.slice(0,2),{...events[1],output_index:1,item:{...events[1].item,id:'second'}},...events.slice(2)],
 ];
 for(const change of variants){const translator=new XAIStreamTranslator(fixture(),'attempt');assert.throws(()=>{for(const event of change(frames()))translator.accept(event,null);},/invalid-output/);assert.throws(()=>translator.finish(),/invalid-output/);}
 const truncated=new XAIStreamTranslator(fixture(),'attempt');for(const event of frames().slice(0,-1))truncated.accept(event,null);assert.throws(()=>truncated.finish(),/invalid-output/);
});
test('xAI tool arguments must match completion and known tool schemas',()=>{
 const req=fixture();req.responseSchema=null;req.tools=[{name:'inspect',description:'Inspect',inputSchema:{type:'object',properties:{},additionalProperties:false}}];
 const item={id:'tool-1',type:'function_call',call_id:'call-1',name:'inspect',arguments:'{}',status:'completed'};
 const events=[frames()[0],{type:'response.output_item.added',output_index:0,item:{...item,status:'in_progress',arguments:''}},{type:'response.function_call_arguments.delta',delta:'{}'},{type:'response.function_call_arguments.done',arguments:'{}'},{type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{id:'response-1',model:req.model,status:'completed',output:[item]}}];
 const translator=new XAIStreamTranslator(req,'attempt');for(const event of events)translator.accept(event,null);assert.deepEqual(translator.finish().toolCalls,[{id:'call-1',name:'inspect',arguments:{}}]);
 const invalid=new XAIStreamTranslator(req,'attempt');for(const event of events.slice(0,3))invalid.accept(event,null);assert.throws(()=>invalid.accept({type:'response.function_call_arguments.done',arguments:'{"extra":true}'},null),/invalid-output/);
});
test('xAI refusal events omitted from SDK types remain explicit and non-actionable',()=>{
 const item={id:'item-1',type:'message',role:'assistant',status:'completed',content:[{type:'refusal',refusal:'Declined'}]},translator=new XAIStreamTranslator(fixture(),'attempt');
 const events=[frames()[0],frames()[1],{type:'unknown',raw:{type:'response.refusal.delta',delta:'Declined'}},{type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{id:'response-1',model:'fixture-model',status:'completed',output:[item]}}];
 for(const event of events)translator.accept(event,null);assert.equal(translator.finish().status,'refused');assert.equal(translator.finish().continuation,undefined);
});
test('xAI SDK SSE output passes semantic validation before becoming a result',async()=>{
 const request=fixture();request.policy.deadlineAt=Date.now()+60000;
 const translator=new XAIStreamTranslator(request,'attempt');
 const transport=createXAITransport('synthetic-fixture',async()=>new Response(frames().map(event=>`data: ${JSON.stringify(event)}\n\n`).join(''),{headers:{'content-type':'text/event-stream','x-request-id':'sdk-stream-fixture'}}));
 for await(const frame of transport.events(request,{attemptId:'attempt',signal:new AbortController().signal}))translator.accept(frame.event,frame.requestId);
 const result=translator.finish();assert.deepEqual(result.structuredOutput,{claim:'fixture'});assert.equal(result.providerRequestId,'sdk-stream-fixture');
});
