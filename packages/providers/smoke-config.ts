import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {isAbsolute} from 'node:path';
import type {BudgetScope} from './budget.ts';
export class SmokeConfigError extends Error {constructor(){super('invalid-private-smoke-config');}}
export interface SmokeConfig {authorized:true;provider:'openai'|'anthropic';credentialFile:string;databaseUrlFile:string;budget:BudgetScope}
export async function readPrivateText(path:string):Promise<string>{
 let handle;
 try{
  if(typeof path!=='string'||!isAbsolute(path))throw Error();
  handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);const stat=await handle.stat();
  if(!stat.isFile()||!stat.size||stat.size>65536||(stat.mode&0o077))throw Error();
  const bytes=Buffer.alloc(65537),{bytesRead}=await handle.read(bytes,0,bytes.length,0);
  if(bytesRead>65536)throw Error();
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,bytesRead)).trim();if(!text)throw Error();return text;
 }catch{throw new SmokeConfigError();}finally{await handle?.close();}
}
const exact=(value:any,keys:string[])=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
export async function loadSmokeConfig(path:string):Promise<SmokeConfig>{
 try{
  const value=JSON.parse(await readPrivateText(path));
  if(!exact(value,['authorized','provider','credentialFile','databaseUrlFile','budget'])||value.authorized!==true||!['openai','anthropic'].includes(value.provider)||!exact(value.budget,['id','organizationId','repository','limitUsdMicros']))throw Error();
  for(const key of ['credentialFile','databaseUrlFile'])if(typeof value[key]!=='string'||!isAbsolute(value[key])||/[\x00-\x1f]/.test(value[key]))throw Error();
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,b=value.budget;
  if(typeof b.id!=='string'||!uuid.test(b.id)||typeof b.organizationId!=='string'||!uuid.test(b.organizationId)||typeof b.repository!=='string'||!b.repository.length||b.repository.length>255||!Number.isSafeInteger(b.limitUsdMicros)||b.limitUsdMicros<=0)throw Error();
  return value;
 }catch{throw new SmokeConfigError();}
}
