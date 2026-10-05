import {ProviderFailure} from './types.ts';

const unsupported=['allOf','not','dependentRequired','dependentSchemas','if','then','else'];
const record=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
/** Structural preflight after portable JSON Schema validation; never rewrite caller semantics. */
export function validateOpenAISchema(schema:Record<string,unknown>):void{
 const fail=():never=>{throw new ProviderFailure('unsupported-capability');};
 if(schema.type!=='object'||schema.anyOf!==undefined)fail();
 let properties=0,enums=0,characters=0,nodes=0;
 const walk=(value:unknown):void=>{
  if(!record(value)||++nodes>50_000)fail();
  const node=value as Record<string,unknown>;
  if(unsupported.some(key=>Object.hasOwn(node,key)))fail();
  const types=Array.isArray(node.type)?node.type:[node.type];
  if(types.includes('object')||node.properties!==undefined){
   if(node.additionalProperties!==false||node.properties!==undefined&&!record(node.properties))fail();
   const names=Object.keys((node.properties??{}) as Record<string,unknown>);
   const required=node.required??[];
   if(!Array.isArray(required)||required.length!==names.length||new Set(required).size!==names.length||names.some(name=>!required.includes(name)))fail();
   properties+=names.length;characters+=names.reduce((sum,name)=>sum+name.length,0);
   for(const child of Object.values((node.properties??{}) as Record<string,unknown>))walk(child);
  }
  if(node.$defs!==undefined){
   if(!record(node.$defs))fail();
   for(const [name,child] of Object.entries(node.$defs as Record<string,unknown>)){characters+=name.length;walk(child);}
  }
  if(node.anyOf!==undefined){if(!Array.isArray(node.anyOf))fail();for(const child of node.anyOf as unknown[])walk(child);}
  if(node.items!==undefined)walk(node.items);
  if(Array.isArray(node.enum)){
   enums+=node.enum.length;
   const length=node.enum.reduce<number>((sum,item)=>sum+(typeof item==='string'?item.length:0),0);
   characters+=length;if(node.enum.length>250&&length>15_000)fail();
  }
  if(typeof node.const==='string')characters+=node.const.length;
  if(properties>5000||enums>1000||characters>120_000)fail();
 };
 // References are already resolved/validated by portable AJV compilation. Visit
 // definitions once rather than expanding recursive references indefinitely.
 walk(schema);
}
