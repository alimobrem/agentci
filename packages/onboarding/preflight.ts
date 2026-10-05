import {lstat,open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {isAbsolute} from 'node:path';

export const providerOrigins = {openai:'https://api.openai.com',anthropic:'https://api.anthropic.com',xai:'https://api.x.ai'} as const;
export type PreflightProvider = keyof typeof providerOrigins;
export interface ProviderPreflightConfig {
  providers: {provider:PreflightProvider; endpoint:string; credentialFile:string}[];
  liveTests: {authorized:boolean; maxSpendUsdMicros:number};
}
export interface PreflightCheck {id:string;passed:boolean;code:string}
export interface PreflightResult {passed:boolean;checks:PreflightCheck[];paidRequestsMade:false}
export class PreflightError extends Error {constructor(public readonly code:string){super(code);this.name='PreflightError';}}
function exactKeys(value:unknown, keys:string[]):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');}
export function validateProviderPreflight(value:unknown):ProviderPreflightConfig {
 if(!exactKeys(value,['providers','liveTests'])||!Array.isArray(value.providers)||!value.providers.length||value.providers.length>3||!exactKeys(value.liveTests,['authorized','maxSpendUsdMicros']))throw new PreflightError('invalid-preflight-config');
 const budget=value.liveTests;
 if(budget.authorized!==true||!Number.isSafeInteger(budget.maxSpendUsdMicros)||Number(budget.maxSpendUsdMicros)<=0)throw new PreflightError('live-test-budget-not-authorized');
 const seen=new Set<string>();
 for(const provider of value.providers){
  if(!exactKeys(provider,['provider','endpoint','credentialFile'])||typeof provider.provider!=='string'||!Object.hasOwn(providerOrigins,provider.provider)||seen.has(provider.provider))throw new PreflightError('invalid-provider-selection');
  seen.add(provider.provider);
  if(typeof provider.credentialFile!=='string'||!isAbsolute(provider.credentialFile)||/[\x00-\x1f]/.test(provider.credentialFile))throw new PreflightError('invalid-credential-reference');
  try{
   if(typeof provider.endpoint!=='string')throw new Error();
   const endpoint=new URL(provider.endpoint),origin=providerOrigins[provider.provider as PreflightProvider];
   if(endpoint.origin!==origin||endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.pathname!=='/'||endpoint.search||endpoint.hash)throw new Error();
  }catch{throw new PreflightError('provider-endpoint-not-authorized');}
 }
 return value as unknown as ProviderPreflightConfig;
}
export async function checkCredentialReference(path:string):Promise<boolean>{
 let handle;
 try{
  const before=await lstat(path);
  if(!before.isFile()||before.isSymbolicLink()||before.size===0||before.size>65536||(before.mode&0o077)!==0)return false;
  handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  const actual=await handle.stat();
  return actual.isFile()&&actual.ino===before.ino&&actual.dev===before.dev&&actual.size>0&&actual.size<=65536&&(actual.mode&0o077)===0;
 }catch{return false;}finally{await handle?.close();}
}
export async function preflightProviders(value:unknown, options:{request?:typeof fetch;credentialCheck?:(path:string)=>Promise<boolean>}={}):Promise<PreflightResult>{
 const config=validateProviderPreflight(value),checks:PreflightCheck[]=[];
 const credentialCheck=options.credentialCheck??checkCredentialReference;
 for(const provider of config.providers){
  let passed=false;try{passed=await credentialCheck(provider.credentialFile);}catch{}
  checks.push({id:`${provider.provider}:credential`,passed,code:passed?'private-file-readable':'credential-file-unavailable-or-insecure'});
 }
 // Complete all local validation before making any outbound request. Never read or send key contents.
 if(checks.some(check=>!check.passed))return {passed:false,checks,paidRequestsMade:false};
 const request=options.request??fetch;
 for(const provider of config.providers){
  let passed=false;
  try{
   const response=await request(providerOrigins[provider.provider],{method:'HEAD',redirect:'error',signal:AbortSignal.timeout(5000),credentials:'omit'});
   passed=response.status>=200&&response.status<500&&response.status!==429;
   await response.body?.cancel();
  }catch{}
  checks.push({id:`${provider.provider}:connectivity`,passed,code:passed?'endpoint-reachable-authentication-unverified':'endpoint-unavailable'});
 }
 return {passed:checks.every(check=>check.passed),checks,paidRequestsMade:false};
}
