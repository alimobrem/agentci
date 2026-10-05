import test from 'node:test';import assert from 'node:assert/strict';
import {validateXAISchema} from '../packages/providers/xai-schema.ts';
test('xAI retains accepted best-effort constraints without rewriting caller schemas',()=>{
 const schema={type:'object',properties:{text:{type:'string',maxLength:4096,pattern:'^abc$'},number:{type:'number',minimum:1}},required:['text'],additionalProperties:false,allOf:[{properties:{number:{minimum:2}}},{properties:{number:{maximum:4}}}]},before=structuredClone(schema);
 validateXAISchema(schema);assert.deepEqual(schema,before);
 validateXAISchema({type:'string',pattern:'\\\\b'});
});
test('xAI rejects upstream-invalid schema shapes, recursive refs and unsupported regex constructs',()=>{
 for(const schema of [{enum:[]},{anyOf:[]},{properties:{bad:false}},{minContains:1},{items:[{type:'string'}]},{$ref:'#'},{$ref:'https://untrusted.example/schema'},{type:'string',pattern:'\\bword'},{type:'string',pattern:'(?=x)'},{type:'string',pattern:'\\p{L}'}])assert.throws(()=>validateXAISchema(schema),/unsupported-capability/);
 validateXAISchema({$defs:{text:{type:'string'}},type:'object',properties:{value:{$ref:'#/$defs/text'}}});
});
