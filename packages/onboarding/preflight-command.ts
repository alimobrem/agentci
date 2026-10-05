import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {PreflightError,validateProviderPreflight,preflightProviders,type ProviderPreflightConfig,type PreflightCheck} from './preflight.ts';
import {validMountConfig,preflightMount,type MountPreflightConfig} from './mount-preflight.ts';
interface DeploymentConfig extends MountPreflightConfig {url:string}
export interface PreflightConfig {deployment:DeploymentConfig|null;providers:ProviderPreflightConfig['providers'];liveTests:ProviderPreflightConfig['liveTests']|null}
const keys=(value:any,expected:string[])=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...expected].sort().join(',');
export function validatePreflightConfig(value:any):PreflightConfig{
 if(!keys(value,['deployment','providers','liveTests'])||!Array.isArray(value.providers)||(!value.providers.length&&!value.deployment))throw new PreflightError('invalid-preflight-config');
 if(value.providers.length)validateProviderPreflight({providers:value.providers,liveTests:value.liveTests});
 else if(value.liveTests!==null)throw new PreflightError('unexpected-live-test-budget');
 if(value.deployment!==null){
  const deployment=value.deployment;
  if(!keys(deployment,['engine','image','directory','files','url'])||!validMountConfig(deployment))throw new PreflightError('invalid-mount-probe-config');
  try{
   if(typeof deployment.url!=='string')throw new Error();
   const url=new URL(deployment.url);
   if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash||url.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Error();
  }catch{throw new PreflightError('invalid-readiness-origin');}
 }
 return value;
}
export async function loadPreflightConfig(path:string):Promise<PreflightConfig>{
 let handle;
 try{
  handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);const stat=await handle.stat();
  if(!stat.isFile()||stat.size>65536||(stat.mode&0o077))throw new Error();
  const bytes=Buffer.alloc(65537);const {bytesRead}=await handle.read(bytes,0,bytes.length,0);
  if(bytesRead>65536)throw new Error();
  return validatePreflightConfig(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,bytesRead))));
 }catch(error){if(error instanceof PreflightError)throw error;throw new PreflightError('invalid-private-preflight-config');}finally{await handle?.close();}
}
export async function checkReadiness(origin:string,request:typeof fetch=fetch):Promise<PreflightCheck>{
 const failed:PreflightCheck={id:'deployment:readiness',passed:false,code:'service-not-ready'};
 let response:Response|undefined;
 try{
  response=await request(new URL('/readyz',origin),{method:'GET',redirect:'error',credentials:'omit',signal:AbortSignal.timeout(5000)});
  if(response.status!==200||!response.body)return failed;
  const reader=response.body.getReader();let size=0;const chunks:Uint8Array[]=[];
  try{for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>1024)return failed;chunks.push(chunk.value);}}finally{await reader.cancel();reader.releaseLock();}
  if(JSON.parse(Buffer.concat(chunks).toString('utf8')).status!=='ready')return failed;
  return {id:'deployment:readiness',passed:true,code:'service-ready'};
 }catch{return failed;}finally{await response?.body?.cancel().catch(()=>{});}
}
export async function runPreflight(value:unknown,options:{providers?:typeof preflightProviders;mount?:typeof preflightMount;readiness?:typeof checkReadiness}={}){
 const config=validatePreflightConfig(value),checks:PreflightCheck[]=[];
 if(config.deployment){
  const mount=await (options.mount??preflightMount)(config.deployment);checks.push(mount);
  if(mount.passed)checks.push(await (options.readiness??checkReadiness)(config.deployment.url));
 }
 if(checks.every(check=>check.passed)&&config.providers.length){const providers=await (options.providers??preflightProviders)({providers:config.providers,liveTests:config.liveTests});checks.push(...providers.checks);}
 return {passed:checks.length>0&&checks.every(check=>check.passed),checks,paidRequestsMade:false,requestedScope:{deployment:!!config.deployment,providers:config.providers.map(provider=>provider.provider)}};
}
