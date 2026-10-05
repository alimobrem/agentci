import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {Ajv} from 'ajv';
import type {FormatsPlugin} from 'ajv-formats';
import {ProviderFailure,type ModelRequest,type ModelProvider} from './types.ts';
const ajv=new Ajv({strict:true,allErrors:false});
const addFormats:FormatsPlugin=createRequire(import.meta.url)('ajv-formats');addFormats(ajv);
export const modelRequestSchema=JSON.parse(readFileSync(new URL('./json/model-request.schema.json',import.meta.url),'utf8'));
const validate=ajv.compile(modelRequestSchema);
export function validateModelRequest(value:unknown):ModelRequest{
 try{
  // Bound nested extension/schema data before recursive schema compilation or provider dispatch.
  let nodes=0;
  const visit=(node:unknown,depth:number)=>{
   if(depth>32||++nodes>50000)throw new Error();
   if(node===null||typeof node==='string'||typeof node==='boolean')return;
   if(typeof node==='number'){if(!Number.isFinite(node))throw new Error();return;}
   if(typeof node!=='object')throw new Error();
   if(Array.isArray(node)){if(Object.keys(node).length!==node.length)throw new Error();for(const item of node)visit(item,depth+1);}
   else{if(![Object.prototype,null].includes(Object.getPrototypeOf(node)))throw new Error();for(const item of Object.values(node))visit(item,depth+1);}
  };visit(value,0);
  const encoded=JSON.stringify(value);if(Buffer.byteLength(encoded)>1048576)throw new Error();
  if(!validate(value))throw new Error();
  const request=value as ModelRequest;
  if(request.policy.baseDelayMs>request.policy.maxDelayMs||new Set(request.tools.map(tool=>tool.name)).size!==request.tools.length)throw new Error();
  const callIds=new Set<string>(),pending=new Set<string>();
  for(const message of request.messages){
   if((message.role==='tool')!==('toolCallId' in message)||message.toolCalls&&message.role!=='assistant')throw new Error();
   for(const call of message.toolCalls??[]){if(callIds.has(call.id))throw new Error();callIds.add(call.id);pending.add(call.id);}
   if(message.role==='tool'&&!pending.delete(message.toolCallId!))throw new Error();
  }
  if(pending.size)throw new Error();
  for(const schema of [...request.tools.map(tool=>tool.inputSchema),...(request.responseSchema?[request.responseSchema]:[])]){const schemaValidator=new Ajv({strict:true,allErrors:false});addFormats(schemaValidator);schemaValidator.compile(schema);}
  return structuredClone(request);
 }catch{throw new ProviderFailure('invalid-request');}
}
export function assertProviderCapabilities(provider:ModelProvider,request:ModelRequest,stream=false){
 if(provider.id!==request.provider||!provider.upstreamIdentity)throw new ProviderFailure('invalid-request');
 const capabilities=provider.capabilities();
 if(stream&&!capabilities.stream||(request.tools.length||request.messages.some(message=>message.role==='tool'||message.toolCalls))&&!capabilities.tools||request.responseSchema&&!capabilities.structuredOutput||request.developer&&!capabilities.developerInstructions||Object.keys(request.providerExtensions[provider.id]??{}).length&&!capabilities.extensions)throw new ProviderFailure('unsupported-capability');
}
