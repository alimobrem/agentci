import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {readFile,writeFile,mkdir,mkdtemp,appendFile,lstat,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyNativeInputs} from './verify-native-provenance.mjs';
import {cleanupImageSmokeState} from './lib/image-smoke-state.mjs';
import {NATIVE_SCAN_IMAGE,evalNativeLabels} from './lib/eval-worker-native-evidence.mjs';
import {dashboardScanFailure} from './lib/dashboard-scan-failure.mjs';
import {nativeStorageScanArgs,runNativeScanWithStorage} from './lib/eval-worker-native-storage.mjs';
import {STORAGE_KIND,STORAGE_MODE,STORAGE_REF,STORAGE_WORKFLOW,STORAGE_INPUTS,STORAGE_FILES,STORAGE_SIGNALS,storageHash,storageFailure,validateStorageHostedContext,validateStorageSource,validateStorageDaemon,validateStorageImage,validateStorageCapture,storageNumbersComplete,validateStorageExecution,validateStorageCleanup,validateStorageScan,validateStorageDiagnosticRecords} from './lib/eval-worker-native-storage-evidence.mjs';

const MAX_FILE=8*1024*1024;
const transport=(command,args,options={})=>execFileSync(command,args,{env:{PATH:process.env.PATH},encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:60000,maxBuffer:MAX_FILE,...options});
const channel=value=>Buffer.isBuffer(value)?value:Buffer.from(typeof value==='string'?value:'');
const runtimeDefault=()=>({platform:process.platform,arch:process.arch,node:process.version});
const invalid=()=>{throw Error('Native storage diagnostic binding failed');};

export async function bindStorageDiagnosticSource(arch,harnessOwner,{root=process.cwd(),environment=process.env,runtime=runtimeDefault(),execute=transport,verifyInputs=verifyNativeInputs}={}){
 const git=args=>execute('git',args,{cwd:root,env:{PATH:environment.PATH,GIT_OPTIONAL_LOCKS:'0',GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'}}).toString().trim();
 const sourceCommit=git(['rev-parse','HEAD']);validateStorageHostedContext(environment,runtime,arch,sourceCommit);git(['diff','--quiet','HEAD','--']);
 const inputs=[];
 for(const path of STORAGE_INPUTS){
  const info=await lstat(join(root,path));if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||info.size>MAX_FILE)invalid();
  const entry=git(['ls-tree','-z','HEAD','--',path]);if(!new RegExp('^100(?:644|755) blob [a-f0-9]{40}\\t'+path.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\x00$').test(entry))invalid();
  const bytes=await readFile(join(root,path)),committed=execute('git',['show','HEAD:'+path],{cwd:root,env:{PATH:environment.PATH,GIT_OPTIONAL_LOCKS:'0',GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'},encoding:null});if(!bytes.equals(committed))invalid();inputs.push({path,sha256:storageHash(bytes)});
 }
 const workflow=await readFile(join(root,STORAGE_WORKFLOW),'utf8');
 // Reviewed workflow uses a deliberately small permission block and no per-job override.
 if((workflow.match(/^\s*permissions:/gm)??[]).length!==1||!/^permissions:\r?\n  contents: read\r?\n/m.test(workflow)||/^permissions:\r?\n((?:  [^\r\n]*\r?\n)+)/m.exec(workflow)?.[1].trim()!=='contents: read'||!/^  workflow_dispatch:/m.test(workflow)||!workflow.includes("inputs.qualification == 'eval-storage-diagnostic'"))invalid();
 await verifyInputs();const hash=path=>inputs.find(f=>f.path===path).sha256;
 return validateStorageSource({schemaVersion:1,artifactKind:STORAGE_KIND,mode:STORAGE_MODE,repository:environment.GITHUB_REPOSITORY,ref:environment.GITHUB_REF,workflowPath:STORAGE_WORKFLOW,workflowRef:environment.GITHUB_WORKFLOW_REF,workflowSha:environment.GITHUB_WORKFLOW_SHA,workflowPermissions:'contents-read-only',sourceCommit,sourceTree:git(['rev-parse','HEAD^{tree}']),candidateCommit:sourceCommit,expectedSourceCommit:environment.INPUT_EXPECTED_SOURCE,checkoutParents:git(['show','-s','--format=%P','HEAD']).split(/\s+/).filter(Boolean),event:environment.GITHUB_EVENT_NAME,runId:environment.GITHUB_RUN_ID,attempt:environment.GITHUB_RUN_ATTEMPT,arch,platform:'linux/'+arch,node:runtime.node,harnessOwner,rootLockSha256:hash('npm-shrinkwrap.json'),packageLockSha256:hash('package-lock.json'),nativePinsSha256:hash('deploy/security/native-components.json'),dockerfileSha256:hash('Dockerfile'),inputs});
}

export async function recoverStorageDiagnosticState(path,source,{execute=transport}={}){
 if(typeof path!=='string'||!isAbsolute(path)||resolve(path)!==path||basename(path)!=='ownership.json'||!basename(dirname(path)).startsWith('agentci-image-smoke-'))invalid();
 let state;
 try{
  for(const [file,directory,mode]of[[dirname(path),true,0o700],[path,false,0o600]]){const info=await lstat(file);if(info.isSymbolicLink()||(directory?!info.isDirectory():!info.isFile()||info.nlink!==1||info.size>65536)||(info.mode&0o777)!==mode||process.getuid&&info.uid!==process.getuid())invalid();}
  state=JSON.parse(await readFile(path,'utf8'));
 }catch(error){if(error.code!=='ENOENT')throw error;const receipt=dirname(path)+'.cleanup.json',info=await lstat(receipt);if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||(info.mode&0o777)!==0o600||info.size>65536||process.getuid&&info.uid!==process.getuid())invalid();state=JSON.parse(await readFile(receipt,'utf8'));validateStorageCleanup(state,source);}
 if(state.schemaVersion!==1||state.owner!==source.harnessOwner)invalid();
 return validateStorageCleanup(await cleanupImageSmokeState(path,{command:args=>execute('docker',args).toString().trim()}),source);
}

export async function runStorageDiagnostic(command,{root=process.cwd(),environment=process.env,runtime=runtimeDefault(),execute=transport,observe=runNativeScanWithStorage,bindSource,cleanupState=recoverStorageDiagnosticState,arch,signal:abortSignal}={}){
 const directory=resolve(root,'.agentci/artifacts/eval-worker-native-storage-diagnostic');
 const bind=bindSource??((a,o)=>bindStorageDiagnosticSource(a,o,{root,environment,runtime,execute}));
 const save=async(name,value,{raw=false}={})=>{
  if(![...STORAGE_FILES,'result.json'].includes(name))invalid();const bytes=raw?value:Buffer.from(JSON.stringify(value,null,2)+'\n');if(!Buffer.isBuffer(bytes)||bytes.length>MAX_FILE)invalid();
  await mkdir(directory,{recursive:true});const info=await lstat(directory);if(!info.isDirectory()||info.isSymbolicLink())invalid();await writeFile(join(directory,name),bytes,{flag:'wx',mode:0o644});
 };
 const readPublic=async name=>{if(!STORAGE_FILES.includes(name))invalid();const path=join(directory,name),info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||info.size>MAX_FILE)invalid();return readFile(path);};
 const load=async name=>JSON.parse((await readPublic(name)).toString('utf8'));
 let stage='source',source,state,exported=false;
 try{
  if(command==='source'){
   source=await bind(arch,'agentci-smoke-'+randomBytes(8).toString('hex'));await save('source.json',source);
   for(const name of ['GITHUB_ENV','GITHUB_OUTPUT']){const path=environment[name];if(typeof path!=='string'||!isAbsolute(path)||resolve(path)!==path||/[\r\n]/.test(path))invalid();const info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1)invalid();}
   const privateRoot=await mkdtemp(join(tmpdir(),'agentci-image-smoke-'));state=join(privateRoot,'ownership.json');await writeFile(state,JSON.stringify({schemaVersion:1,owner:source.harnessOwner}),{flag:'wx',mode:0o600});
   await appendFile(environment.GITHUB_ENV,'AGENTCI_STORAGE_STATE_FILE='+state+'\n');exported=true;
   for(const [key,value]of Object.entries({source:source.sourceCommit,tree:source.sourceTree,candidate:source.candidateCommit,root_lock:source.rootLockSha256,native_pins:source.nativePinsSha256}))await appendFile(environment.GITHUB_OUTPUT,key+'='+value+'\n');
  }else if(command==='diagnose'){
   source=validateStorageSource(await load('source.json'));if(JSON.stringify(await bind(source.arch,source.harnessOwner))!==JSON.stringify(source))invalid();
   stage='daemon';const daemon=JSON.parse(execute('docker',['info','--format','{"os":{{json .OSType}},"arch":{{json .Architecture}}}']).toString());daemon.arch=['x86_64','x64','amd64'].includes(daemon.arch)?'amd64':['aarch64','arm64'].includes(daemon.arch)?'arm64':daemon.arch;validateStorageDaemon(daemon,source);await save('daemon.json',daemon);
   stage='image';const tag=`agentci-eval-worker:storage-diagnostic-${source.runId}-${source.attempt}-${source.arch}`,raw=JSON.parse(execute('docker',['image','inspect',tag]).toString());if(!Array.isArray(raw)||raw.length!==1)invalid();const info=raw[0],labels=Object.fromEntries(Object.keys(evalNativeLabels(source,'eval-worker')).map(key=>[key,info.Config?.Labels?.[key]]));
   const image=validateStorageImage({role:'eval-worker',id:info.Id,os:info.Os,arch:info.Architecture,user:info.Config?.User,command:info.Config?.Cmd,entrypoint:info.Config?.Entrypoint??null,labels},source);await save('image.json',image);
   // Before launching the only scanner, bind its recovery journal to this exact source owner.
   const privateState=environment.AGENTCI_STORAGE_STATE_FILE;if(typeof privateState!=='string'||!isAbsolute(privateState)||resolve(privateState)!==privateState||basename(privateState)!=='ownership.json'||!basename(dirname(privateState)).startsWith('agentci-image-smoke-'))invalid();for(const [path,isDirectory,mode]of[[dirname(privateState),true,0o700],[privateState,false,0o600]]){const metadata=await lstat(path);if(metadata.isSymbolicLink()||(isDirectory?!metadata.isDirectory():!metadata.isFile()||metadata.nlink!==1||metadata.size>65536)||(metadata.mode&0o777)!==mode||process.getuid&&metadata.uid!==process.getuid())invalid();}const journal=JSON.parse(await readFile(privateState,'utf8'));if(journal.schemaVersion!==1||journal.owner!==source.harnessOwner)invalid();
   stage='scan';const containerName=source.harnessOwner+'-worker-scan',args=nativeStorageScanArgs({containerName,owner:source.harnessOwner,scannerImage:NATIVE_SCAN_IMAGE,imageId:image.id});
   let observed,transportFailed=false;try{observed=await observe(args,{containerName,owner:source.harnessOwner,scannerImage:NATIVE_SCAN_IMAGE,signal:abortSignal});}catch(error){transportFailed=true;observed=error;}
   if(abortSignal?.aborted)transportFailed=true;
   const stdout=channel(observed.stdout),stderr=channel(observed.stderr);if(stdout.length>MAX_FILE||stderr.length>MAX_FILE)invalid();
   let capture={schemaVersion:1,artifactKind:'native-scanner-storage-capture',sourceSha256:storageHash(JSON.stringify(source)),imageId:image.id,result:'observed',observation:observed.storage};try{validateStorageCapture(capture,source,image);}catch{capture={...capture,result:'observer-unavailable',observation:null};}await save('storage.json',capture);
   const status=Number.isInteger(observed.status)&&observed.status>=0&&observed.status<=255?observed.status:null,signal=STORAGE_SIGNALS.includes(observed.signal)?observed.signal:null;
   const errorCode=transportFailed?['ETIMEDOUT','ENOBUFS','ENOENT','EACCES','ABORT_ERR'].includes(observed.code)?observed.code:abortSignal?.aborted?'ABORT_ERR':'OTHER':null;
   const execution={schemaVersion:1,artifactKind:'native-scanner-storage-execution',sourceSha256:storageHash(JSON.stringify(source)),role:'eval-worker',imageId:image.id,scanner:NATIVE_SCAN_IMAGE,outcome:'execution-failed',exitCode:status,signal,parentSignal:abortSignal?.aborted&&['SIGINT','SIGTERM'].includes(abortSignal.reason)?abortSignal.reason:null,errorCode,stdoutBytes:stdout.length,stderrBytes:stderr.length,stdoutSha256:storageHash(stdout),stderrSha256:storageHash(stderr),diagnostics:null,rootCause:'not-established'};
   if(transportFailed||status!==0||signal!==null){execution.diagnostics=dashboardScanFailure({stdout,stderr,status,signal,error:{code:observed.code}});}
   else{
    execution.outcome='invalid-report';try{const scan=JSON.parse(stdout);if(scan.ArtifactType!=='container_image'||scan.ArtifactName!==image.id||scan.Metadata?.ImageID!==image.id||scan.Metadata.ImageConfig?.os!=='linux'||scan.Metadata.ImageConfig.architecture!==source.arch||!Array.isArray(scan.Results)||!scan.Results.length)invalid();await save('worker-scan.json',stdout,{raw:true});try{validateStorageScan(scan,image,source);execution.outcome='policy-passed';}catch{execution.outcome='policy-blocked';}}catch{}
   }
   validateStorageExecution(execution,source,image);await save('scan-execution.json',execution);
   await save('diagnose.json',{schemaVersion:1,artifactKind:STORAGE_KIND,sourceSha256:storageHash(JSON.stringify(source)),scanOutcome:execution.outcome,numericEvidence:storageNumbersComplete(capture)?'sampled':'incomplete-or-unavailable',runtimeAcceptance:'not-performed',releaseComplete:false});
   stage='source-recheck';if(JSON.stringify(await bind(source.arch,source.harnessOwner))!==JSON.stringify(source))invalid();
   if(abortSignal?.aborted||execution.outcome!=='policy-passed'||!storageNumbersComplete(capture))invalid();
  }else if(command==='finalize'){
   let cleanup,failed=false;try{source=validateStorageSource(await load('source.json'));}catch{failed=true;}
   stage='cleanup';try{if(!source)invalid();cleanup=await cleanupState(environment.AGENTCI_STORAGE_STATE_FILE,source,{execute});}catch{cleanup={schemaVersion:1,result:'recovery-required-unverified'};failed=true;}await save('cleanup.json',cleanup);
   stage='finalize';const records={},raw={};for(const file of STORAGE_FILES){try{await lstat(join(directory,file));}catch{continue;}records[file]=null;try{raw[file]=await readPublic(file);records[file]=JSON.parse(raw[file].toString('utf8'));}catch{}}
   let checked;try{checked=validateStorageDiagnosticRecords(records,{scanBytes:raw['worker-scan.json']});if(environment.AGENTCI_STORAGE_DIAGNOSTIC_OUTCOME!=='success'||checked.scanOutcome!=='policy-passed'||checked.numericEvidence!=='sampled'||JSON.stringify(await bind(checked.source.arch,checked.source.harnessOwner))!==JSON.stringify(checked.source))invalid();}catch{failed=true;}
   if(failed)await save('failure-finalize.json',storageFailure(stage,{}));
   const present=await readdir(directory);if(present.some(name=>!STORAGE_FILES.includes(name)))failed=true;
   const files=[];for(const name of present.filter(name=>STORAGE_FILES.includes(name)).sort()){const path=join(directory,name),info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||info.size>MAX_FILE)invalid();const bytes=await readFile(path);files.push({path:name,bytes:bytes.length,sha256:storageHash(bytes)});}
   const retainedOutcome=records['scan-execution.json']?.outcome;
   await save('result.json',{schemaVersion:1,artifactKind:STORAGE_KIND,result:failed?'failed-or-unverified':'diagnostic-recorded',source:source??null,scanOutcome:checked?.scanOutcome??(['policy-passed','policy-blocked','execution-failed','invalid-report'].includes(retainedOutcome)?retainedOutcome:'not-established'),numericEvidence:checked?.numericEvidence??'incomplete-or-unavailable',files,runtimeAcceptance:'not-performed',publication:'not-performed',releaseComplete:false,qualification:'Diagnostic observations only. Before/after PID1 observations unavailable with unchanged run/--rm; extrema are sampled bounds. No runtime, release, customer or M3 acceptance.'});
   if(failed)return {exitCode:1};
  }else invalid();
  return {exitCode:0};
 }catch(error){
  if(command==='source'&&state&&!exported&&source)try{await cleanupState(state,source,{execute});}catch{}
  try{await save('failure-'+(['source','diagnose','finalize'].includes(command)?command:'source')+'.json',storageFailure(stage,error));}catch{}
  return {exitCode:1};
 }
}

export async function storageDiagnosticCLI(arguments_=process.argv.slice(2),options={}){
 if(arguments_[0]!=='diagnose')return runStorageDiagnostic(arguments_[0],{...options,arch:arguments_[1]});
 const abort=new AbortController(),terminate=()=>abort.abort('SIGTERM'),interrupt=()=>abort.abort('SIGINT');process.once('SIGTERM',terminate);process.once('SIGINT',interrupt);
 try{const result=await runStorageDiagnostic(arguments_[0],{...options,arch:arguments_[1],signal:abort.signal});return abort.signal.aborted?{exitCode:1}:result;}
 finally{process.removeListener('SIGTERM',terminate);process.removeListener('SIGINT',interrupt);}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=await storageDiagnosticCLI();if(result.exitCode)console.error('Native storage diagnostic failed or remains unverified; retain bounded diagnostics and owned cleanup.');process.exitCode=result.exitCode;
}
