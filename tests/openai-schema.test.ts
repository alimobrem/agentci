import test from 'node:test';
import assert from 'node:assert/strict';
import {validateOpenAISchema} from '../packages/providers/openai-schema.ts';
const object=(properties:Record<string,unknown>):Record<string,unknown>=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const nested=(levels:number):Record<string,unknown>=>levels===1?object({value:{type:'string'}}):object({child:nested(levels-1)});
test('schema depth counts referenced objects and arrays while allowing recursive back-edges',()=>{
 validateOpenAISchema(nested(10));assert.throws(()=>validateOpenAISchema(nested(11)),/unsupported-capability/);
 const root=object({child:{$ref:'#/$defs/deep'}});root.$defs={deep:nested(9)};validateOpenAISchema(root);root.$defs={deep:nested(10)};assert.throws(()=>validateOpenAISchema(root),/unsupported-capability/);
 validateOpenAISchema(object({children:{type:'array',items:{$ref:'#'}}}));
 const recursive=object({next:{$ref:'#/$defs/node'}});recursive.$defs={node:object({next:{anyOf:[{$ref:'#/$defs/node'},{type:'null'}]}})};validateOpenAISchema(recursive);
});
test('references resolve only local schema nodes, including escaped definition names',()=>{
 const root=object({child:{$ref:'#/$defs/a~1b~0c'}});root.$defs={'a/b~c':{type:'string'}};validateOpenAISchema(root);
 for(const ref of ['https://example.invalid/schema','#/missing','#/properties','#/constructor','#/%XX','#/$defs/a~2b'])assert.throws(()=>validateOpenAISchema(object({child:{$ref:ref}})),/unsupported-capability/);
});
test('unsupported constructs, untyped values and fine-tuned constraints fail explicitly',()=>{
 for(const child of [{},{type:'array'},{type:'array',items:[{type:'string'}]},{type:'string',format:'uri'},{oneOf:[{type:'string'},{type:'number'}]},{type:'array',items:{type:'string'},uniqueItems:true}])assert.throws(()=>validateOpenAISchema(object({child})),/unsupported-capability/);
 const schema=object({email:{type:'string',format:'email'},count:{type:'integer',minimum:0}});validateOpenAISchema(schema);assert.throws(()=>validateOpenAISchema(schema,true),/unsupported-capability/);
 validateOpenAISchema(object({value:{type:['string','null']}}),true);
});
