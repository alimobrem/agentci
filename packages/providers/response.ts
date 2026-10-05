import {Ajv} from 'ajv';
import {createRequire} from 'node:module';
import type {FormatsPlugin} from 'ajv-formats';
import {ProviderFailure,type ModelRequest,type ModelResponse} from './types.ts';
const addFormats:FormatsPlugin=createRequire(import.meta.url)('ajv-formats');
const object=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value:Record<string,unknown>,keys:string[])=>Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const count=(value:unknown)=>value===null||typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
function matches(schema:Record<string,unknown>,value:unknown){const ajv=new Ajv({strict:true,allErrors:false});addFormats(ajv);return ajv.compile(schema)(value);}
/** Treat provider output as untrusted. Unknown usage stays unknown, never zero. */
export function validateModelResponse(value:unknown,request:ModelRequest,attemptId:string):ModelResponse{
 try{
  let nodes=0;
  const visit=(item:unknown,depth:number)=>{
   if(depth>32||++nodes>50000)throw Error();
   if(item===null||typeof item==='string'||typeof item==='boolean')return;
   if(typeof item==='number'&&Number.isFinite(item))return;
   if(Array.isArray(item)){if(Object.keys(item).length!==item.length)throw Error();for(const child of item)visit(child,depth+1);return;}
   if(!object(item))throw Error();for(const child of Object.values(item))visit(child,depth+1);
  };
  visit(value,0);if(Buffer.byteLength(JSON.stringify(value))>1048576||!object(value))throw Error();
  if(!exact(value,['schemaVersion','requestId','attemptId','provider','model','status','text','structuredOutput','toolCalls','usage','providerRequestId']))throw Error();
  if(value.schemaVersion!=='v1alpha1'||value.requestId!==request.requestId||value.attemptId!==attemptId||value.provider!==request.provider||value.model!==request.model)throw Error();
  if(!['completed','refused','incomplete'].includes(value.status as string)||typeof value.text!=='string'||value.text.length>524288)throw Error();
  if(value.providerRequestId!==null&&(typeof value.providerRequestId!=='string'||!value.providerRequestId.length||value.providerRequestId.length>512))throw Error();
  if(!object(value.usage)||!exact(value.usage,['inputTokens','outputTokens','costUsdMicros','costKind','pricingRevision']))throw Error();
  const usage=value.usage;
  if(!count(usage.inputTokens)||!count(usage.outputTokens)||!count(usage.costUsdMicros)||!['reported','estimated','unknown'].includes(usage.costKind as string))throw Error();
  if(usage.pricingRevision!==null&&(typeof usage.pricingRevision!=='string'||!usage.pricingRevision.length||usage.pricingRevision.length>256))throw Error();
  if((usage.costKind==='unknown')!==(usage.costUsdMicros===null)||usage.costKind==='estimated'&&usage.pricingRevision===null)throw Error();
  if(!Array.isArray(value.toolCalls)||value.toolCalls.length>32)throw Error();
  const ids=new Set<string>();
  for(const call of value.toolCalls){
   if(!object(call)||!exact(call,['id','name','arguments'])||typeof call.id!=='string'||!call.id.length||call.id.length>256||ids.has(call.id)||typeof call.name!=='string'||!object(call.arguments))throw Error();
   const tool=request.tools.find(tool=>tool.name===call.name);if(!tool||!matches(tool.inputSchema,call.arguments))throw Error();ids.add(call.id);
  }
  // Partial/refused results may carry text, but cannot carry actionable output.
  if(value.status!=='completed'&&(value.structuredOutput!==null||value.toolCalls.length))throw Error();
  if(value.status==='completed'&&request.responseSchema&&!(value.toolCalls.length&&value.structuredOutput===null)&&!matches(request.responseSchema,value.structuredOutput))throw Error();
  if(!request.responseSchema&&value.structuredOutput!==null)throw Error();
  return structuredClone(value) as unknown as ModelResponse;
 }catch{throw new ProviderFailure('invalid-output',false,'possibly-sent');}
}
