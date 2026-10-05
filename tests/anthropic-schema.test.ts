import test from 'node:test';import assert from 'node:assert/strict';import {validateAnthropicSchemas} from '../packages/providers/anthropic-schema.ts';
const object=(properties:Record<string,unknown>,required:string[]=[])=>({type:'object',properties,required,additionalProperties:false});
test('Anthropic explicit limits apply across tools and output without removing constraints',()=>{
 const optional=object(Object.fromEntries(Array.from({length:12},(_,i)=>['p'+i,{type:'string'}])));validateAnthropicSchemas([optional],optional);assert.throws(()=>validateAnthropicSchemas([optional,optional],object({extra:{type:'string'}})),/unsupported-capability/);
 assert.throws(()=>validateAnthropicSchemas(Array.from({length:21},()=>object({})),null),/unsupported-capability/);
 const unions=object(Object.fromEntries(Array.from({length:17},(_,i)=>['p'+i,{type:['string','null']}])));assert.throws(()=>validateAnthropicSchemas([],unions),/unsupported-capability/);
 for(const child of [{type:'number',minimum:0},{type:'string',minLength:1},{type:'array',items:{type:'string'},minItems:2},{type:'string',pattern:'(?=x)'},{type:'string',enum:[{}]}]){const schema=object({child}),before=JSON.stringify(schema);assert.throws(()=>validateAnthropicSchemas([],schema),/unsupported-capability/);assert.equal(JSON.stringify(schema),before);}
});
test('Anthropic accepts local acyclic references but rejects recursive or external schemas',()=>{
 const schema={...object({child:{$ref:'#/$defs/value'}}),$defs:{value:{type:'string',format:'uri'}}};validateAnthropicSchemas([],schema);
 for(const ref of ['#','https://untrusted.invalid/schema','#/missing'])assert.throws(()=>validateAnthropicSchemas([],object({child:{$ref:ref}})),/unsupported-capability/);
 assert.throws(()=>validateAnthropicSchemas([],{...schema,allOf:[{$ref:'#/$defs/value'}]}),/unsupported-capability/);
});
