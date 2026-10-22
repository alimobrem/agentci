import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,readdir,lstat,rm,chmod,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
// @ts-expect-error operational ESM driver
import {bindStorageDiagnosticSource,recoverStorageDiagnosticState,runStorageDiagnostic,storageDiagnosticCLI} from '../scripts/eval-worker-native-storage-diagnostic.mjs';
// @ts-expect-error operational ESM evidence contract
import {STORAGE_KIND,STORAGE_MODE,STORAGE_REF,STORAGE_WORKFLOW,STORAGE_INPUTS,STORAGE_FILES,STORAGE_SIGNALS,storageHash,validateStorageHostedContext,validateStorageSource,validateStorageImage,validateStorageDaemon,validateStorageObservation,validateStorageDiagnosticRecords,validateStorageExecution,storageNumbersComplete} from '../scripts/lib/eval-worker-native-storage-evidence.mjs';
// @ts-expect-error operational ESM scanner contract
import {NATIVE_SCAN_IMAGE,evalNativeLabels} from '../scripts/lib/eval-worker-native-evidence.mjs';
// @ts-expect-error operational ESM numeric observer
import {nativeStorageScanArgs,nativeStorageBaselineSha256,parseNativeStorageCounters} from '../scripts/lib/eval-worker-native-storage.mjs';

const commit='1'.repeat(40),tree='2'.repeat(40),hash='3'.repeat(64),imageId='sha256:'+'4'.repeat(64),containerId='5'.repeat(64),owner='agentci-smoke-'+'6'.repeat(16);
const clone=<T>(v:T):T=>structuredClone(v);
function source(harnessOwner=owner,arch='amd64'){
 return {schemaVersion:1,artifactKind:STORAGE_KIND,mode:STORAGE_MODE,repository:'alimobrem/agentci',ref:STORAGE_REF,workflowPath:STORAGE_WORKFLOW,workflowRef:'alimobrem/agentci/'+STORAGE_WORKFLOW+'@'+STORAGE_REF,workflowSha:commit,workflowPermissions:'contents-read-only',sourceCommit:commit,sourceTree:tree,candidateCommit:commit,expectedSourceCommit:commit,checkoutParents:['7'.repeat(40)],event:'workflow_dispatch',runId:'123',attempt:'1',arch,platform:'linux/'+arch,node:'v26.10.0',harnessOwner,rootLockSha256:hash,packageLockSha256:hash,nativePinsSha256:hash,dockerfileSha256:hash,inputs:STORAGE_INPUTS.map((path:string)=>({path,sha256:hash}))};
}
const context=()=>({GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'alimobrem/agentci',GITHUB_EVENT_NAME:'workflow_dispatch',AGENTCI_STORAGE_MODE:STORAGE_MODE,AGENTCI_CONTAINER_ENGINE:'docker',GITHUB_REF:STORAGE_REF,GITHUB_WORKFLOW_REF:'alimobrem/agentci/'+STORAGE_WORKFLOW+'@'+STORAGE_REF,GITHUB_WORKFLOW_SHA:commit,INPUT_EXPECTED_SOURCE:commit,GITHUB_SHA:commit,GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1'});
const runtime={platform:'linux',arch:'x64',node:'v26.10.0'};
const image=(s=source())=>({role:'eval-worker',id:imageId,os:'linux',arch:s.arch,user:'1001',command:['node','dist/apps/eval-worker/main.js'],entrypoint:null,labels:evalNativeLabels(s,'eval-worker')});
const scan=(s=source())=>({ArtifactType:'container_image',ArtifactName:imageId,Metadata:{ImageID:imageId,ImageConfig:{os:'linux',architecture:s.arch}},Results:[{Target:'synthetic-image',Vulnerabilities:[]}]});
function observation(s=source()){
 const expected={containerName:s.harnessOwner+'-worker-scan',owner:s.harnessOwner,scannerImage:NATIVE_SCAN_IMAGE,imageId};
 const args=nativeStorageScanArgs(expected),baseline={owner:s.harnessOwner,image:NATIVE_SCAN_IMAGE,readOnly:true,tmpfs:{'/tmp':'rw,nosuid,nodev,size=1g'},binds:['/var/run/docker.sock:/var/run/docker.sock'],user:'',entrypoint:['trivy'],cmd:args.slice(12),privileged:false,capAdd:[],mounts:[]};
 const sample={elapsedMs:20,...parseNativeStorageCounters(Buffer.from('4096 262144 131072 131070 65536 32768\n'))};
 const path=()=>({samples:[clone(sample)],validSamples:1,minimumFreeBytes:sample.freeBytes,maximumUsedBytes:sample.usedBytes,minimumFreeInodes:sample.freeInodes});
 return {schemaVersion:1,artifactKind:'native-scanner-storage-observation',scope:'diagnostic-only',containerId,baseline:{result:'matched',sha256:nativeStorageBaselineSha256(args,expected),observed:baseline},pollIntervalMs:250,availabilityPollIntervalMs:500,probeTimeoutMs:500,maxSamplesPerPath:32,maxInspectAttempts:360,maxStatAttempts:64,attempts:{inspect:1,stat:2},boundsReached:{inspect:false,stat:false},paths:{tmp:path(),cache:path()},unavailable:[],unavailableCounts:{},lifecycle:{before:'unavailable-before-scanner-start',after:'unavailable-after-scanner-lifetime',termination:'scanner-finished'},hostChildren:{started:4,closed:4,active:0,cleanup:'complete'},qualification:'Sampled maximum used is a lower bound on peak; sampled minimum free bytes/inodes are upper bounds on true minima. Paths report filesystem occupancy, not directory sizes. No runtime acceptance.'};
}
function records(s=source()){
 const bytes=Buffer.from(JSON.stringify(scan(s))),sourceSha256=storageHash(JSON.stringify(s));
 return {'source.json':s,'daemon.json':{os:'linux',arch:s.arch},'image.json':image(s),'storage.json':{schemaVersion:1,artifactKind:'native-scanner-storage-capture',sourceSha256,imageId,result:'observed',observation:observation(s)},'scan-execution.json':{schemaVersion:1,artifactKind:'native-scanner-storage-execution',sourceSha256,role:'eval-worker',imageId,scanner:NATIVE_SCAN_IMAGE,outcome:'policy-passed',exitCode:0,signal:null,parentSignal:null,errorCode:null,stdoutBytes:bytes.length,stderrBytes:0,stdoutSha256:storageHash(bytes),stderrSha256:storageHash(Buffer.alloc(0)),diagnostics:null,rootCause:'not-established'},'worker-scan.json':scan(s),'diagnose.json':{schemaVersion:1,artifactKind:STORAGE_KIND,sourceSha256,scanOutcome:'policy-passed',numericEvidence:'sampled',runtimeAcceptance:'not-performed',releaseComplete:false},'cleanup.json':{schemaVersion:1,result:'passed',owner:s.harnessOwner,ownedContainers:0,ownedNetworks:0,ownedVolumes:0,privateFilesRemoved:true}};
}
const artifactDirectory=(root:string)=>join(root,'.agentci/artifacts/eval-worker-native-storage-diagnostic');
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'storage-diagnostic-test-')),environment:any={...context(),GITHUB_ENV:join(root,'github-env'),GITHUB_OUTPUT:join(root,'github-output')};
 await writeFile(environment.GITHUB_ENV,'');await writeFile(environment.GITHUB_OUTPUT,'');
 const bindSource=async(arch:string,harnessOwner:string)=>source(harnessOwner,arch);
 const calls:any[]=[];
 const execute=(command:string,args:string[])=>{assert.equal(command,'docker');calls.push(args);if(args[0]==='info')return JSON.stringify({os:'linux',arch:'x86_64'});if(args[0]==='image'){const s=currentSource;return JSON.stringify([{Id:imageId,Os:'linux',Architecture:s.arch,Config:{User:'1001',Cmd:['node','dist/apps/eval-worker/main.js'],Entrypoint:null,Labels:evalNativeLabels(s,'eval-worker')}}]);}return '';};
 let currentSource=source();
 const options:any={root,environment,runtime,bindSource,execute,arch:'amd64',observe:async(_args:unknown,expected:any)=>{const s=source(expected.owner);return {stdout:Buffer.from(JSON.stringify(scan(s))),stderr:Buffer.alloc(0),status:0,signal:null,storage:observation(s)};}};
 const prepare=async()=>{assert.equal((await runStorageDiagnostic('source',options)).exitCode,0);currentSource=JSON.parse(await readFile(join(artifactDirectory(root),'source.json'),'utf8'));environment.AGENTCI_STORAGE_STATE_FILE=(await readFile(environment.GITHUB_ENV,'utf8')).trim().split('=')[1];return currentSource;};
 const finish=async()=>{environment.AGENTCI_STORAGE_DIAGNOSTIC_OUTCOME='success';return runStorageDiagnostic('finalize',options);};
 const dispose=async()=>{if(environment.AGENTCI_STORAGE_STATE_FILE){await rm(dirname(environment.AGENTCI_STORAGE_STATE_FILE),{recursive:true,force:true});await rm(dirname(environment.AGENTCI_STORAGE_STATE_FILE)+'.cleanup.json',{force:true});}await rm(root,{recursive:true,force:true});};
 return {root,environment,options,calls,prepare,finish,dispose};
}

test('hosted source gate rejects repository, workflow, ref, source, mode and native-runtime substitutions before any engine call',async()=>{
 assert.equal(validateStorageHostedContext(context(),runtime,'amd64',commit),true);
 for(const change of [{GITHUB_ACTIONS:'false'},{GITHUB_REPOSITORY:'other/agentci'},{GITHUB_EVENT_NAME:'push'},{GITHUB_REF:'refs/heads/main'},{GITHUB_WORKFLOW_REF:'alimobrem/agentci/.github/workflows/verify.yaml@'+STORAGE_REF},{GITHUB_WORKFLOW_SHA:'8'.repeat(40)},{GITHUB_SHA:'8'.repeat(40)},{INPUT_EXPECTED_SOURCE:[commit]},{AGENTCI_STORAGE_MODE:'dashboard'},{AGENTCI_CONTAINER_ENGINE:'podman'},{GITHUB_RUN_ATTEMPT:'0'}])assert.throws(()=>validateStorageHostedContext({...context(),...change},runtime,'amd64',commit));
 for(const changed of [{...runtime,platform:'darwin'},{...runtime,arch:'arm64'},{...runtime,node:'v26.9.0'}])assert.throws(()=>validateStorageHostedContext(context(),changed,'amd64',commit));
 const commands:string[]=[];await assert.rejects(bindStorageDiagnosticSource('amd64',owner,{environment:{...context(),GITHUB_REPOSITORY:'other/repo'},runtime,execute:(_c:string,args:string[])=>{commands.push(args[0]!);return commit;},verifyInputs:()=>assert.fail('must not verify after context rejection')}));assert.deepEqual(commands,['rev-parse']);
});

test('retained source is exact, typed and binds lock, provenance and ordered input hashes',()=>{
 validateStorageSource(source());
 const mutations=[(v:any)=>v.sourceCommit=[commit],(v:any)=>v.harnessOwner=[owner],(v:any)=>v.runId=['123'],(v:any)=>v.workflowPermissions='write-all',(v:any)=>v.candidateCommit='8'.repeat(40),(v:any)=>v.expectedSourceCommit='8'.repeat(40),(v:any)=>v.checkoutParents=[['7'.repeat(40)]],(v:any)=>v.packageLockSha256='8'.repeat(64),(v:any)=>v.inputs.reverse(),(v:any)=>v.inputs[0].sha256=[hash],(v:any)=>v.inputs[0].private='withheld'];
 for(const mutate of mutations){const v=source();mutate(v);assert.throws(()=>validateStorageSource(v));}
});

test('source binding verifies regular committed input bytes and modes instead of trusting a source label',async()=>{
 const root=await mkdtemp(join(tmpdir(),'storage-source-bind-')),committed=new Map<string,Buffer>();let verified=0;const commands:string[]=[];
 try{
  for(const path of STORAGE_INPUTS){const bytes=Buffer.from(path===STORAGE_WORKFLOW?"permissions:\n  contents: read\non:\n  workflow_dispatch:\njobs:\n  diagnostic:\n    if: inputs.qualification == 'eval-storage-diagnostic'\n":['package-lock.json','npm-shrinkwrap.json'].includes(path)?'authentic-synthetic-lock\n':'synthetic committed '+path+'\n');committed.set(path,bytes);await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),bytes);}
  const execute=(_command:string,args:string[])=>{commands.push(args[0]!);if(args[0]==='rev-parse')return args[1]==='HEAD'?commit:tree;if(args[0]==='diff')return '';if(args[0]==='ls-tree')return '100644 blob '+'9'.repeat(40)+'\t'+args.at(-1)+'\0';if(args[0]==='show'&&args[1]==='-s')return '7'.repeat(40);if(args[0]==='show')return committed.get(args[1]!.slice(5));assert.fail('Unexpected source operation');};
  const options={root,environment:context(),runtime,execute,verifyInputs:()=>{verified++;}},bound=await bindStorageDiagnosticSource('amd64',owner,options);assert.equal(verified,1);assert.equal(bound.inputs.length,STORAGE_INPUTS.length);for(const input of bound.inputs)assert.equal(input.sha256,storageHash(committed.get(input.path)));assert.equal(bound.rootLockSha256,bound.packageLockSha256);assert.ok(!commands.includes('docker'));
  const path=join(root,STORAGE_INPUTS[0]);await writeFile(path,'changed after commit');await assert.rejects(bindStorageDiagnosticSource('amd64',owner,options));assert.equal(verified,1);await writeFile(path,committed.get(STORAGE_INPUTS[0])!);await rm(path);await symlink(join(root,'LICENSE'),path);await assert.rejects(bindStorageDiagnosticSource('amd64',owner,options));assert.equal(verified,1);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('native daemon and worker projection reject foreign image, wrong architecture, labels, user and executable',()=>{
 validateStorageDaemon({os:'linux',arch:'amd64'},source());validateStorageImage(image(),source());
 for(const change of [{arch:'arm64'},{os:'windows'},{role:'eval-runner'},{id:[imageId]},{user:'0'},{command:['sh']},{entrypoint:['sh']},{labels:{...image().labels,'org.agentci.source-tree':'8'.repeat(40)}}])assert.throws(()=>validateStorageImage({...image(),...change},source()));
 assert.throws(()=>validateStorageDaemon({os:'linux',arch:'arm64'},source()));assert.throws(()=>validateStorageDaemon({os:'linux',arch:'amd64',Env:'PRIVATE-CANARY'},source()));
});

test('same-container storage validates safe arithmetic, exact extrema, original baseline and bounded observations',()=>{
 const valid=observation();validateStorageObservation(valid,{source:source(),image:image()});assert.equal(valid.paths.tmp.samples[0].totalBytes,1073741824);assert.equal(valid.paths.tmp.samples[0].usedBytes,536870912);
 for(const mutate of [(v:any)=>v.paths.tmp.samples[0].usedBytes++,(v:any)=>v.paths.cache.samples[0].totalBlocks=Number.MAX_SAFE_INTEGER,(v:any)=>v.paths.tmp.minimumFreeBytes--,(v:any)=>v.paths.tmp.samples[0].private='PRIVATE-CANARY',(v:any)=>v.paths.tmp.validSamples=2,(v:any)=>v.attempts.stat=65,(v:any)=>v.boundsReached.stat=true,(v:any)=>v.baseline.observed.tmpfs['/tmp']='size=2g',(v:any)=>v.baseline.observed.Env=['PRIVATE-CANARY'],(v:any)=>v.containerId=null,(v:any)=>v.hostChildren.closed--,(v:any)=>v.pollIntervalMs=500,(v:any)=>v.availabilityPollIntervalMs=250,(v:any)=>v.unavailable=[{elapsedMs:20,pathClass:'tmp',reason:'unknown',exitCode:null,signal:null}]]){const v=clone(valid);mutate(v);assert.throws(()=>validateStorageObservation(v,{source:source(),image:image()}));}
 const signalled:any=clone(valid);signalled.lifecycle.termination='scanner-signalled';signalled.unavailable=[{elapsedMs:20,pathClass:'tmp',reason:'probe-timeout',exitCode:null,signal:'SIGBUS'}];signalled.unavailableCounts={'probe-timeout':1};validateStorageObservation(signalled,{source:source(),image:image()});
});

test('unavailable observations never become measured zero or complete numeric evidence',()=>{
 const v:any=observation();v.containerId=null;v.baseline={result:'not-observed',sha256:null,observed:null};v.attempts={inspect:1,stat:0};v.hostChildren={started:2,closed:2,active:0,cleanup:'complete'};for(const path of ['tmp','cache'])v.paths[path]={samples:[],validSamples:0,minimumFreeBytes:null,maximumUsedBytes:null,minimumFreeInodes:null};v.unavailable=[{elapsedMs:20,pathClass:'container',reason:'not-observed',exitCode:null,signal:null}];v.unavailableCounts={'not-observed':1};validateStorageObservation(v,{source:source(),image:image()});assert.equal(storageNumbersComplete({result:'observed',observation:v}),false);v.paths.tmp.minimumFreeBytes=0;assert.throws(()=>validateStorageObservation(v,{source:source(),image:image()}));
});

test('actual source/scan/storage/finalizer filesystem roundtrip indexes exact public bytes and cleans only owned state',async()=>{
 const f=await fixture();try{
  const s=await f.prepare(),state=f.environment.AGENTCI_STORAGE_STATE_FILE;assert.equal((await lstat(dirname(state))).mode&0o777,0o700);assert.equal((await lstat(state)).mode&0o777,0o600);
  assert.match(await readFile(f.environment.GITHUB_OUTPUT,'utf8'),new RegExp('source='+s.sourceCommit));
  const foreign=await mkdtemp(join(tmpdir(),'storage-foreign-'));try{await writeFile(join(foreign,'keep'),'foreign');assert.equal((await runStorageDiagnostic('diagnose',f.options)).exitCode,0);assert.equal((await f.finish()).exitCode,0);assert.equal(await readFile(join(foreign,'keep'),'utf8'),'foreign');}finally{await rm(foreign,{recursive:true,force:true});}
  await assert.rejects(lstat(dirname(state)),{code:'ENOENT'});const result=JSON.parse(await readFile(join(artifactDirectory(f.root),'result.json'),'utf8'));assert.equal(result.result,'diagnostic-recorded');assert.equal(result.runtimeAcceptance,'not-performed');assert.equal(result.publication,'not-performed');assert.equal(result.releaseComplete,false);
  const listed=await readdir(artifactDirectory(f.root));assert.deepEqual(result.files.map((v:any)=>v.path),listed.filter(name=>name!=='result.json').sort());
  for(const entry of result.files){const bytes=await readFile(join(artifactDirectory(f.root),entry.path));assert.equal(entry.bytes,bytes.length);assert.equal(entry.sha256,storageHash(bytes));}
  assert.equal(result.files.length,8);assert.equal(f.calls.filter(a=>a[0]==='ps').length,2);assert.ok(!JSON.stringify(result).includes(state));
 }finally{await f.dispose();}
});

test('execution failure retains numeric observations and classifier hashes while withholding scanner/private diagnostics',async()=>{
 const f=await fixture();try{const s=await f.prepare(),stderr=Buffer.from('PRIVATE-CANARY /tmp/trivy-cache: no space left on device');f.options.observe=async()=>{throw Object.assign(Error('PRIVATE-CANARY'),{stdout:Buffer.from('PRIVATE-STDOUT'),stderr,status:1,signal:null,storage:observation(s)});};assert.equal((await runStorageDiagnostic('diagnose',f.options)).exitCode,1);f.environment.AGENTCI_STORAGE_DIAGNOSTIC_OUTCOME='failure';assert.equal((await f.finish()).exitCode,1);
  const directory=artifactDirectory(f.root),execution=JSON.parse(await readFile(join(directory,'scan-execution.json'),'utf8'));assert.equal(execution.outcome,'execution-failed');assert.equal(execution.exitCode,1);assert.equal(execution.stderrSha256,storageHash(stderr));assert.equal(execution.diagnostics.cause,'scratch-space-exhausted');assert.equal(execution.rootCause,'not-established');const capture=JSON.parse(await readFile(join(directory,'storage.json'),'utf8'));assert.equal(capture.result,'observed');assert.equal(capture.observation.paths.tmp.validSamples,1);assert.equal(capture.observation.hostChildren.active,0);
  for(const name of await readdir(directory)){const bytes=await readFile(join(directory,name),'utf8');assert.ok(!bytes.includes('PRIVATE-CANARY'));assert.ok(!bytes.includes('PRIVATE-STDOUT'));}assert.equal((await readdir(directory)).includes('worker-scan.json'),false);
 }finally{await f.dispose();}
});

test('fixable HIGH policy failure remains retained and diagnostic-recorded is refused',async()=>{
 const f=await fixture();try{const s=await f.prepare(),blocked=scan(s);blocked.Results[0]!.Vulnerabilities.push({Severity:'HIGH',FixedVersion:'patched'} as never);f.options.observe=async()=>({stdout:Buffer.from(JSON.stringify(blocked)),stderr:Buffer.alloc(0),status:0,signal:null,storage:observation(s)});assert.equal((await runStorageDiagnostic('diagnose',f.options)).exitCode,1);assert.equal((await f.finish()).exitCode,1);const result=JSON.parse(await readFile(join(artifactDirectory(f.root),'result.json'),'utf8'));assert.equal(result.scanOutcome,'policy-blocked');assert.equal(result.result,'failed-or-unverified');assert.equal(result.releaseComplete,false);}finally{await f.dispose();}
});

test('source recheck and execution parent-signal guard prevent late cancellation from becoming success',async()=>{
 const f=await fixture();try{const s=await f.prepare();let count=0;f.options.bindSource=async()=>{if(++count===2)process.emit('SIGTERM');return s;};assert.equal((await storageDiagnosticCLI(['diagnose'],f.options)).exitCode,1);assert.equal(process.listenerCount('SIGTERM'),0);assert.equal((await f.finish()).exitCode,1);const failed=JSON.parse(await readFile(join(artifactDirectory(f.root),'failure-diagnose.json'),'utf8'));assert.equal(failed.stage,'source-recheck');const r:any=records(s);r['scan-execution.json'].parentSignal='SIGTERM';assert.throws(()=>validateStorageExecution(r['scan-execution.json'],s,image(s)));}finally{await f.dispose();}
});

test('any failure member vetoes retained-record validation, including malformed failure JSON in the actual finalizer',async()=>{
 for(const name of STORAGE_FILES.filter((name:string)=>name.startsWith('failure-')))assert.throws(()=>validateStorageDiagnosticRecords({...records(),[name]:null}));
 const f=await fixture();try{await f.prepare();assert.equal((await runStorageDiagnostic('diagnose',f.options)).exitCode,0);await writeFile(join(artifactDirectory(f.root),'failure-diagnose.json'),'{malformed');assert.equal((await f.finish()).exitCode,1);const result=JSON.parse(await readFile(join(artifactDirectory(f.root),'result.json'),'utf8'));assert.equal(result.result,'failed-or-unverified');assert.ok(result.files.some((v:any)=>v.path==='failure-diagnose.json'));assert.ok(result.files.some((v:any)=>v.path==='failure-finalize.json'));}finally{await f.dispose();}
});

test('retained scan bytes must match the execution digest, and unknown members fail closed',async()=>{
 const r=records(),bytes=Buffer.from(JSON.stringify(r['worker-scan.json']));validateStorageDiagnosticRecords(r,{scanBytes:bytes});assert.throws(()=>validateStorageDiagnosticRecords(r));assert.throws(()=>validateStorageDiagnosticRecords(r,{scanBytes:Buffer.from(JSON.stringify(r['worker-scan.json'],null,2))}));
 for(const mutation of ['scan-bytes','unknown-member']){const f=await fixture();try{await f.prepare();assert.equal((await runStorageDiagnostic('diagnose',f.options)).exitCode,0);if(mutation==='scan-bytes'){const path=join(artifactDirectory(f.root),'worker-scan.json');await writeFile(path,(await readFile(path,'utf8'))+'\n');}else await writeFile(join(artifactDirectory(f.root),'unindexed.json'),'{}');assert.equal((await f.finish()).exitCode,1);assert.equal(JSON.parse(await readFile(join(artifactDirectory(f.root),'result.json'),'utf8')).result,'failed-or-unverified');}finally{await f.dispose();}}
});

test('private recovery journal refuses wrong owner, symlinks and loose permissions before any engine access',async()=>{
 const root=await mkdtemp(join(tmpdir(),'agentci-image-smoke-test-')),path=join(root,'ownership.json'),s=source();await chmod(root,0o700);let calls=0;const execute=()=>{calls++;return '';};
 try{await writeFile(path,JSON.stringify({schemaVersion:1,owner:'agentci-smoke-'+'8'.repeat(16)}),{mode:0o600});await assert.rejects(recoverStorageDiagnosticState(path,s,{execute}));assert.equal(calls,0);await writeFile(path,JSON.stringify({schemaVersion:1,owner:s.harnessOwner}));await chmod(path,0o644);await assert.rejects(recoverStorageDiagnosticState(path,s,{execute}));assert.equal(calls,0);await chmod(path,0o600);const link=join(root,'journal-link');await symlink(path,link);await assert.rejects(recoverStorageDiagnosticState(link,s,{execute}));assert.equal(calls,0);await rm(link);const cleanup=await recoverStorageDiagnosticState(path,s,{execute});assert.equal(cleanup.privateFilesRemoved,true);assert.equal(cleanup.ownedContainers,0);assert.equal(calls,6);await assert.rejects(lstat(root),{code:'ENOENT'});}finally{await rm(root,{recursive:true,force:true});await rm(root+'.cleanup.json',{force:true});}
});

test('actual CLI SIGTERM cancellation stops and awaits its real owned scanner/probe subprocesses without claiming container cleanup', {timeout:15000},async()=>{
 const f=await fixture();const pids:number[]=[];let child:ReturnType<typeof spawn>|undefined;
 try{
  const s=await f.prepare(),driver=pathToFileURL(resolve('scripts/eval-worker-native-storage-diagnostic.mjs')).href,helper=pathToFileURL(resolve('scripts/lib/eval-worker-native-storage.mjs')).href;
  const wrapper=join(f.root,'cancel-driver.mjs');
  await writeFile(wrapper,`import {spawn} from 'node:child_process';import {storageDiagnosticCLI} from ${JSON.stringify(driver)};import {createNativeStorageRunner} from ${JSON.stringify(helper)};
const source=${JSON.stringify(s)},options=${JSON.stringify({root:f.root,environment:f.environment,runtime})};
options.bindSource=async()=>source;options.execute=(_command,args)=>args[0]==='info'?JSON.stringify({os:'linux',arch:'amd64'}):JSON.stringify([{Id:${JSON.stringify(imageId)},Os:'linux',Architecture:'amd64',Config:{User:'1001',Cmd:['node','dist/apps/eval-worker/main.js'],Entrypoint:null,Labels:${JSON.stringify(evalNativeLabels(s,'eval-worker'))}}}]);
const inspected=${JSON.stringify({...observation(s).baseline.observed,id:containerId,running:true})};
options.observe=createNativeStorageRunner((_command,args,childOptions)=>{const code=args[0]==='inspect'?'process.stdout.write('+JSON.stringify(JSON.stringify(inspected))+');':'setInterval(()=>{},1000)';const child=spawn(process.execPath,['-e',code],childOptions);child.once('spawn',()=>process.send?.({kind:args[0],pid:child.pid}));return child;});
const result=await storageDiagnosticCLI(['diagnose'],options);process.exitCode=result.exitCode;
`);
  child=spawn(process.execPath,[wrapper],{env:{PATH:process.env.PATH},stdio:['ignore','pipe','pipe','ipc']});let sent=false,output='';child.stdout?.on('data',v=>output+=v);child.stderr?.on('data',v=>output+=v);
  const completed=new Promise<{code:number|null,signal:NodeJS.Signals|null}>((resolve,reject)=>{child!.once('error',reject);child!.once('close',(code,signal)=>resolve({code,signal}));});
  child.on('message',(message:any)=>{if(typeof message.pid==='number')pids.push(message.pid);if(message.kind==='exec'&&!sent){sent=true;child!.kill('SIGTERM');}});
  let timer:ReturnType<typeof setTimeout>|undefined;const result=await Promise.race([completed,new Promise<never>((_r,reject)=>{timer=setTimeout(()=>reject(Error('Controlled cancellation child did not settle')),10000);})]).finally(()=>clearTimeout(timer));
  assert.equal(sent,true);assert.equal(result.code,1);assert.equal(result.signal,null);assert.equal(output,'');for(const pid of pids)assert.throws(()=>process.kill(pid,0),{code:'ESRCH'});
  const directory=artifactDirectory(f.root),execution=JSON.parse(await readFile(join(directory,'scan-execution.json'),'utf8')),capture=JSON.parse(await readFile(join(directory,'storage.json'),'utf8'));assert.equal(execution.parentSignal,'SIGTERM');assert.equal(execution.outcome,'execution-failed');assert.equal(execution.errorCode,'ABORT_ERR');assert.equal(execution.signal,'SIGTERM');assert.equal(capture.result,'observed');assert.equal(capture.observation.lifecycle.termination,'cancelled');assert.equal(capture.observation.hostChildren.active,0);assert.equal(capture.observation.hostChildren.cleanup,'complete');assert.equal((await readdir(directory)).includes('cleanup.json'),false);assert.ok(await lstat(f.environment.AGENTCI_STORAGE_STATE_FILE));
  f.environment.AGENTCI_STORAGE_DIAGNOSTIC_OUTCOME='failure';assert.equal((await f.finish()).exitCode,1);const cleanup=JSON.parse(await readFile(join(directory,'cleanup.json'),'utf8'));assert.equal(cleanup.privateFilesRemoved,true);assert.equal(cleanup.owner,s.harnessOwner);
 }finally{if(child&&child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');for(const pid of pids)try{process.kill(pid,'SIGKILL');}catch{}await f.dispose();}
});

test('source CLI does not intercept termination while an injected source phase is pending', {timeout:10000},async()=>{
 const root=await mkdtemp(join(tmpdir(),'storage-source-signal-'));let child:ReturnType<typeof spawn>|undefined;
 try{const wrapper=join(root,'source-signal.mjs'),driver=pathToFileURL(resolve('scripts/eval-worker-native-storage-diagnostic.mjs')).href;await writeFile(wrapper,`import {storageDiagnosticCLI} from ${JSON.stringify(driver)};const result=await storageDiagnosticCLI(['source','amd64'],{root:${JSON.stringify(root)},bindSource:async()=>{process.send?.('waiting');await new Promise(()=>setInterval(()=>{},1000));}});process.exitCode=result.exitCode;`);child=spawn(process.execPath,[wrapper],{env:{PATH:process.env.PATH},stdio:['ignore','ignore','ignore','ipc']});child.once('message',()=>child!.kill('SIGTERM'));const result=await new Promise<{code:number|null,signal:NodeJS.Signals|null}>((resolve,reject)=>{child!.once('error',reject);child!.once('close',(code,signal)=>resolve({code,signal}));});assert.equal(result.code,null);assert.equal(result.signal,'SIGTERM');}finally{if(child&&child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await rm(root,{recursive:true,force:true});}
});
