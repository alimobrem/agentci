import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {AnthropicStreamTranslator} from '../packages/providers/anthropic-stream.ts';
const request=()=>({...JSON.parse(readFileSync(new URL('../specs/api/fixtures/model-request.json',import.meta.url),'utf8')),provider:'anthropic',developer:''});
const start=()=>({type:'message_start',message:{id:'message-1',type:'message',role:'assistant',model:'fixture-model',content:[],stop_reason:null,usage:{input_tokens:3,output_tokens:0,cache_creation_input_tokens:0,cache_read_input_tokens:0}}});
const events=()=>[start(),{type:'content_block_start',index:0,content_block:{type:'text',text:''}},{type:'content_block_delta',index:0,delta:{type:'text_delta',text:'{"claim":"fixture"}'}},{type:'content_block_stop',index:0},{type:'message_delta',delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:5}},{type:'message_stop'}];
test('Anthropic stream validates ordered blocks, cumulative usage and terminal output',()=>{
 const t=new AnthropicStreamTranslator(request(),'attempt');const seen=events().flatMap(e=>t.accept(e,'req-id'));assert.deepEqual(seen.map(e=>e.type),['start','text-delta','usage','terminal']);assert.deepEqual(t.finish().structuredOutput,{claim:'fixture'});assert.equal(t.finish().usage.inputTokens,3);assert.throws(()=>t.accept({type:'ping'},null),/invalid-output/);
});
test('Anthropic stream fails closed on missing terminal, bad block order, decreasing usage and model changes',()=>{
 const mutations=[(e:any[])=>e.splice(3,1),(e:any[])=>e[2].index=1,(e:any[])=>e[4].usage.input_tokens=2,(e:any[])=>e[4].delta.model='other',(e:any[])=>e.pop()];
 for(const mutate of mutations){const e=events();mutate(e);const t=new AnthropicStreamTranslator(request(),'attempt');assert.throws(()=>{e.forEach(v=>t.accept(v,null));t.finish();},/invalid-output/);}
});
test('Anthropic stream validates complete tool JSON while truncation discards partial proposals',()=>{
 for(const truncated of [false,true]){
  const req=request();req.tools=[{name:'inspect',description:'Inspect',inputSchema:{type:'object',properties:{},additionalProperties:false}}];const t=new AnthropicStreamTranslator(req,'attempt');
  const e=[start(),{type:'content_block_start',index:0,content_block:{type:'tool_use',id:'call-1',name:'inspect',input:{}}},{type:'content_block_delta',index:0,delta:{type:'input_json_delta',partial_json:truncated?'{':'{}'}},{type:'content_block_stop',index:0},{type:'message_delta',delta:{stop_reason:truncated?'max_tokens':'tool_use'},usage:{output_tokens:2}},{type:'message_stop'}];e.forEach(v=>t.accept(v,null));assert.equal(t.finish().toolCalls.length,truncated?0:1);assert.equal(t.finish().status,truncated?'incomplete':'completed');
 }
});

test('empty tool arguments without deltas remain a valid proposal',()=>{
 const req=request();req.tools=[{name:'inspect',description:'Inspect',inputSchema:{type:'object',properties:{},additionalProperties:false}}];const t=new AnthropicStreamTranslator(req,'attempt');
 [start(),{type:'content_block_start',index:0,content_block:{type:'tool_use',id:'call-1',name:'inspect',input:{}}},{type:'content_block_stop',index:0},{type:'message_delta',delta:{stop_reason:'tool_use'},usage:{output_tokens:1}},{type:'message_stop'}].forEach(e=>t.accept(e,null));assert.deepEqual(t.finish().toolCalls[0]?.arguments,{});
});
test('streamed thinking and signature fragments survive only in continuation data',()=>{
 const t=new AnthropicStreamTranslator(request(),'attempt');
 const e=[start(),{type:'content_block_start',index:0,content_block:{type:'thinking',thinking:'',signature:''}},{type:'content_block_delta',index:0,delta:{type:'thinking_delta',thinking:'private-reasoning'}},{type:'content_block_delta',index:0,delta:{type:'signature_delta',signature:'signed-'}},{type:'content_block_delta',index:0,delta:{type:'signature_delta',signature:'fixture'}},{type:'content_block_stop',index:0},...events().slice(1).map((event:any)=>'index' in event?{...event,index:1}:event)];
 const seen=e.flatMap(event=>t.accept(event,null));assert.equal(JSON.stringify(seen.filter(event=>event.type==='text-delta')).includes('private-reasoning'),false);
 assert.deepEqual(t.finish().continuation?.content[0],{type:'thinking',thinking:'private-reasoning',signature:'signed-fixture'});
});
