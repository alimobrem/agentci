import {ProviderFailure} from './types.ts';

const unsupported=['allOf','oneOf','not','dependentRequired','dependentSchemas','if','then','else','patternProperties','additionalItems','contains','uniqueItems','propertyNames','dependencies'];
const formats=new Set(['date-time','time','date','duration','email','hostname','ipv4','ipv6','uuid']);
const fineTunedUnsupported=['minLength','maxLength','pattern','format','minimum','maximum','exclusiveMinimum','exclusiveMaximum','multipleOf','minItems','maxItems'];
const record=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
/** Structural preflight after portable JSON Schema validation; never rewrite caller semantics. */
export function validateOpenAISchema(schema:Record<string,unknown>,fineTuned=false):void{
 const fail=():never=>{throw new ProviderFailure('unsupported-capability');};
 if(schema.type!=='object'||schema.anyOf!==undefined)fail();
 const schemas=new Set<Record<string,unknown>>();
 let properties=0,enums=0,characters=0,nodes=0;
 const walk=(value:unknown):void=>{
  if(!record(value)||++nodes>50_000)fail();
  const node=value as Record<string,unknown>;schemas.add(node);
  if(unsupported.some(key=>Object.hasOwn(node,key)))fail();
  if(fineTuned&&fineTunedUnsupported.some(key=>Object.hasOwn(node,key)))fail();
  if(node.format!==undefined&&(typeof node.format!=='string'||!formats.has(node.format)))fail();
  const types=Array.isArray(node.type)?node.type:[node.type];
  if(node.type===undefined&&node.$ref===undefined&&node.anyOf===undefined)fail();
  if(types.includes('array')&&!record(node.items))fail();
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
 walk(schema);
 const resolve=(ref:unknown):Record<string,unknown>=>{
  if(typeof ref!=='string'||!ref.startsWith('#'))return fail();
  let pointer:string;try{pointer=decodeURIComponent(ref.slice(1));}catch{return fail();}
  if(pointer==='')return schema;
  if(!pointer.startsWith('/'))return fail();
  let target:unknown=schema;
  for(const segment of pointer.slice(1).split('/')){
   if(/~(?![01])/u.test(segment))return fail();
   const key=segment.replace(/~1/g,'/').replace(/~0/g,'~');
   if(!record(target)||!Object.hasOwn(target,key))return fail();
   target=target[key];
  }
  if(!record(target)||!schemas.has(target))return fail();
  return target;
 };
 // Expand references for depth checks, stopping at recursive back-edges. The
 // provider explicitly supports recursive schemas; do not infinitely unroll them.
 let visits=0;
 const depth=(node:Record<string,unknown>,level:number,path:Set<Record<string,unknown>>):void=>{
  if(++visits>50_000)fail();
  if(path.has(node))return;
  const types=Array.isArray(node.type)?node.type:[node.type];
  const next=level+(types.includes('object')||types.includes('array')?1:0);
  if(next>10)fail();
  path.add(node);
  if(node.$ref!==undefined)depth(resolve(node.$ref),next,path);
  for(const child of Object.values((node.properties??{}) as Record<string,unknown>))depth(child as Record<string,unknown>,next,path);
  if(record(node.items))depth(node.items,next,path);
  for(const child of (node.anyOf??[]) as Record<string,unknown>[])depth(child,next,path);
  path.delete(node);
 };
 depth(schema,0,new Set());
 // Check unused definitions too, including invalid/remote references.
 for(const node of schemas)if(node.$ref!==undefined)resolve(node.$ref);
}
