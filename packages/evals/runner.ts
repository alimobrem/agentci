import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { adapterCommand } from './adapters.ts';
import { RUNNER_BOOTSTRAP } from './bootstrap.ts';
import { safeEvalPath, validateEvalSuite, type EvalSuite } from './contracts.ts';
import type { Snapshot } from '../review/types.ts';
const execute=promisify(execFile);
function streamDocker(args:string[],input:string,signal:AbortSignal|undefined,limit:number,timeout:number):Promise<string> {
  return new Promise((resolve,reject)=>{
    const child=spawn('docker',args,{signal,stdio:['pipe','pipe','pipe']});
    let bytes=0,stdout='',failure:Error|undefined;
    const timer=setTimeout(()=>{failure=new Error('Docker client timeout');child.kill('SIGKILL');},timeout);
    child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>limit){failure=new Error('Runner envelope exceeds limit');child.kill('SIGKILL');}else stdout+=chunk;});
    child.stderr.on('data',chunk=>{bytes+=chunk.length;if(bytes>limit){failure=new Error('Runner envelope exceeds limit');child.kill('SIGKILL');}});
    child.on('error',error=>{failure=error;});
    child.stdin.on('error',()=>{failure??=new Error('Runner input unavailable');});
    child.on('close',code=>{clearTimeout(timer);if(failure||code!==0)reject(failure??new Error('Docker runner failed'));else resolve(stdout.trim());});
    child.stdin.end(input);
  });
}
export interface RunnerPolicy { image:string; memoryMb?:number; cpus?:number; pids?:number }
export interface RunnerResult {
  sourceSha:string; image:string; status:'completed'|'timeout'|'cancelled'|'error';
  exitCode:number|null; signal?:string|null; stdoutDigest?:string; stderrDigest?:string;
  latencyMs?:number; report?:string; reportError?:string; error?:string;
}
export function validateRunnerPolicy(policy:RunnerPolicy):Required<RunnerPolicy> {
  if(!/^(?:sha256:[a-f0-9]{64}|[a-z0-9][a-z0-9._/:~-]*@sha256:[a-f0-9]{64})$/.test(policy.image))throw new Error('Runner image must be an operator-pinned digest');
  const limits={image:policy.image,memoryMb:policy.memoryMb??512,cpus:policy.cpus??1,pids:policy.pids??128};
  if(!Number.isSafeInteger(limits.memoryMb)||limits.memoryMb<64||limits.memoryMb>4096||!Number.isFinite(limits.cpus)||limits.cpus<0.1||limits.cpus>4||!Number.isSafeInteger(limits.pids)||limits.pids<16||limits.pids>256)throw new Error('Invalid runner resource limits');
  return limits;
}
export function snapshotInputs(snapshot:Snapshot):[string,string][] {
  if(!/^[a-f0-9]{40}$/.test(snapshot.sha))throw new Error('Exact snapshot commit required');
  const entries=Object.entries(snapshot.files);if(!entries.length||entries.length>10000)throw new Error('Invalid snapshot file count');
  let bytes=0;
  for(const [path,text] of entries){
    if(!safeEvalPath(path)||typeof text!=='string'||text.includes('\0'))throw new Error('Invalid snapshot path/content');
    const parts=path.split('/'),name=parts.at(-1)!;
    if(parts.some(p=>['.git','.ssh','.aws','node_modules'].includes(p))||path.startsWith('.agentci/local/')||/^\.env(?:\.|$)/.test(name)||['.npmrc','.pypirc','.netrc','id_rsa','id_ed25519'].includes(name)||/\.(?:pem|key)$/i.test(name))throw new Error('Credential or dependency directory is not an eval input');
    const size=Buffer.byteLength(text);bytes+=size;
    if(size>2*1024*1024||bytes>32*1024*1024)throw new Error('Snapshot exceeds runner content limits');
  }
  return entries;
}
/** Runs an immutable data snapshot in a disposable container; never executes PR code on the controller. */
export async function runIsolated(snapshot:Snapshot,value:EvalSuite,policyValue:RunnerPolicy,options:{signal?:AbortSignal;model?:string}={}):Promise<RunnerResult> {
  const suite=validateEvalSuite(value),policy=validateRunnerPolicy(policyValue),inputs=snapshotInputs(snapshot);
  if(options.model!==undefined&&(!suite.spec.models?.includes(options.model)||!/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$/.test(options.model)))throw new Error('Unconfigured model variant');
  const identity={sourceSha:snapshot.sha,image:policy.image},cancelled=():RunnerResult=>({...identity,status:'cancelled',exitCode:null,error:'cancelled'});
  if(options.signal?.aborted)return cancelled();
  const name=`agentci-eval-${randomUUID()}`, payload=JSON.stringify(Object.fromEntries(inputs));
  if(Buffer.byteLength(payload)>64*1024*1024)throw new Error('Serialized snapshot exceeds input limit');
  const maxOutputBytes=suite.spec.runner.maxOutputBytes??1024*1024;
  const docker=async(args:string[],signal?:AbortSignal,maxBuffer=65536,timeout=30000)=>(await execute('docker',args,{encoding:'utf8',timeout,maxBuffer,signal})).stdout.trim();
  let createAttempted=false;
  try{
    const config={argv:adapterCommand(suite),report:suite.spec.runner.report,timeoutMs:suite.spec.runner.timeoutMs,maxOutputBytes,model:options.model};
    createAttempted=true;
    // Finish creation before observing cancellation, so cleanup cannot race a still-pending daemon create.
    await docker(['create','--interactive','--name',name,'--label','agentci.purpose=eval-runner','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--user','1001:0','--pids-limit',String(policy.pids),'--memory',`${policy.memoryMb}m`,'--memory-swap',`${policy.memoryMb}m`,'--cpus',String(policy.cpus),'--workdir','/workspace','--tmpfs','/workspace:rw,nosuid,nodev,size=128m,mode=0700,uid=1001,gid=0','--tmpfs','/tmp:rw,nosuid,nodev,size=64m,mode=0700,uid=1001,gid=0','--entrypoint','node',policy.image,'--input-type=module','-e',RUNNER_BOOTSTRAP,'--',JSON.stringify(config)]);
    if(options.signal?.aborted)return cancelled();
    const raw=await streamDocker(['start','--attach','--interactive',name],payload,options.signal,maxOutputBytes*6+65536,suite.spec.runner.timeoutMs+30000);
    const result=JSON.parse(raw);
    const keys=['status','exitCode','signal','stdoutDigest','stderrDigest','latencyMs','report','reportError','error'];
    if(!result||Object.keys(result).some(k=>!keys.includes(k))||!['completed','timeout','error'].includes(result.status)||
      (result.exitCode!==null&&(!Number.isInteger(result.exitCode)||result.exitCode<0||result.exitCode>255))||
      !['stdoutDigest','stderrDigest'].every(k=>/^sha256:[a-f0-9]{64}$/.test(result[k]))||
      !Number.isFinite(result.latencyMs)||result.latencyMs<0||
      (result.report!==undefined&&(typeof result.report!=='string'||Buffer.byteLength(result.report)>maxOutputBytes)))throw new Error('Invalid isolated runner envelope');
    return {...result,...identity};
  }catch{
    if(options.signal?.aborted)return cancelled();
    return {...identity,status:'error',exitCode:null,error:'runner-infrastructure'};
  }finally{
    // A cancelled Docker client must not leave its untrusted container running.
    let cleanupFailed=false;
    if(createAttempted)try{await docker(['rm','--force','--volumes',name]);}catch(error){cleanupFailed=!String(error).includes('No such container');}
    if(cleanupFailed)throw new Error('Runner cleanup failed; operator intervention required');
  }
}
