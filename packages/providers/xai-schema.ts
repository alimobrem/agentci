import {ProviderFailure} from './types.ts';
const object=(v:unknown):v is Record<string,any>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
/** Reject documented upstream errors; accepted best-effort constraints remain locally enforced. */
export function validateXAISchema(root:Record<string,unknown>):void{
 const fail=():never=>{throw new ProviderFailure('unsupported-capability');};let visits=0;
 const resolve=(ref:unknown):unknown=>{
  if(typeof ref!=='string'||!ref.startsWith('#'))return fail();let pointer:string;
  try{pointer=decodeURIComponent(ref.slice(1));}catch{return fail();}
  if(!pointer)return root;if(!pointer.startsWith('/'))return fail();let target:unknown=root;
  for(const part of pointer.slice(1).split('/')){if(/~(?![01])/u.test(part))return fail();const key=part.replace(/~1/g,'/').replace(/~0/g,'~');if(!object(target)||!Object.hasOwn(target,key))return fail();target=target[key];}return target;
 };
 const walk=(value:unknown,path:Set<object>):void=>{
  if(!object(value)||++visits>50000||path.has(value))fail();const node=value as Record<string,any>;
  if(node.enum?.length===0||node.anyOf?.length===0||Object.hasOwn(node,'minContains')||Object.hasOwn(node,'maxContains')||Array.isArray(node.items))fail();
  if(typeof node.pattern==='string'){
   // Consume escaped pairs, so a literal backslash followed by b is not a boundary.
   for(let i=0;i<node.pattern.length;i++){
    if(node.pattern[i]==='\\'){if(/[1-9kKpPbB]/u.test(node.pattern[++i]??''))fail();}
    else if(node.pattern[i]==='('&&node.pattern[i+1]==='?'&&node.pattern[i+2]!==':')fail();
   }
  }
  path.add(node);
  if(node.$ref!==undefined)walk(resolve(node.$ref),path);
  for(const key of ['properties','patternProperties','$defs','definitions','dependentSchemas'])for(const child of Object.values(node[key]??{}))walk(child,path);
  for(const key of ['items','contains','not','if','then','else'])if(node[key]!==undefined)walk(node[key],path);
  if(object(node.additionalProperties))walk(node.additionalProperties,path);
  for(const key of ['anyOf','oneOf','allOf'])for(const child of node[key]??[])walk(child,path);
  path.delete(node);
 };
 walk(root,new Set());
}
