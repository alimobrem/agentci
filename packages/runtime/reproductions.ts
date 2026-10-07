import {open} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {parseReproductionCatalog} from './reproduction-catalog.ts';
const keys=['AGENTCI_REPRODUCTION_CATALOG_FILE','AGENTCI_REPRODUCTION_CATALOG_DIGEST','AGENTCI_REPRODUCTION_CONFIG_REVISION','AGENTCI_REPRODUCTION_CONFIG_DIGEST'] as const;
const fail=():never=>{throw Error('invalid-reproduction-runtime');};
/** Explicit operator opt-in. Loading never applies authority or contacts services. */
export async function loadReproductionRuntime(scope:{organizationId:string;repository:string},env:NodeJS.ProcessEnv=process.env){
 if(keys.every(key=>env[key]===undefined))return null;
 try{
  const path=env.AGENTCI_REPRODUCTION_CATALOG_FILE,hash=env.AGENTCI_REPRODUCTION_CATALOG_DIGEST,configHash=env.AGENTCI_REPRODUCTION_CONFIG_DIGEST,revisionText=env.AGENTCI_REPRODUCTION_CONFIG_REVISION;
  if(!path||!isAbsolute(path)||!hash||!/^sha256:[a-f0-9]{64}$/.test(hash)||!configHash||!/^sha256:[a-f0-9]{64}$/.test(configHash)||!revisionText||! /^[1-9][0-9]*$/.test(revisionText))fail();
  const revision=Number(revisionText);if(!Number.isSafeInteger(revision))fail();
  const evalTaskQueue='agentci-eval-v1';
  const file=await open(path!,'r');let value:unknown;
  try{
   // Bounded read also rejects growth after stat and invalid UTF-8 before parsing.
   if(!(await file.stat()).isFile())fail();
   const limit=32*1024*1024,buffer=Buffer.alloc(limit+1);let size=0;
   while(size<buffer.length){const {bytesRead}=await file.read(buffer,size,buffer.length-size,null);if(!bytesRead)break;size+=bytesRead;}
   if(size>limit)fail();value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,size)));
  }finally{await file.close();}
  return {catalog:parseReproductionCatalog(value,scope,hash!),expected:{revision,digest:configHash!},evalTaskQueue};
 }catch{return fail();}
}
export type ReproductionRuntime=NonNullable<Awaited<ReturnType<typeof loadReproductionRuntime>>>;
