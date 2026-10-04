import {setTimeout as delay} from 'node:timers/promises';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { adapterCommand } from './adapters.ts';
import { RUNNER_BOOTSTRAP } from './bootstrap.ts';
import { safeEvalPath, validateEvalSuite, type EvalSuite } from './contracts.ts';
import type { Snapshot } from '../review/types.ts';
import type {HttpProviderPolicy} from './http.ts';
const execute=promisify(execFile);
// Untrusted code cannot extend cancellation by ignoring TERM during Podman's default stop grace.
const removeContainerArgs=(engine:ContainerEngine,id:string)=>['rm','--force',...(engine==='podman'?['--time','0']:[]),'--volumes',id];
function streamContainer(engine:ContainerEngine,args:string[],input:string,signal:AbortSignal|undefined,limit:number,timeout:number):Promise<string> {
  return new Promise((resolve,reject)=>{
    // Podman proxies SIGTERM into the container instead of promptly exiting its attached client.
    // Kill only the client on abort; fenced owner cleanup below removes the untrusted container.
    const child=spawn(engine,args,{signal,killSignal:'SIGKILL',stdio:['pipe','pipe','pipe']});
    let bytes=0,stdout='',failure:Error|undefined;
    const timer=setTimeout(()=>{failure=new Error('Container client timeout');child.kill('SIGKILL');},timeout);
    child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>limit){failure=new Error('Runner envelope exceeds limit');child.kill('SIGKILL');}else stdout+=chunk;});
    child.stderr.on('data',chunk=>{bytes+=chunk.length;if(bytes>limit){failure=new Error('Runner envelope exceeds limit');child.kill('SIGKILL');}});
    child.on('error',error=>{failure=error;});
    child.stdin.on('error',()=>{failure??=new Error('Runner input unavailable');});
    child.on('close',code=>{clearTimeout(timer);if(failure||code!==0)reject(failure??new Error('Container runner failed'));else resolve(stdout.trim());});
    child.stdin.end(input);
  });
}
export type ContainerEngine='podman'|'docker';
/** Operator-owned fixed executable selection. Never accept a path or command from repository inputs. */
export function containerEngine(value:unknown=process.env.AGENTCI_CONTAINER_ENGINE??'docker'):ContainerEngine {
  if(value!=='podman'&&value!=='docker')throw new Error('Invalid operator container engine');
  return value;
}
export interface RunnerPolicy { image:string; engine?:ContainerEngine; memoryMb?:number; cpus?:number; pids?:number; httpProviders?:HttpProviderPolicy[] }
export interface EvalOwnership {unitId:string;leaseToken:string}
function validateOwnership(owner:EvalOwnership):void {
  if(!owner||Object.keys(owner).some(k=>!['unitId','leaseToken'].includes(k))||![owner.unitId,owner.leaseToken].every(value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)))throw new Error('Invalid eval container ownership');
}
/** The caller must hold the current fenced database lease before reaping prior owners. */
export async function reapPriorEvalContainers(owner:EvalOwnership,engine:ContainerEngine=containerEngine()):Promise<number> {
  validateOwnership(owner);
  return reapOwnedEvalContainers(owner.unitId,containerEngine(engine),owner.leaseToken);
}
/** Caller must first verify immutable cancelled state in its scoped SQL store. No active lease is reclaimed. */
export async function reapCancelledEvalContainers(unitId:string,engine:ContainerEngine=containerEngine()):Promise<number>{
  if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(unitId))throw new Error('Invalid cancelled container ownership');
  return reapOwnedEvalContainers(unitId,containerEngine(engine));
}
async function reapOwnedEvalContainers(unitId:string,engine:ContainerEngine,keepLease?:string):Promise<number>{
  const container=async(args:string[])=>(await execute(engine,args,{encoding:'utf8',timeout:30000,maxBuffer:1024*1024})).stdout.trim();
  const ids=(await container(['ps','--all','--quiet','--no-trunc','--filter','label=agentci.purpose=eval-runner','--filter',`label=agentci.eval.unit=${unitId}`])).split('\n').filter(Boolean);
  let removed=0;
  for(const id of ids){
    if(!/^[a-f0-9]{64}$/.test(id))throw new Error('Invalid orphan container identity');
    let labels:Record<string,string>;
    try{labels=JSON.parse(await container(['inspect','--format','{{json .Config.Labels}}',id]));}
    catch{if(!(await container(['ps','--all','--quiet','--no-trunc','--filter',`id=${id}`])))continue;throw new Error('Cannot verify orphan container ownership');}
    if(labels['agentci.purpose']!=='eval-runner'||labels['agentci.eval.unit']!==unitId||!labels['agentci.eval.lease'])throw new Error('Invalid orphan container ownership');
    if(keepLease&&labels['agentci.eval.lease']===keepLease)continue;
    // Another recovery caller or the original runner may already be removing this exact owner.
    for(let attempt=0;attempt<5;attempt++){
      try{await container(removeContainerArgs(engine,id));break;}
      catch{if(!(await container(['ps','--all','--quiet','--no-trunc','--filter',`id=${id}`])))break;if(attempt===4)throw new Error('Orphan container cleanup failed');await delay(100);}
    }
    if(await container(['ps','--all','--quiet','--no-trunc','--filter',`id=${id}`]))throw new Error('Orphan container cleanup failed');
    removed++;
  }
  return removed;
}
export interface RunnerResult {
  sourceSha:string; image?:string; provider?:{id:string;revision:string}; status:'completed'|'timeout'|'cancelled'|'error';
  exitCode:number|null; signal?:string|null; stdoutDigest?:string; stderrDigest?:string;
  latencyMs?:number; report?:string; reportError?:string; error?:string;
}
export function validateRunnerPolicy(policy:RunnerPolicy):Required<Omit<RunnerPolicy,'httpProviders'>> {
  if(!/^(?:sha256:[a-f0-9]{64}|[a-z0-9][a-z0-9._/:~-]*@sha256:[a-f0-9]{64})$/.test(policy.image))throw new Error('Runner image must be an operator-pinned digest');
  const limits={engine:containerEngine(policy.engine),image:policy.image,memoryMb:policy.memoryMb??512,cpus:policy.cpus??1,pids:policy.pids??128};
  if(!Number.isSafeInteger(limits.memoryMb)||limits.memoryMb<64||limits.memoryMb>4096||!Number.isFinite(limits.cpus)||limits.cpus<0.1||limits.cpus>4||!Number.isSafeInteger(limits.pids)||limits.pids<16||limits.pids>256)throw new Error('Invalid runner resource limits');
  return limits;
}
export function protectedEvalInput(path:string):boolean {
  const parts=path.split('/'),name=parts.at(-1)!;
  return parts.some(p=>['.git','.ssh','.aws','node_modules'].includes(p))||path.startsWith('.agentci/local/')||/^\.env(?:\.|$)/.test(name)||['.npmrc','.pypirc','.netrc','id_rsa','id_ed25519'].includes(name)||/\.(?:pem|key)$/i.test(name);
}
/** Explicit projection for orchestration. Omitted tracked credential/template paths are retained as provenance. */
export function projectEvalInputs(snapshot:Snapshot):{snapshot:Snapshot;omitted:string[]} {
  const files:Record<string,string>={},omitted:string[]=[];
  const entries=Object.entries(snapshot.files);if(entries.length>10000)throw new Error('Invalid snapshot file count');let bytes=0;
  for(const [path,text] of entries){
    if(!safeEvalPath(path)||typeof text!=='string'||text.includes('\0'))throw new Error('Invalid snapshot path/content');
    const size=Buffer.byteLength(text);bytes+=size;if(size>2*1024*1024||bytes>32*1024*1024)throw new Error('Snapshot exceeds runner content limits');
    if(protectedEvalInput(path))omitted.push(path);else Object.defineProperty(files,path,{value:text,enumerable:true,writable:true,configurable:true});
  }
  const projected={sha:snapshot.sha,files};snapshotInputs(projected);
  return {snapshot:projected,omitted:omitted.sort()};
}
export function snapshotInputs(snapshot:Snapshot):[string,string][] {
  if(!/^[a-f0-9]{40}$/.test(snapshot.sha))throw new Error('Exact snapshot commit required');
  const entries=Object.entries(snapshot.files);if(!entries.length||entries.length>10000)throw new Error('Invalid snapshot file count');
  let bytes=0;
  for(const [path,text] of entries){
    if(!safeEvalPath(path)||typeof text!=='string'||text.includes('\0'))throw new Error('Invalid snapshot path/content');
    if(protectedEvalInput(path))throw new Error('Credential or dependency directory is not an eval input');
    const size=Buffer.byteLength(text);bytes+=size;
    if(size>2*1024*1024||bytes>32*1024*1024)throw new Error('Snapshot exceeds runner content limits');
  }
  return entries;
}
/** Runs an immutable data snapshot in a disposable container; never executes PR code on the controller. */
export async function runIsolated(snapshot:Snapshot,value:EvalSuite,policyValue:RunnerPolicy,options:{signal?:AbortSignal;model?:string;ownership?:EvalOwnership}={}):Promise<RunnerResult> {
  const suite=validateEvalSuite(value),policy=validateRunnerPolicy(policyValue),inputs=snapshotInputs(snapshot),engine=policy.engine;
  if(options.ownership)validateOwnership(options.ownership);
  if(options.model!==undefined&&(!suite.spec.models?.includes(options.model)||!/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$/.test(options.model)))throw new Error('Unconfigured model variant');
  const identity={sourceSha:snapshot.sha,image:policy.image},cancelled=():RunnerResult=>({...identity,status:'cancelled',exitCode:null,error:'cancelled'});
  if(options.signal?.aborted)return cancelled();
  const name=`agentci-eval-${randomUUID()}`, payload=JSON.stringify(Object.fromEntries(inputs));
  if(Buffer.byteLength(payload)>64*1024*1024)throw new Error('Serialized snapshot exceeds input limit');
  const maxOutputBytes=suite.spec.runner.maxOutputBytes??1024*1024;
  const container=async(args:string[],signal?:AbortSignal,maxBuffer=65536,timeout=30000)=>(await execute(engine,args,{encoding:'utf8',timeout,maxBuffer,signal})).stdout.trim();
  let createAttempted=false;
  try{
    const config={argv:adapterCommand(suite),report:suite.spec.runner.report,timeoutMs:suite.spec.runner.timeoutMs,maxOutputBytes,model:options.model};
    createAttempted=true;
    const ownerLabels=options.ownership?['--label',`agentci.eval.unit=${options.ownership.unitId}`,'--label',`agentci.eval.lease=${options.ownership.leaseToken}`]:[];
    // Podman's tmpfs ownership is expressed through --mount U, rather than Docker's uid/gid options.
    // Both engines retain private non-root 0700 scratch storage and nosuid/nodev mounts.
    const scratch=engine==='podman'
      ?['--mount','type=tmpfs,destination=/workspace,tmpfs-size=128m,tmpfs-mode=0700,U=true,tmpcopyup=false','--mount','type=tmpfs,destination=/tmp,tmpfs-size=64m,tmpfs-mode=0700,U=true,tmpcopyup=false']
      :['--tmpfs','/workspace:rw,nosuid,nodev,size=128m,mode=0700,uid=1001,gid=0','--tmpfs','/tmp:rw,nosuid,nodev,size=64m,mode=0700,uid=1001,gid=0'];
    // Finish creation before observing cancellation, so cleanup cannot race a still-pending daemon create.
    await container(['create','--interactive','--name',name,'--label','agentci.purpose=eval-runner','--label',`agentci.runner.image=${policy.image}`,...ownerLabels,'--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--user','1001:0','--pids-limit',String(policy.pids),'--memory',`${policy.memoryMb}m`,'--memory-swap',`${policy.memoryMb}m`,'--cpus',String(policy.cpus),'--workdir','/workspace',...scratch,'--entrypoint','node',policy.image,'--input-type=module','-e',RUNNER_BOOTSTRAP,'--',JSON.stringify(config)]);
    if(options.signal?.aborted)return cancelled();
    const raw=await streamContainer(engine,['start','--attach','--interactive',name],payload,options.signal,maxOutputBytes*6+65536,suite.spec.runner.timeoutMs+30000);
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
    // A cancelled container client must not leave its untrusted container running.
    let cleanupFailed=false;
    if(createAttempted)try{await container(removeContainerArgs(engine,name));}catch(error){cleanupFailed=!String(error).includes('No such container');}
    if(cleanupFailed)throw new Error('Runner cleanup failed; operator intervention required');
  }
}
