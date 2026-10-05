import {ProviderFailure} from './types.ts';
const object=(v:unknown):v is Record<string,any>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const unsupported=['minimum','maximum','exclusiveMinimum','exclusiveMaximum','multipleOf','minLength','maxLength','maxItems','uniqueItems','contains','additionalItems','patternProperties','propertyNames','oneOf','not','if','then','else','dependencies','dependentSchemas','dependentRequired'];
const formats=new Set(['date-time','time','date','duration','email','hostname','uri','ipv4','ipv6','uuid']);
/** Preflight explicit provider limits across the entire strict request, without schema rewriting. */
export function validateAnthropicSchemas(tools:Record<string,unknown>[],output:Record<string,unknown>|null):void{
 const fail=():never=>{throw new ProviderFailure('unsupported-capability');};
 if(tools.length>20)fail();let optional=0,unions=0,visits=0;
 for(const root of [...tools,...(output?[output]:[])]){
  const counted=new Set<object>();
  const resolve=(ref:unknown):unknown=>{
   if(typeof ref!=='string'||!ref.startsWith('#'))return fail();
   let pointer:string;try{pointer=decodeURIComponent(ref.slice(1));}catch{return fail();}
   if(!pointer)return root;if(!pointer.startsWith('/'))return fail();let target:unknown=root;
   for(const part of pointer.slice(1).split('/')){if(/~(?![01])/u.test(part))return fail();const key=part.replace(/~1/g,'/').replace(/~0/g,'~');if(!object(target)||!Object.hasOwn(target,key))return fail();target=target[key];}return target;
  };
  const walk=(value:unknown,path:Set<object>,inAllOf=false):void=>{
   if(!object(value)||++visits>50000||path.has(value))fail();const node=value as Record<string,any>;
   if(unsupported.some(key=>Object.hasOwn(node,key))||node.minItems!==undefined&&![0,1].includes(node.minItems)||node.format!==undefined&&!formats.has(node.format))fail();
   if(node.enum?.some((v:unknown)=>v!==null&&typeof v==='object'))fail();
   if(typeof node.pattern==='string'&&(/\\[1-9bB]|\(\?[=!<]/u.test(node.pattern)))fail();
   const types=Array.isArray(node.type)?node.type:[node.type];
   if(types.includes('object')&&node.additionalProperties!==false)fail();
   if(!counted.has(node)){
    counted.add(node);const required=node.required??[];
    optional+=Object.keys(node.properties??{}).filter(key=>!required.includes(key)).length;
    if(node.anyOf!==undefined||Array.isArray(node.type))unions++;
    if(optional>24||unions>16)fail();
   }
   path.add(node);
   if(node.$ref!==undefined){if(inAllOf)fail();walk(resolve(node.$ref),path,inAllOf);}
   for(const child of Object.values(node.properties??{}))walk(child,path,inAllOf);
   for(const name of ['$defs','definitions'])for(const child of Object.values(node[name]??{}))walk(child,path,inAllOf);
   if(node.items!==undefined)walk(node.items,path,inAllOf);
   for(const child of node.anyOf??[])walk(child,path,inAllOf);
   for(const child of node.allOf??[])walk(child,path,true);
   path.delete(node);
  };
  walk(root,new Set());
 }
}
