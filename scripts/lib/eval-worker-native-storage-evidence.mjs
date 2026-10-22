import {createHash} from 'node:crypto';
import {EVAL_NATIVE_INPUTS,NATIVE_SCAN_IMAGE,evalNativeLabels,validateEvalNativeScan} from './eval-worker-native-evidence.mjs';
import {nativeStorageBaselineSha256,nativeStorageScanArgs} from './eval-worker-native-storage.mjs';

export const STORAGE_KIND='native-evaluator-storage-diagnostic';
export const STORAGE_MODE='eval-storage-diagnostic';
export const STORAGE_REF='refs/heads/codex/m3-native-storage-diagnostics';
export const STORAGE_WORKFLOW='.github/workflows/dashboard-native.yaml';
export const STORAGE_INPUTS=[...EVAL_NATIVE_INPUTS,'scripts/eval-worker-native-storage-diagnostic.mjs','scripts/lib/eval-worker-native-storage.mjs','scripts/lib/eval-worker-native-storage-evidence.mjs',STORAGE_WORKFLOW];
export const STORAGE_FILES=['source.json','daemon.json','image.json','storage.json','scan-execution.json','worker-scan.json','diagnose.json','cleanup.json','failure-source.json','failure-diagnose.json','failure-finalize.json'];
export const storageHash=value=>createHash('sha256').update(value).digest('hex');
export const STORAGE_SIGNALS=['SIGHUP','SIGINT','SIGQUIT','SIGILL','SIGTRAP','SIGABRT','SIGIOT','SIGBUS','SIGFPE','SIGKILL','SIGUSR1','SIGSEGV','SIGUSR2','SIGPIPE','SIGALRM','SIGTERM','SIGSTKFLT','SIGCHLD','SIGCONT','SIGSTOP','SIGTSTP','SIGTTIN','SIGTTOU','SIGURG','SIGXCPU','SIGXFSZ','SIGVTALRM','SIGPROF','SIGWINCH','SIGIO','SIGPOLL','SIGPWR','SIGSYS'];
export const STORAGE_REASONS=['inspect-timeout','container-unavailable','invalid-inspect','identity-mismatch','container-not-running','probe-timeout','probe-output-limit','path-or-container-unavailable','invalid-counters','observer-unavailable','not-observed','baseline-mismatch','inspect-attempt-limit','stat-attempt-limit'];
const fail=()=>{throw Error('Native storage diagnostic evidence mismatch');};
const object=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v)||JSON.stringify(Object.keys(v).sort())!==JSON.stringify([...keys].sort()))fail();};
const string=(v,regex,length)=>typeof v==='string'&&(!length||v.length===length)&&regex.test(v);
const sha=v=>string(v,/^[a-f0-9]{40}$/,40),hash=v=>string(v,/^[a-f0-9]{64}$/,64),id=v=>string(v,/^sha256:[a-f0-9]{64}$/,71),owner=v=>string(v,/^agentci-smoke-[a-f0-9]{16}$/,30);
const integer=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const positive=v=>typeof v==='string'&&v.length<=20&&/^[1-9][0-9]*$/.test(v);

export function validateStorageHostedContext(environment,runtime,arch,head){
 if(environment.GITHUB_ACTIONS!=='true'||environment.GITHUB_REPOSITORY!=='alimobrem/agentci'||environment.GITHUB_EVENT_NAME!=='workflow_dispatch'||environment.AGENTCI_STORAGE_MODE!==STORAGE_MODE||environment.AGENTCI_CONTAINER_ENGINE!=='docker'||environment.GITHUB_REF!==STORAGE_REF||environment.GITHUB_WORKFLOW_REF!=='alimobrem/agentci/'+STORAGE_WORKFLOW+'@'+STORAGE_REF||!sha(environment.INPUT_EXPECTED_SOURCE)||environment.INPUT_EXPECTED_SOURCE!==head||environment.GITHUB_SHA!==head||environment.GITHUB_WORKFLOW_SHA!==head||!sha(head)||!positive(environment.GITHUB_RUN_ID)||!positive(environment.GITHUB_RUN_ATTEMPT)||runtime.platform!=='linux'||runtime.node!=='v26.10.0'||!['amd64','arm64'].includes(arch)||(runtime.arch==='x64'?'amd64':runtime.arch)!==arch)fail();
 return true;
}

export function validateStorageSource(v){
 object(v,['schemaVersion','artifactKind','mode','repository','ref','workflowPath','workflowRef','workflowSha','workflowPermissions','sourceCommit','sourceTree','candidateCommit','expectedSourceCommit','checkoutParents','event','runId','attempt','arch','platform','node','harnessOwner','rootLockSha256','packageLockSha256','nativePinsSha256','dockerfileSha256','inputs']);
 if(v.schemaVersion!==1||v.artifactKind!==STORAGE_KIND||v.mode!==STORAGE_MODE||v.repository!=='alimobrem/agentci'||v.ref!==STORAGE_REF||v.workflowPath!==STORAGE_WORKFLOW||v.workflowRef!=='alimobrem/agentci/'+STORAGE_WORKFLOW+'@'+STORAGE_REF||v.workflowPermissions!=='contents-read-only'||!sha(v.sourceCommit)||!sha(v.sourceTree)||v.candidateCommit!==v.sourceCommit||v.expectedSourceCommit!==v.sourceCommit||v.workflowSha!==v.sourceCommit||v.event!=='workflow_dispatch'||!positive(v.runId)||!positive(v.attempt)||!['amd64','arm64'].includes(v.arch)||v.platform!=='linux/'+v.arch||v.node!=='v26.10.0'||!owner(v.harnessOwner)||!Array.isArray(v.checkoutParents)||v.checkoutParents.length>8||v.checkoutParents.some(p=>!sha(p))||!Array.isArray(v.inputs)||v.inputs.length!==STORAGE_INPUTS.length)fail();
 for(let i=0;i<STORAGE_INPUTS.length;i++){const input=v.inputs[i];object(input,['path','sha256']);if(input.path!==STORAGE_INPUTS[i]||!hash(input.sha256))fail();}
 for(const [key,path]of [['rootLockSha256','npm-shrinkwrap.json'],['packageLockSha256','package-lock.json'],['nativePinsSha256','deploy/security/native-components.json'],['dockerfileSha256','Dockerfile']])if(!hash(v[key])||v[key]!==v.inputs.find(f=>f.path===path).sha256)fail();
 if(v.rootLockSha256!==v.packageLockSha256)fail();return v;
}

export function validateStorageDaemon(v,source){object(v,['os','arch']);if(v.os!=='linux'||v.arch!==source.arch)fail();return v;}
export function validateStorageImage(v,source){
 object(v,['role','id','os','arch','user','command','entrypoint','labels']);
 const labels=evalNativeLabels(source,'eval-worker');object(v.labels,Object.keys(labels));
 if(v.role!=='eval-worker'||!id(v.id)||v.os!=='linux'||v.arch!==source.arch||!['1001','1001:0'].includes(v.user)||!same(v.command,['node','dist/apps/eval-worker/main.js'])||v.entrypoint!==null&&!same(v.entrypoint,[])||Object.entries(labels).some(([key,value])=>v.labels[key]!==value))fail();return v;
}

const sampleKeys=['elapsedMs','blockSize','totalBlocks','freeBlocks','availableBlocks','usedBlocks','reservedBlocks','totalBytes','freeBytes','availableBytes','usedBytes','reservedBytes','totalInodes','freeInodes','usedInodes'];
export function validateStorageObservation(v,{source,image}={}){
 object(v,['schemaVersion','artifactKind','scope','containerId','baseline','pollIntervalMs','availabilityPollIntervalMs','probeTimeoutMs','maxSamplesPerPath','maxInspectAttempts','maxStatAttempts','attempts','boundsReached','paths','unavailable','unavailableCounts','lifecycle','hostChildren','qualification']);
 if(v.schemaVersion!==1||v.artifactKind!=='native-scanner-storage-observation'||v.scope!=='diagnostic-only'||v.containerId!==null&&!hash(v.containerId)||v.pollIntervalMs!==250||v.availabilityPollIntervalMs!==500||v.probeTimeoutMs!==500||v.maxSamplesPerPath!==32||v.maxInspectAttempts!==360||v.maxStatAttempts!==64||v.qualification!=='Sampled maximum used is a lower bound on peak; sampled minimum free bytes/inodes are upper bounds on true minima. Paths report filesystem occupancy, not directory sizes. No runtime acceptance.')fail();
 object(v.attempts,['inspect','stat']);object(v.boundsReached,['inspect','stat']);if(!integer(v.attempts.inspect,0,360)||!integer(v.attempts.stat,0,64)||v.boundsReached.inspect!==(v.attempts.inspect===360)||v.boundsReached.stat!==(v.attempts.stat===64))fail();
 object(v.baseline,['result','sha256','observed']);if(v.containerId===null){if(v.baseline.result!=='not-observed'||v.baseline.sha256!==null||v.baseline.observed!==null||v.attempts.stat!==0)fail();}
 else{if(!source||!image||v.attempts.inspect<1||v.baseline.result!=='matched')fail();const expected={containerName:source.harnessOwner+'-worker-scan',owner:source.harnessOwner,scannerImage:NATIVE_SCAN_IMAGE,imageId:image.id};object(v.baseline.observed,['owner','image','readOnly','tmpfs','binds','user','entrypoint','cmd','privileged','capAdd','mounts']);if(v.baseline.sha256!==nativeStorageBaselineSha256(nativeStorageScanArgs(expected),expected)||v.baseline.sha256!==storageHash(JSON.stringify(v.baseline.observed)))fail();}
 object(v.paths,['tmp','cache']);
 for(const path of ['tmp','cache']){
  const value=v.paths[path];object(value,['samples','validSamples','minimumFreeBytes','maximumUsedBytes','minimumFreeInodes']);
  if(!Array.isArray(value.samples)||value.samples.length>32||!integer(value.validSamples,0,32)||value.validSamples!==value.samples.length)fail();
  let elapsed=-1;
  for(const s of value.samples){object(s,sampleKeys);if(!sampleKeys.every(key=>integer(s[key]))||s.elapsedMs>180000||s.elapsedMs<elapsed||s.blockSize<1||s.blockSize>2**30||s.totalBlocks<1||s.freeBlocks>s.totalBlocks||s.availableBlocks>s.freeBlocks||s.usedBlocks!==s.totalBlocks-s.freeBlocks||s.reservedBlocks!==s.freeBlocks-s.availableBlocks||s.freeInodes>s.totalInodes||s.usedInodes!==s.totalInodes-s.freeInodes)fail();elapsed=s.elapsedMs;
   for(const name of ['total','free','available','used','reserved'])if(!integer(s[name+'Blocks']*s.blockSize)||s[name+'Bytes']!==s[name+'Blocks']*s.blockSize)fail();
  }
  if(value.validSamples){if(v.containerId===null||value.minimumFreeBytes!==Math.min(...value.samples.map(s=>s.freeBytes))||value.maximumUsedBytes!==Math.max(...value.samples.map(s=>s.usedBytes))||value.minimumFreeInodes!==Math.min(...value.samples.map(s=>s.freeInodes)))fail();}
  else if(value.minimumFreeBytes!==null||value.maximumUsedBytes!==null||value.minimumFreeInodes!==null)fail();
 }
 if(!Array.isArray(v.unavailable)||v.unavailable.length>32||!v.unavailableCounts||typeof v.unavailableCounts!=='object'||Array.isArray(v.unavailableCounts)||Object.entries(v.unavailableCounts).some(([reason,count])=>!STORAGE_REASONS.includes(reason)||!integer(count,1,10000)))fail();
 const counts={};for(const row of v.unavailable){object(row,['elapsedMs','pathClass','reason','exitCode','signal']);if(!integer(row.elapsedMs,0,180000)||!['container','tmp','cache'].includes(row.pathClass)||!STORAGE_REASONS.includes(row.reason)||row.exitCode!==null&&!integer(row.exitCode,0,255)||row.signal!==null&&!STORAGE_SIGNALS.includes(row.signal))fail();counts[row.reason]=(counts[row.reason]??0)+1;}
 if(Object.entries(counts).some(([reason,count])=>!(v.unavailableCounts[reason]>=count)))fail();
 object(v.lifecycle,['before','after','termination']);if(v.lifecycle.before!=='unavailable-before-scanner-start'||v.lifecycle.after!=='unavailable-after-scanner-lifetime'||!['scanner-finished','scanner-signalled','timeout','output-limit','cancelled','spawn-failed'].includes(v.lifecycle.termination))fail();
 const valid=v.paths.tmp.validSamples+v.paths.cache.validSamples;if(valid>v.attempts.stat)fail();
 object(v.hostChildren,['started','closed','active','cleanup']);const c=v.hostChildren;if(!['started','closed','active'].every(key=>integer(c[key],0,425))||c.started>1+v.attempts.inspect+v.attempts.stat||c.closed>c.started||c.active!==c.started-c.closed||!['complete','unverified'].includes(c.cleanup)||c.cleanup==='complete'&&c.active!==0)fail();return v;
}

export function validateStorageCapture(v,source,image){
 object(v,['schemaVersion','artifactKind','sourceSha256','imageId','result','observation']);if(v.schemaVersion!==1||v.artifactKind!=='native-scanner-storage-capture'||v.sourceSha256!==storageHash(JSON.stringify(source))||v.imageId!==image.id||!['observed','observer-unavailable'].includes(v.result))fail();
 if(v.result==='observed')validateStorageObservation(v.observation,{source,image});else if(v.observation!==null)fail();return v;
}
export function storageNumbersComplete(capture){return capture.result==='observed'&&['tmp','cache'].every(path=>capture.observation.paths[path].validSamples>0)&&capture.observation.hostChildren.cleanup==='complete'&&capture.observation.hostChildren.active===0;}

export function validateStorageExecution(v,source,image){
 object(v,['schemaVersion','artifactKind','sourceSha256','role','imageId','scanner','outcome','exitCode','signal','parentSignal','errorCode','stdoutBytes','stderrBytes','stdoutSha256','stderrSha256','diagnostics','rootCause']);
 if(v.schemaVersion!==1||v.artifactKind!=='native-scanner-storage-execution'||v.sourceSha256!==storageHash(JSON.stringify(source))||v.role!=='eval-worker'||v.imageId!==image.id||v.scanner!==NATIVE_SCAN_IMAGE||!['policy-passed','policy-blocked','execution-failed','invalid-report'].includes(v.outcome)||v.exitCode!==null&&!integer(v.exitCode,0,255)||v.signal!==null&&!STORAGE_SIGNALS.includes(v.signal)||![null,'SIGTERM','SIGINT'].includes(v.parentSignal)||![null,'ETIMEDOUT','ENOBUFS','ENOENT','EACCES','ABORT_ERR','OTHER'].includes(v.errorCode)||!integer(v.stdoutBytes,0,8*1024*1024)||!integer(v.stderrBytes,0,8*1024*1024)||!hash(v.stdoutSha256)||!hash(v.stderrSha256)||v.rootCause!=='not-established')fail();
 if(v.outcome==='execution-failed'){
  if(v.exitCode===0&&v.signal===null&&v.errorCode===null)fail();
  const d=v.diagnostics;object(d,['affectedPathClasses','schemaVersion','classification','cause','observedClasses','exitCode','stdoutBytes','stderrBytes','stdoutSha256','stderrSha256','classificationInput','classificationPrefixBytes','classificationTruncated','rawDiagnostics','scanPolicyResult']);
  const classes=['scratch-space-exhausted','filesystem-permission-denied','read-only-filesystem','database-download-failed','registry-access-failed','network-or-tls-failed','archive-input-failed','platform-or-executable-failed','scanner-cli-arguments-failed','execution-timeout','execution-output-limit'];
  if(d.schemaVersion!==1||d.classification!=='scanner-execution-failed'||!Array.isArray(d.affectedPathClasses)||!d.affectedPathClasses.length||new Set(d.affectedPathClasses).size!==d.affectedPathClasses.length||d.affectedPathClasses.some(p=>!['tmp','cache','unknown'].includes(p))||!Array.isArray(d.observedClasses)||new Set(d.observedClasses).size!==d.observedClasses.length||d.observedClasses.some(c=>!classes.includes(c))||d.cause!==(d.observedClasses.length===1?d.observedClasses[0]:'multiple-or-unclassified')||d.classificationInput!=='bounded-stderr-prefix'||d.classificationPrefixBytes!==131072||d.classificationTruncated!==(v.stderrBytes>131072)||d.rawDiagnostics!=='withheld'||d.scanPolicyResult!=='not-evaluated'||['exitCode','stdoutBytes','stderrBytes','stdoutSha256','stderrSha256'].some(key=>d[key]!==v[key]))fail();
 }else if(v.exitCode!==0||v.signal!==null||v.parentSignal!==null||v.errorCode!==null||v.diagnostics!==null)fail();return v;
}
export function validateStorageCleanup(v,source){
 object(v,['schemaVersion','result','owner','ownedContainers','ownedNetworks','ownedVolumes','privateFilesRemoved']);if(v.schemaVersion!==1||v.result!=='passed'||v.owner!==source.harnessOwner||v.ownedContainers!==0||v.ownedNetworks!==0||v.ownedVolumes!==0||v.privateFilesRemoved!==true)fail();return v;
}
export function validateStorageScan(scan,image,source){return validateEvalNativeScan(scan,image.id,source);}
export function validateStorageDiagnosticRecords(records,{scanBytes}={}){
 if(STORAGE_FILES.some(name=>name.startsWith('failure-')&&Object.hasOwn(records,name)))fail();
 const source=validateStorageSource(records['source.json']),image=validateStorageImage(records['image.json'],source);validateStorageDaemon(records['daemon.json'],source);validateStorageCapture(records['storage.json'],source,image);const execution=validateStorageExecution(records['scan-execution.json'],source,image);validateStorageCleanup(records['cleanup.json'],source);
 if(['policy-passed','policy-blocked'].includes(execution.outcome)){const scan=records['worker-scan.json'];if(!Buffer.isBuffer(scanBytes)||scanBytes.length!==execution.stdoutBytes||storageHash(scanBytes)!==execution.stdoutSha256||!same(JSON.parse(scanBytes.toString('utf8')),scan))fail();let passed=true;try{validateStorageScan(scan,image,source);}catch{passed=false;}if((execution.outcome==='policy-passed')!==passed||!scan||scan.ArtifactType!=='container_image'||scan.ArtifactName!==image.id||scan.Metadata?.ImageID!==image.id||scan.Metadata?.ImageConfig?.os!=='linux'||scan.Metadata.ImageConfig.architecture!==source.arch)fail();}
 else if(Object.hasOwn(records,'worker-scan.json'))fail();
 const diagnose=records['diagnose.json'];object(diagnose,['schemaVersion','artifactKind','sourceSha256','scanOutcome','numericEvidence','runtimeAcceptance','releaseComplete']);if(diagnose.schemaVersion!==1||diagnose.artifactKind!==STORAGE_KIND||diagnose.sourceSha256!==storageHash(JSON.stringify(source))||diagnose.scanOutcome!==execution.outcome||diagnose.numericEvidence!==(storageNumbersComplete(records['storage.json'])?'sampled':'incomplete-or-unavailable')||diagnose.runtimeAcceptance!=='not-performed'||diagnose.releaseComplete!==false)fail();return {source,scanOutcome:execution.outcome,numericEvidence:diagnose.numericEvidence};
}

export function storageFailure(stage,error){return {schemaVersion:1,artifactKind:STORAGE_KIND,result:'failed-or-unverified',stage:['source','daemon','image','scan','source-recheck','cleanup','finalize'].includes(stage)?stage:'source',exitCode:integer(error?.status,0,255)?error.status:null,signal:STORAGE_SIGNALS.includes(error?.signal)?error.signal:null,runtimeAcceptance:'not-performed',releaseComplete:false};}
