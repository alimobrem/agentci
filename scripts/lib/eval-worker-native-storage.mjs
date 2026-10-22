import {spawn} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {NATIVE_SCAN_IMAGE} from './eval-worker-native-evidence.mjs';

const OWNER_LABEL='agentci.image-smoke.owner';
const SCAN_TIMEOUT=180000,SCAN_LIMIT=8*1024*1024,PROBE_TIMEOUT=500,PROBE_LIMIT=4096,POLL_INTERVAL=250,AVAILABILITY_POLL_INTERVAL=500,SAMPLE_LIMIT=32,INSPECT_LIMIT=360,STAT_LIMIT=64;
const STAT_FORMAT='%s %b %f %a %c %d';
// HostConfig.Mounts is omitted for the original -v/--tmpfs argv. Docker's raw
// inspect fallback uses missingkey=error; index preserves its nil/empty meaning.
const INSPECT_FORMAT='{"id":{{json .Id}},"owner":{{json (index .Config.Labels "'+OWNER_LABEL+'")}},"image":{{json .Config.Image}},"running":{{json .State.Running}},"readOnly":{{json .HostConfig.ReadonlyRootfs}},"tmpfs":{{json .HostConfig.Tmpfs}},"binds":{{json .HostConfig.Binds}},"user":{{json .Config.User}},"entrypoint":{{json .Config.Entrypoint}},"cmd":{{json .Config.Cmd}},"privileged":{{json .HostConfig.Privileged}},"capAdd":{{json .HostConfig.CapAdd}},"mounts":{{json (index .HostConfig "Mounts")}}}';
const SIGNALS=new Set(['SIGHUP','SIGINT','SIGQUIT','SIGILL','SIGTRAP','SIGABRT','SIGIOT','SIGBUS','SIGFPE','SIGKILL','SIGUSR1','SIGSEGV','SIGUSR2','SIGPIPE','SIGALRM','SIGTERM','SIGSTKFLT','SIGCHLD','SIGCONT','SIGSTOP','SIGTSTP','SIGTTIN','SIGTTOU','SIGURG','SIGXCPU','SIGXFSZ','SIGVTALRM','SIGPROF','SIGWINCH','SIGIO','SIGPOLL','SIGPWR','SIGSYS']);
const signalName=value=>SIGNALS.has(value)?value:null;
const exitCode=value=>Number.isInteger(value)&&value>=0&&value<=255?value:null;
const reject=()=>{throw Error('Invalid native scanner storage input');};
export const NATIVE_STORAGE_PROBE_ERRORS=[null,'ETIMEDOUT','ENOBUFS','ABORT_ERR','ENOENT','EACCES','OTHER'];
export const NATIVE_STORAGE_PROBE_CLASSES=['none','template-error','container-not-found','timeout','output-limit','cancelled','engine-unavailable','signalled','nonzero-exit','execution-error'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

/** Hash only bounded captured channels; known classes never include error values. */
export function nativeStorageProbeEvidence(result,kind){
 if(!['inspect','stat'].includes(kind)||!Buffer.isBuffer(result.stdout)||!Buffer.isBuffer(result.stderr)||result.stdout.length>PROBE_LIMIT||result.stderr.length>PROBE_LIMIT)reject();
 const errorCode=typeof result.code==='string'?(NATIVE_STORAGE_PROBE_ERRORS.includes(result.code)?result.code:'OTHER'):null;
 let failureClass;
 if(errorCode==='ETIMEDOUT')failureClass='timeout';
 else if(errorCode==='ENOBUFS')failureClass='output-limit';
 else if(errorCode==='ABORT_ERR')failureClass='cancelled';
 else if(['ENOENT','EACCES'].includes(errorCode))failureClass='engine-unavailable';
 else if(errorCode)failureClass='execution-error';
 else if(signalName(result.signal))failureClass='signalled';
 else if(result.status===0)failureClass='none';
 else{
  const text=result.stderr.toString('utf8');
  if(kind==='inspect'&&/template parsing error|map has no entry for key|can't evaluate field/i.test(text))failureClass='template-error';
  else if(/no such (?:container|object)\b/i.test(text))failureClass='container-not-found';
  else failureClass=exitCode(result.status)===null?'execution-error':'nonzero-exit';
 }
 return {kind,errorCode,failureClass,stdoutBytes:result.stdout.length,stderrBytes:result.stderr.length,stdoutSha256:hash(result.stdout),stderrSha256:hash(result.stderr),capture:'bounded-channel-buffers',rawDiagnostics:'withheld'};
}

function identity(value){
 if(!value||typeof value.owner!=='string'||typeof value.containerName!=='string'||typeof value.scannerImage!=='string'||!/^agentci-smoke-[a-f0-9]{16}$/.test(value.owner)||value.owner.length!==30||!['worker-scan','runner-scan'].some(role=>value.containerName===value.owner+'-'+role)||value.scannerImage!==NATIVE_SCAN_IMAGE)reject();
 return value;
}

/** The original scanner argv, including its entrypoint, bounds and socket access. */
export function nativeStorageScanArgs(value){
 const {containerName,owner,scannerImage,imageId}=identity(value);
 if(typeof imageId!=='string'||!/^sha256:[a-f0-9]{64}$/.test(imageId))reject();
 return ['run','--rm','--name',containerName,'--label',OWNER_LABEL+'='+owner,'--read-only','--tmpfs','/tmp:rw,nosuid,nodev,size=1g','-v','/var/run/docker.sock:/var/run/docker.sock',scannerImage,'image','--cache-dir','/tmp/trivy-cache','--scanners','vuln','--format','json',imageId];
}

function baseline(args,expected){return {owner:expected.owner,image:expected.scannerImage,readOnly:true,tmpfs:{'/tmp':'rw,nosuid,nodev,size=1g'},binds:['/var/run/docker.sock:/var/run/docker.sock'],user:'',entrypoint:['trivy'],cmd:args.slice(args.indexOf(expected.scannerImage)+1),privileged:false,capAdd:[],mounts:[]};}
export function nativeStorageBaselineSha256(args,expected){
 identity(expected);if(!Array.isArray(args)||JSON.stringify(args)!==JSON.stringify(nativeStorageScanArgs({...expected,imageId:args.at(-1)})))reject();
 return createHash('sha256').update(JSON.stringify(baseline(args,expected))).digest('hex');
}

/** Decode one authenticated BusyBox statfs row; never retain malformed/raw output. */
export function parseNativeStorageCounters(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length>256||!/^\d+(?: \d+){5}\n$/.test(bytes.toString('ascii'))||!Buffer.from(bytes.toString('ascii'),'ascii').equals(bytes))reject();
 const values=bytes.toString('ascii').trimEnd().split(' ').map(Number);
 if(values.some(value=>!Number.isSafeInteger(value)||value<0))reject();
 const [blockSize,totalBlocks,freeBlocks,availableBlocks,totalInodes,freeInodes]=values;
 if(blockSize<=0||totalBlocks<=0||totalInodes<=0||freeBlocks>totalBlocks||availableBlocks>freeBlocks||freeInodes>totalInodes)reject();
 const usedBlocks=totalBlocks-freeBlocks,reservedBlocks=freeBlocks-availableBlocks;
 const byteCounts=[totalBlocks,freeBlocks,availableBlocks,usedBlocks,reservedBlocks].map(value=>value*blockSize);
 if(byteCounts.some(value=>!Number.isSafeInteger(value)))reject();
 const [totalBytes,freeBytes,availableBytes,usedBytes,reservedBytes]=byteCounts;
 if(usedBytes+freeBytes!==totalBytes||availableBytes+reservedBytes!==freeBytes)reject();
 return {blockSize,totalBlocks,freeBlocks,availableBlocks,usedBlocks,reservedBlocks,totalBytes,freeBytes,availableBytes,usedBytes,reservedBytes,totalInodes,freeInodes,usedInodes:totalInodes-freeInodes};
}

function pathObservation(){return {samples:[],validSamples:0,minimumFreeBytes:null,maximumUsedBytes:null,minimumFreeInodes:null};}
function receipt(){return {schemaVersion:1,artifactKind:'native-scanner-storage-observation',scope:'diagnostic-only',containerId:null,baseline:{result:'not-observed',sha256:null,observed:null},pollIntervalMs:POLL_INTERVAL,availabilityPollIntervalMs:AVAILABILITY_POLL_INTERVAL,probeTimeoutMs:PROBE_TIMEOUT,maxSamplesPerPath:SAMPLE_LIMIT,maxInspectAttempts:INSPECT_LIMIT,maxStatAttempts:STAT_LIMIT,attempts:{inspect:0,stat:0},boundsReached:{inspect:false,stat:false},paths:{tmp:pathObservation(),cache:pathObservation()},unavailable:[],unavailableCounts:{},lifecycle:{before:'unavailable-before-scanner-start',after:'unavailable-after-scanner-lifetime',termination:'scanner-finished'},hostChildren:{started:0,closed:0,active:0,cleanup:'complete'},qualification:'Sampled maximum used is a lower bound on peak; sampled minimum free bytes/inodes are upper bounds on true minima. Paths report filesystem occupancy, not directory sizes. No runtime acceptance.'};}
function boundedPush(rows,value){rows.push(value);if(rows.length>SAMPLE_LIMIT)rows.splice(1,1);}

/** Injectable process creation enables offline transport tests; production uses spawn. */
export function createNativeStorageRunner(spawnChild=spawn){
 return async function runNativeScanWithStorage(args,expected){
  expected={...identity(expected)};
  if(expected.signal!==undefined&&!(expected.signal instanceof AbortSignal))reject();
  if(!Array.isArray(args)||args.some(value=>typeof value!=='string')||JSON.stringify(args)!==JSON.stringify(nativeStorageScanArgs({...expected,imageId:args.at(-1)})))reject();
  const storage=receipt(),startedAt=performance.now(),live=new Set();let stopping=false,delayTimer,delayResolve;
  const elapsed=()=>Math.max(0,Math.min(SCAN_TIMEOUT,Math.round(performance.now()-startedAt)));
  function unavailable(pathClass,reason,result={},kind){
   boundedPush(storage.unavailable,{elapsedMs:elapsed(),pathClass,reason,exitCode:exitCode(result.status),signal:signalName(result.signal),probe:kind?nativeStorageProbeEvidence(result,kind):null});
   storage.unavailableCounts[reason]=(storage.unavailableCounts[reason]??0)+1;
  }
  function command(argv,{timeout,maxBuffer,signal}){
   let child,timer,killTimer,finishTimer,reason,closed=false,settled=false,stdoutBytes=0,stderrBytes=0;const stdout=[],stderr=[];
   let resolveResult;const promise=new Promise(resolve=>{resolveResult=resolve;});
   function finish(status,observedSignal,spawnError){
    if(settled)return;settled=true;clearTimeout(timer);clearTimeout(killTimer);clearTimeout(finishTimer);signal?.removeEventListener('abort',abort);
    resolveResult({status:exitCode(status),signal:signalName(observedSignal),stdout:Buffer.concat(stdout),stderr:Buffer.concat(stderr),code:reason??spawnError?.code??(status===0?undefined:status),cleanupVerified:closed});
   }
   function stop(code){
    if(settled)return;reason??=code;
    if(child&&!closed){
     try{child.kill('SIGTERM');}catch{}
     killTimer??=setTimeout(()=>{if(!closed)try{child.kill('SIGKILL');}catch{}},100);
     finishTimer??=setTimeout(()=>{child.stdout?.destroy();child.stderr?.destroy();finish(child.exitCode,child.signalCode);},500);
    }else finish(null,null);
   }
   function abort(){stop('ABORT_ERR');}
   if(signal?.aborted){reason='ABORT_ERR';finish(null,null);return {promise,stop};}
   try{
    child=spawnChild('docker',argv,{env:{PATH:process.env.PATH},stdio:['ignore','pipe','pipe']});
    storage.hostChildren.started++;storage.hostChildren.active++;live.add(stop);
    child.once('close',(status,observedSignal)=>{closed=true;storage.hostChildren.closed++;storage.hostChildren.active--;live.delete(stop);finish(status,observedSignal);});
    child.once('error',error=>{reason??=error?.code??'SPAWN_ERROR';});
    for(const [stream,chunks,name]of [[child.stdout,stdout,'stdout'],[child.stderr,stderr,'stderr']])stream.on('data',chunk=>{
     if(settled)return;const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk),current=name==='stdout'?stdoutBytes:stderrBytes,remaining=Math.max(0,maxBuffer-current);
     if(remaining)chunks.push(bytes.subarray(0,remaining));
     if(name==='stdout')stdoutBytes+=bytes.length;else stderrBytes+=bytes.length;
     if(current+bytes.length>maxBuffer)stop('ENOBUFS');
    });
    signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>stop('ETIMEDOUT'),timeout);
   }catch(error){reason=error?.code??'SPAWN_ERROR';finish(null,null,error);}
   return {promise,stop};
  }
  const controller=new AbortController();
  const pause=(interval=POLL_INTERVAL)=>new Promise(resolve=>{delayResolve=resolve;delayTimer=setTimeout(()=>{delayResolve=null;resolve();},interval);});
  const stopObserver=()=>{stopping=true;controller.abort();clearTimeout(delayTimer);delayResolve?.();delayResolve=null;};
  const probe=argv=>command(argv,{timeout:PROBE_TIMEOUT,maxBuffer:PROBE_LIMIT,signal:controller.signal}).promise;
  async function observe(){
   while(!stopping){
    if(!storage.containerId){
     if(storage.attempts.inspect>=INSPECT_LIMIT){storage.boundsReached.inspect=true;unavailable('container','inspect-attempt-limit');break;}
     storage.attempts.inspect++;storage.boundsReached.inspect=storage.attempts.inspect===INSPECT_LIMIT;
     const inspected=await probe(['inspect','--format',INSPECT_FORMAT,expected.containerName]);
     if(stopping)break;
     if(inspected.status!==0||inspected.code||inspected.signal){unavailable('container',inspected.code==='ETIMEDOUT'?'inspect-timeout':'container-unavailable',inspected,'inspect');await pause(AVAILABILITY_POLL_INTERVAL);continue;}
     let value;try{value=JSON.parse(inspected.stdout.toString('utf8'));}catch{unavailable('container','invalid-inspect',inspected,'inspect');await pause(AVAILABILITY_POLL_INTERVAL);continue;}
     if(!value||Object.keys(value).sort().join(',')!=='binds,capAdd,cmd,entrypoint,id,image,mounts,owner,privileged,readOnly,running,tmpfs,user'||typeof value.id!=='string'||!/^([a-f0-9]{64})$/.test(value.id)||value.owner!==expected.owner||value.image!==expected.scannerImage||typeof value.running!=='boolean'){unavailable('container','identity-mismatch',inspected,'inspect');await pause(AVAILABILITY_POLL_INTERVAL);continue;}
     const observed={owner:value.owner,image:value.image,readOnly:value.readOnly,tmpfs:value.tmpfs,binds:value.binds,user:value.user??'',entrypoint:value.entrypoint,cmd:value.cmd,privileged:value.privileged,capAdd:value.capAdd??[],mounts:value.mounts??[]};
     if(JSON.stringify(observed)!==JSON.stringify(baseline(args,expected))){unavailable('container','baseline-mismatch',inspected,'inspect');await pause(AVAILABILITY_POLL_INTERVAL);continue;}
     if(!value.running){unavailable('container','container-not-running',inspected,'inspect');await pause(AVAILABILITY_POLL_INTERVAL);continue;}
     storage.containerId=value.id;storage.baseline={result:'matched',sha256:createHash('sha256').update(JSON.stringify(observed)).digest('hex'),observed};
    }
    for(const [pathClass,path]of [['tmp','/tmp'],['cache','/tmp/trivy-cache']]){
     if(stopping)break;
     if(storage.attempts.stat>=STAT_LIMIT){storage.boundsReached.stat=true;unavailable('container','stat-attempt-limit');return;}
     storage.attempts.stat++;storage.boundsReached.stat=storage.attempts.stat===STAT_LIMIT;
     const result=await probe(['exec',storage.containerId,'/bin/busybox','stat','-f','-c',STAT_FORMAT,path]);
     if(stopping)break;
     if(result.status!==0||result.code||result.signal){unavailable(pathClass,result.code==='ETIMEDOUT'?'probe-timeout':result.code==='ENOBUFS'?'probe-output-limit':'path-or-container-unavailable',result,'stat');continue;}
     let counters;try{counters=parseNativeStorageCounters(result.stdout);}catch{unavailable(pathClass,'invalid-counters',result,'stat');continue;}
     const observed=storage.paths[pathClass];observed.validSamples++;boundedPush(observed.samples,{elapsedMs:elapsed(),...counters});
     observed.minimumFreeBytes=observed.minimumFreeBytes===null?counters.freeBytes:Math.min(observed.minimumFreeBytes,counters.freeBytes);
     observed.maximumUsedBytes=observed.maximumUsedBytes===null?counters.usedBytes:Math.max(observed.maximumUsedBytes,counters.usedBytes);
     observed.minimumFreeInodes=observed.minimumFreeInodes===null?counters.freeInodes:Math.min(observed.minimumFreeInodes,counters.freeInodes);
    }
    if(!stopping)await pause();
   }
  }
  const scanner=command(args,{timeout:SCAN_TIMEOUT,maxBuffer:SCAN_LIMIT,signal:expected.signal});
  const observer=expected.signal?.aborted?Promise.resolve():observe().catch(()=>{unavailable('container','observer-unavailable');});
  const result=await scanner.promise;stopObserver();await observer;
  // Only direct children created above are signalled; container recovery belongs to the caller.
  for(const stop of live)stop('ABORT_ERR');
  storage.hostChildren.cleanup=storage.hostChildren.active===0?'complete':'unverified';
  storage.lifecycle.termination=result.code==='ETIMEDOUT'?'timeout':result.code==='ENOBUFS'?'output-limit':result.code==='ABORT_ERR'?'cancelled':typeof result.code==='string'?'spawn-failed':result.signal?'scanner-signalled':'scanner-finished';
  if(!storage.containerId)unavailable('container','not-observed');
  if(result.status===0&&!result.code&&!result.signal&&storage.hostChildren.cleanup==='complete')return {...result,storage};
  const error=Error('Native scanner execution failed');Object.assign(error,{stdout:result.stdout,stderr:result.stderr,status:result.status,signal:result.signal,code:result.code??(storage.hostChildren.cleanup==='complete'?undefined:'OBSERVER_CLEANUP_UNVERIFIED'),storage});throw error;
 };
}

export const runNativeScanWithStorage=createNativeStorageRunner();
