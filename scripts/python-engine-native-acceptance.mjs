import {spawn,execFileSync} from 'node:child_process';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {appendFileSync,existsSync,lstatSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,realpathSync,renameSync,rmdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename,dirname,isAbsolute,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {PYTHON_NATIVE_KIND,PYTHON_NATIVE_MODE,PYTHON_NATIVE_REF,PYTHON_NATIVE_WORKFLOW,PYTHON_NATIVE_INPUTS,PYTHON_NATIVE_FILES,NATIVE_SCAN_IMAGE,pythonNativeHash as hash,pythonNativeLabels,validatePythonNativeHostedContext,validatePythonNativeSource,validatePythonNativeDaemon,validatePythonNativeImage,validatePythonNativeScan,validatePythonNativeScanExecution,validatePythonNativeRuntime,validatePythonNativeRecords,pythonNativeFailure} from './lib/python-engine-native-evidence.mjs';

const OWNER_LABEL='agentci.image-smoke.owner',CACHE_LABEL='agentci.python-native.cache-owner',CACHE='agentci-trivy-cache';
const CAP=8*1024*1024,ROOT=realpathSync(process.cwd()),PUBLIC=resolve(ROOT,'.agentci/artifacts/eval-engines-native');
// Darwin is supported only for inert process-group unit controls; hosted source is Linux-only.
const ownProcessGroup=['linux','darwin'].includes(process.platform);
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/,ownerPattern=/^agentci-smoke-[a-f0-9]{16}$/,imagePattern=/^sha256:[a-f0-9]{64}$/;
const safeError=()=>Error('Native Python qualification failed; private diagnostics withheld');
const requireProof=condition=>{if(!condition)throw safeError();};
const json=bytes=>JSON.parse(bytes.toString('utf8'));
const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const sourceHash=source=>hash(JSON.stringify(source));
const exactKeys=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&JSON.stringify(Object.keys(value).sort())===JSON.stringify([...keys].sort());
let interrupted=null,publicOwned=false;

/** Capture each channel independently; excess bytes, timeout and signals never pass. */
export function runPythonNativeChild(command,args,{environment={PATH:process.env.PATH},timeoutMs=60000,graceMs=5000,cap=CAP,spawnChild=spawn,abortSignal}={}){
 return new Promise(resolveResult=>{
  let child,settled=false,closed=false,timedOut=false,overflow=false,forced=false,errorCode=null,timer,forceTimer,reapTimer;
  const chunks={stdout:[],stderr:[]},sizes={stdout:0,stderr:0},digests={stdout:createHash('sha256'),stderr:createHash('sha256')};
  const kill=signal=>{try{if(spawnChild===spawn&&ownProcessGroup&&Number.isSafeInteger(child?.pid)&&child.pid>0)process.kill(-child.pid,signal);else child?.kill(signal);}catch(error){if(error.code!=='ESRCH'&&!errorCode)errorCode='OTHER';}};
  const terminate=code=>{if(!errorCode)errorCode=code;kill('SIGTERM');if(!forceTimer)forceTimer=setTimeout(()=>{forced=true;kill('SIGKILL');reapTimer=setTimeout(()=>finish(null,null),5000);},graceMs);};
  const abort=()=>terminate('ABORT_ERR');
  const finish=(exitCode,signal)=>{if(settled)return;settled=true;clearTimeout(timer);clearTimeout(forceTimer);clearTimeout(reapTimer);abortSignal?.removeEventListener('abort',abort);
   // A closed leader is insufficient when an interrupted test left CLI descendants.
   // Only a real child in its own group can reach this path; fake PIDs never do.
   if(spawnChild===spawn&&ownProcessGroup&&Number.isSafeInteger(child?.pid)&&child.pid>0)try{process.kill(-child.pid,'SIGKILL');forced=true;if(!errorCode)errorCode='OTHER';}catch(error){if(error.code!=='ESRCH'&&!errorCode)errorCode='OTHER';}
   resolveResult({exitCode:Number.isInteger(exitCode)&&exitCode>=0&&exitCode<=255?exitCode:null,signal:signal??null,errorCode,forced,closed,timedOut,overflow,stdout:Buffer.concat(chunks.stdout),stderr:Buffer.concat(chunks.stderr),stdoutBytes:sizes.stdout,stderrBytes:sizes.stderr,stdoutSha256:digests.stdout.digest('hex'),stderrSha256:digests.stderr.digest('hex')});};
  if(abortSignal?.aborted){errorCode='ABORT_ERR';finish(null,null);return;}
  try{child=spawnChild(command,args,{cwd:ROOT,env:environment,stdio:['ignore','pipe','pipe'],detached:ownProcessGroup});}catch(error){errorCode=['ENOENT','EACCES'].includes(error.code)?error.code:'OTHER';finish(null,null);return;}
  for(const channel of ['stdout','stderr'])child[channel].on('data',value=>{if(settled)return;const data=Buffer.from(value);sizes[channel]+=data.length;digests[channel].update(data);if(sizes[channel]<=cap)chunks[channel].push(data);else{overflow=true;terminate('ENOBUFS');}});
  child.on('error',error=>{errorCode=['ENOENT','EACCES'].includes(error.code)?error.code:'OTHER';});
  child.on('close',(code,signal)=>{closed=true;finish(code,signal);});
  timer=setTimeout(()=>{timedOut=true;terminate('ETIMEDOUT');},timeoutMs);
  abortSignal?.addEventListener('abort',abort,{once:true});if(abortSignal?.aborted)abort();
 });
}
const observedPassed=result=>result.closed&&result.exitCode===0&&result.signal===null&&result.errorCode===null&&!result.forced&&!result.overflow&&!result.timedOut;
/** Deliver queued cancellation before publishing a successful phase. */
export async function pythonNativeCompletionBoundary({abortSignal}={}){await new Promise(done=>setImmediate(done));requireProof(!abortSignal?.aborted);}
const boundedChannels=result=>({stdoutBytes:result.stdoutBytes,stderrBytes:result.stderrBytes,stdoutSha256:result.stdoutSha256,stderrSha256:result.stderrSha256});
const cleanEnvironment=()=>({PATH:dirname(process.execPath)+':/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'});
const abortController=new AbortController();
async function engine(args,{cleanup=false,timeoutMs=30000}={}){
 const result=await runPythonNativeChild('docker',args,{environment:cleanEnvironment(),timeoutMs,graceMs:5000,...(cleanup?{}:{abortSignal:abortController.signal})});
 requireProof(observedPassed(result));return result.stdout.toString('utf8').trim();
}
function regular(path,{privateFile=false}={}){
 requireProof(typeof path==='string'&&isAbsolute(path)&&resolve(path)===path&&realpathSync(path)===path);
 const stat=lstatSync(path);requireProof(stat.isFile()&&!stat.isSymbolicLink()&&(!process.getuid||stat.uid===process.getuid())&&(!privateFile||(stat.mode&0o777)===0o600));return stat;
}
function directory(path,{privateDirectory=false}={}){
 const stat=lstatSync(path);requireProof(realpathSync(path)===path&&stat.isDirectory()&&!stat.isSymbolicLink()&&(!process.getuid||stat.uid===process.getuid())&&!(stat.mode&0o022)&&(!privateDirectory||(stat.mode&0o777)===0o700));
}
function preparePublic(fresh=false){
 for(const path of [resolve(ROOT,'.agentci'),resolve(ROOT,'.agentci/artifacts'),PUBLIC]){if(!existsSync(path))mkdirSync(path,{mode:0o700});directory(path);}
 if(fresh)requireProof(readdirSync(PUBLIC).length===0);
}
function writePublic(name,value){requireProof(publicOwned&&PYTHON_NATIVE_FILES.includes(name));preparePublic();writeFileSync(join(PUBLIC,name),Buffer.isBuffer(value)?value:encode(value),{flag:'wx',mode:0o600});}
function publicBytes(name){requireProof(PYTHON_NATIVE_FILES.includes(name));const path=join(PUBLIC,name),stat=regular(path);requireProof(stat.size>0&&stat.size<=CAP);return readFileSync(path);}
function git(args){return execFileSync('git',args,{cwd:ROOT,env:cleanEnvironment(),timeout:30000,maxBuffer:CAP}).toString('utf8').trim();}
function committedSource(arch,identity){
 const head=git(['rev-parse','HEAD']);validatePythonNativeHostedContext(process.env,{platform:process.platform,arch:process.arch,node:process.version},arch,head);
 requireProof(git(['status','--porcelain','--untracked-files=no'])==='');
 const inputs=PYTHON_NATIVE_INPUTS.map(path=>{const full=resolve(ROOT,path),metadata=regular(full);const bytes=readFileSync(full),entry=git(['ls-tree','HEAD','--',path]);requireProof(new RegExp('^100(?:644|755) blob [a-f0-9]{40}\\t'+path.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$').test(entry)&&Boolean(metadata.mode&0o111)===(entry.slice(0,6)==='100755'));const committed=execFileSync('git',['show','HEAD:'+path],{cwd:ROOT,env:cleanEnvironment(),timeout:30000,maxBuffer:CAP});requireProof(bytes.equals(committed));return {path,sha256:hash(bytes)};});
 const digest=path=>inputs.find(input=>input.path===path).sha256;
 const source={schemaVersion:1,artifactKind:PYTHON_NATIVE_KIND,mode:PYTHON_NATIVE_MODE,repository:'alimobrem/agentci',ref:PYTHON_NATIVE_REF,workflowPath:PYTHON_NATIVE_WORKFLOW,workflowRef:process.env.GITHUB_WORKFLOW_REF,workflowSha:process.env.GITHUB_WORKFLOW_SHA,workflowPermissions:'contents-read-only',sourceCommit:head,sourceTree:git(['rev-parse','HEAD^{tree}']),candidateCommit:head,expectedSourceCommit:process.env.INPUT_EXPECTED_SOURCE,checkoutParents:git(['show','-s','--format=%P','HEAD']).split(/\s+/).filter(Boolean),event:process.env.GITHUB_EVENT_NAME,runId:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT,arch,platform:'linux/'+arch,node:process.version,harnessOwner:identity.owner,fixtureUnitId:identity.unit,fixtureLeaseSha256:identity.lease===null?identity.source.fixtureLeaseSha256:hash(identity.lease),trackedClean:true,committedInputBytes:true,rootLockSha256:digest('npm-shrinkwrap.json'),packageLockSha256:digest('package-lock.json'),nativePinsSha256:digest('deploy/security/native-components.json'),dockerfileSha256:digest('Dockerfile'),pythonComponentsSha256:digest('deploy/security/python-engine-components.json'),requirementsSha256:digest('deploy/engines/deepeval/requirements.txt'),inputs};
 return validatePythonNativeSource(source);
}
function statePath(){const path=process.env.AGENTCI_PYTHON_NATIVE_STATE_FILE;requireProof(typeof path==='string'&&basename(path)==='ownership.json'&&dirname(dirname(path))===realpathSync(tmpdir())&&/^agentci-image-smoke-[A-Za-z0-9]+$/.test(basename(dirname(path))));return path;}
function readState(){const path=statePath();directory(dirname(path),{privateDirectory:true});regular(path,{privateFile:true});const value=json(readFileSync(path));requireProof(value?.schemaVersion===1&&value.root===ROOT&&value.artifactRoot===PUBLIC&&ownerPattern.test(value.owner)&&uuid.test(value.unit)&&uuid.test(value.lease)&&typeof value.cacheIntent==='boolean'&&(value.imageId===null||imagePattern.test(value.imageId))&&value.source?.harnessOwner===value.owner&&value.source.fixtureUnitId===value.unit&&value.source.fixtureLeaseSha256===hash(value.lease));validatePythonNativeSource(value.source);publicOwned=true;return value;}
function readCleanupState(){
 const path=statePath(),receipt=dirname(path)+'.cleanup.json';regular(receipt,{privateFile:true});const record=json(readFileSync(receipt));requireProof(exactKeys(record,['schemaVersion','source','cleanup']));validatePythonNativeSource(record.source);const cleanup=record.cleanup;
 requireProof(record.schemaVersion===1&&exactKeys(cleanup,['schemaVersion','result','owner','sourceSha256','imageId','fixtureUnitId','fixtureLeaseSha256','fixtureContainers','ownedContainers','ownedNetworks','ownedVolumes','fixedCacheRemoved','privateFilesRemoved'])&&cleanup.schemaVersion===1&&cleanup.result==='passed'&&typeof cleanup.privateFilesRemoved==='boolean'&&cleanup.fixtureContainers===0&&cleanup.ownedContainers===0&&cleanup.ownedNetworks===0&&cleanup.ownedVolumes===0&&cleanup.fixedCacheRemoved===true&&cleanup.sourceSha256===sourceHash(record.source)&&cleanup.owner===record.source.harnessOwner&&cleanup.fixtureUnitId===record.source.fixtureUnitId&&cleanup.fixtureLeaseSha256===record.source.fixtureLeaseSha256&&!existsSync(dirname(path))&&(cleanup.imageId===null||imagePattern.test(cleanup.imageId)));
 publicOwned=true;return {schemaVersion:1,root:ROOT,artifactRoot:PUBLIC,owner:cleanup.owner,unit:cleanup.fixtureUnitId,lease:null,source:record.source,imageId:cleanup.imageId,cacheIntent:false,priorCleanup:cleanup};
}
function saveState(state){const path=statePath();regular(path,{privateFile:true});const next=path+'.next';writeFileSync(next,encode(state),{flag:'wx',mode:0o600});renameSync(next,path);}
function recheck(state){const source=committedSource(state.source.arch,state);requireProof(JSON.stringify(source)===JSON.stringify(state.source)&&publicBytes('source.json').equals(encode(source)));return source;}
function exportGithub(path,values){regular(path);const output=Object.entries(values).map(([key,value])=>{requireProof(/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)&&typeof value==='string'&&!/[\r\n]/.test(value));return key+'='+value+'\n';}).join('');appendFileSync(path,output);}
async function sourcePhase(arch){
 preparePublic(true);publicOwned=true;const identity={owner:'agentci-smoke-'+randomBytes(8).toString('hex'),unit:randomUUID(),lease:randomUUID()};
 const source=committedSource(arch,identity),privateRoot=mkdtempSync(join(realpathSync(tmpdir()),'agentci-image-smoke-'));directory(privateRoot,{privateDirectory:true});
 const path=join(privateRoot,'ownership.json');writeFileSync(path,encode({schemaVersion:1,root:ROOT,artifactRoot:PUBLIC,...identity,source,imageId:null,cacheIntent:false}),{flag:'wx',mode:0o600});process.env.AGENTCI_PYTHON_NATIVE_STATE_FILE=path;
 // Publish the recovery pointer before any later npm or Docker step can start.
 exportGithub(process.env.GITHUB_ENV,{AGENTCI_PYTHON_NATIVE_STATE_FILE:path});writePublic('source.json',source);
 exportGithub(process.env.GITHUB_OUTPUT,{source:source.sourceCommit,tree:source.sourceTree,candidate:source.candidateCommit,root_lock:source.rootLockSha256,native_pins:source.nativePinsSha256,python_components:source.pythonComponentsSha256});
}
async function inspectImage(state,{retain=false}={}){
 const source=recheck(state),daemon=json(await engine(['info','--format','{"os":{{json .OSType}},"arch":{{json .Architecture}}}']));daemon.arch=daemon.arch==='x86_64'?'amd64':daemon.arch==='aarch64'?'arm64':daemon.arch;validatePythonNativeDaemon(daemon,source);
 const target=state.imageId??`agentci-eval-engines:qualification-${source.runId}-${source.attempt}-${source.arch}`;
 const actual=json(await engine(['image','inspect',target]));requireProof(Array.isArray(actual)&&actual.length===1);const value=actual[0];
 const labels=Object.fromEntries(Object.keys(pythonNativeLabels(source)).map(key=>[key,value.Config?.Labels?.[key]]));
 const image={role:'eval-engines',id:value.Id,os:value.Os,arch:value.Architecture,user:value.Config?.User,command:value.Config?.Cmd,entrypoint:value.Config?.Entrypoint??null,labels};validatePythonNativeImage(image,source);requireProof(state.imageId===null||state.imageId===image.id);
 if(state.imageId===null){state.imageId=image.id;saveState(state);}
 if(retain){writePublic('daemon.json',daemon);writePublic('image.json',image);}else{requireProof(JSON.stringify(json(publicBytes('daemon.json')))===JSON.stringify(daemon)&&JSON.stringify(json(publicBytes('image.json')))===JSON.stringify(image));}
 return image;
}
async function fixedCache(state,command){
 const names=(await command(['volume','ls','--quiet','--filter','name=^'+CACHE+'$'])).split(/\s+/).filter(Boolean);requireProof(new Set(names).size===names.length&&names.every(name=>name===CACHE));
 if(names.length){requireProof(state.cacheIntent);const v=json(await command(['volume','inspect',CACHE]));requireProof(Array.isArray(v)&&v.length===1&&v[0].Name===CACHE&&v[0].Driver==='local'&&JSON.stringify(v[0].Labels)===JSON.stringify({[CACHE_LABEL]:state.owner})&&Object.keys(v[0].Options??{}).length===0);return;}
 requireProof(!state.cacheIntent);state.cacheIntent=true;saveState(state);await command(['volume','create','--label',CACHE_LABEL+'='+state.owner,CACHE]);
 const v=json(await command(['volume','inspect',CACHE]));requireProof(Array.isArray(v)&&v.length===1&&v[0].Name===CACHE&&v[0].Driver==='local'&&JSON.stringify(v[0].Labels)===JSON.stringify({[CACHE_LABEL]:state.owner})&&Object.keys(v[0].Options??{}).length===0);
}
async function scanPhase(){
 const state=readState(),source=recheck(state),image=await inspectImage(state,{retain:true});await fixedCache(state,args=>engine(args));
 const result=await runPythonNativeChild('docker',['run','--rm','--name',state.owner+'-scan','--label',OWNER_LABEL+'='+state.owner,'-v','/var/run/docker.sock:/var/run/docker.sock','-v',CACHE+':/root/.cache/trivy',NATIVE_SCAN_IMAGE,'image','--scanners','vuln','--format','json',image.id],{environment:cleanEnvironment(),timeoutMs:600000,graceMs:10000,abortSignal:abortController.signal});
 const execution={schemaVersion:1,artifactKind:'native-python-engine-scan-execution',sourceSha256:sourceHash(source),imageId:image.id,result:observedPassed(result)?'passed':'failed',scanner:NATIVE_SCAN_IMAGE,exitCode:result.exitCode,signal:result.signal,errorCode:result.errorCode,timeoutMs:600000,terminationGraceMs:10000,forced:result.forced,...boundedChannels(result)};
 writePublic('scan-execution.json',execution);let scan;if(!result.overflow&&result.stdout.length){try{scan=json(result.stdout);writePublic('scan.json',result.stdout);}catch{}}
 requireProof(observedPassed(result)&&scan);validatePythonNativeScan(scan,image,source);validatePythonNativeScanExecution(execution,source,image,{scanBytes:result.stdout});
 // Run the unchanged Verify threshold policy as well as the stricter identity oracle.
 const policy=await runPythonNativeChild(process.execPath,['scripts/check-scan.mjs',join(PUBLIC,'scan.json')],{environment:cleanEnvironment(),timeoutMs:30000,abortSignal:abortController.signal});requireProof(observedPassed(policy));recheck(state);
}
async function runtimePhase(){
 const state=readState(),source=recheck(state),image=await inspectImage(state);requireProof(!readdirSync(PUBLIC).some(name=>name.startsWith('failure-')));
 const scanBytes=publicBytes('scan.json'),scan=json(scanBytes);validatePythonNativeScan(scan,image,source);const execution=json(publicBytes('scan-execution.json'));requireProof(execution.result==='passed');validatePythonNativeScanExecution(execution,source,image,{scanBytes});
 const environment={...cleanEnvironment(),AGENTCI_CONTAINER_ENGINE:'docker',AGENTCI_TEST_ENGINES_IMAGE:image.id,AGENTCI_TEST_ENGINES_UNIT_ID:state.unit,AGENTCI_TEST_ENGINES_LEASE_TOKEN:state.lease,AGENTCI_TEST_ENGINES_SMOKE_OWNER:state.owner,AGENTCI_TEST_ENGINES_ARTIFACT_ROOT:PUBLIC,INPUT_EXPECTED_SOURCE:source.sourceCommit,GITHUB_RUN_ID:source.runId,GITHUB_RUN_ATTEMPT:source.attempt};
 const result=await runPythonNativeChild(process.execPath,['--import','tsx','--test','--test-reporter','./scripts/lib/python-engine-native-evidence.mjs','tests/integration/eval-engines.test.ts'],{environment,timeoutMs:120000,graceMs:10000,abortSignal:abortController.signal});
 if(!observedPassed(result)){writePublic('failure-runtime.json',{...pythonNativeFailure('runtime',{status:result.exitCode,signal:result.signal}),diagnostics:{...boundedChannels(result),errorCode:result.errorCode,closed:result.closed,forced:result.forced,timeoutMs:120000,terminationGraceMs:10000}});throw safeError();}
 const testReport=json(result.stdout),provenanceBytes=publicBytes('python-installed-provenance.json'),provenance=json(provenanceBytes),componentsBytes=readFileSync(resolve(ROOT,'deploy/security/python-engine-components.json')),components=json(componentsBytes),requirements=readFileSync(resolve(ROOT,'deploy/engines/deepeval/requirements.txt'),'utf8');
 const runtime={schemaVersion:1,artifactKind:'native-python-engine-runtime',sourceSha256:sourceHash(source),imageId:image.id,result:'passed',platform:source.platform,node:process.version,testReportSha256:hash(result.stdout),provenanceSha256:hash(provenanceBytes),...boundedChannels(result),exitCode:result.exitCode,signal:result.signal,errorCode:result.errorCode,timeoutMs:120000,terminationGraceMs:10000,forced:result.forced,runtimeAcceptance:'native-python-engines-qualified',aggregateM3Acceptance:false,releaseComplete:false};
 validatePythonNativeRuntime(runtime,source,image,{testReport,provenance,components,componentsBytes,requirements,testReportBytes:result.stdout,provenanceBytes});recheck(state);await pythonNativeCompletionBoundary({abortSignal:abortController.signal});writePublic('runtime-tests.json',result.stdout);writePublic('runtime.json',runtime);
}

/** Recover fixture unit+lease separately from smoke labels; no SQL-qualified reaper. */
export async function cleanupPythonNativeFixtures(state,{command=args=>engine(args,{cleanup:true})}={}){
 requireProof(ownerPattern.test(state.owner)&&uuid.test(state.unit)&&(uuid.test(state.lease)||state.lease===null)&&(state.imageId===null||imagePattern.test(state.imageId)));
 const ids=async args=>{const values=(await command(args)).split(/\s+/).filter(Boolean);requireProof(new Set(values).size===values.length);return values;};
 const unitArgs=['ps','--all','--quiet','--no-trunc','--filter','label=agentci.eval.unit='+state.unit];
 const remove=async(id,inventory)=>{try{await command(['rm','--force','--volumes',id]);}catch(error){if((await (typeof inventory==='function'?inventory():ids(inventory))).includes(id))throw error;}};
 for(const id of await ids(unitArgs)){
  requireProof(/^[a-f0-9]{64}$/.test(id));const inspect=json(await command(['inspect',id]));requireProof(Array.isArray(inspect)&&inspect.length===1);const c=inspect[0],labels=c.Config?.Labels;
  requireProof(state.lease!==null&&c.Id===id&&c.Name?.startsWith('/agentci-eval-')&&uuid.test(c.Name.slice(14))&&imagePattern.test(state.imageId??'')&&c.Image===state.imageId&&c.Config.Image===state.imageId&&labels?.['agentci.purpose']==='eval-runner'&&labels['agentci.eval.unit']===state.unit&&labels['agentci.eval.lease']===state.lease&&labels['agentci.runner.image']===state.imageId);await remove(id,unitArgs);
 }
 requireProof((await ids(unitArgs)).length===0);
 for(const kind of ['container','network','volume']){
  const inventory=kind==='container'?['ps','--all','--quiet','--no-trunc','--filter','label='+OWNER_LABEL+'='+state.owner]:[kind,'ls','--quiet','--filter','label='+OWNER_LABEL+'='+state.owner];
  const selected=async()=>{const values=await ids(inventory);if(kind==='container')for(const name of [state.owner+'-scan',state.owner+'-forge-provenance'])values.push(...await ids(['ps','--all','--quiet','--no-trunc','--filter','name=^/'+name+'$']));return [...new Set(values)];};
  for(const id of await selected()){
   const inspect=json(await command(kind==='container'?['inspect',id]:[kind,'inspect',id]));requireProof(Array.isArray(inspect)&&inspect.length===1);const c=inspect[0],name=(c.Name??'').replace(/^\//,''),labels=kind==='container'?c.Config?.Labels:c.Labels;
   requireProof(labels?.[OWNER_LABEL]===state.owner&&name.startsWith(state.owner+'-'));
   if(kind==='container'){requireProof(/^[a-f0-9]{64}$/.test(id)&&c.Id===id);if(name===state.owner+'-scan')requireProof(imagePattern.test(c.Image??'')&&c.Config.Image===NATIVE_SCAN_IMAGE);else if(name===state.owner+'-forge-provenance')requireProof(state.imageId!==null&&c.Image===state.imageId&&c.Config.Image===state.imageId);else throw safeError();await remove(id,selected);}
   else{await command([kind,'rm',id]);}
  }
  requireProof((await selected()).length===0);
 }
 const cacheNames=await ids(['volume','ls','--quiet','--filter','name=^'+CACHE+'$']);requireProof(cacheNames.every(name=>name===CACHE));
 if(cacheNames.length){requireProof(state.cacheIntent);const v=json(await command(['volume','inspect',CACHE]));requireProof(Array.isArray(v)&&v.length===1&&v[0].Name===CACHE&&v[0].Driver==='local'&&JSON.stringify(v[0].Labels)===JSON.stringify({[CACHE_LABEL]:state.owner})&&Object.keys(v[0].Options??{}).length===0);await command(['volume','rm',CACHE]);}
 requireProof((await ids(['volume','ls','--quiet','--filter','name=^'+CACHE+'$'])).length===0);
 return {schemaVersion:1,result:'passed',owner:state.owner,sourceSha256:sourceHash(state.source),imageId:state.imageId,fixtureUnitId:state.unit,fixtureLeaseSha256:state.source.fixtureLeaseSha256,fixtureContainers:0,ownedContainers:0,ownedNetworks:0,ownedVolumes:0,fixedCacheRemoved:true,privateFilesRemoved:false};
}
async function finalizePhase(){
 let state;try{state=readState();}catch(error){if(existsSync(statePath()))throw error;state=readCleanupState();}let sourceVerified=false,cleanup;
 try{recheck(state);sourceVerified=true;}catch{}
 try{
  const deadline=Date.now()+120000;cleanup=await cleanupPythonNativeFixtures(state,{command:args=>{const remaining=deadline-Date.now();requireProof(remaining>0);return engine(args,{cleanup:true,timeoutMs:Math.min(15000,remaining)});}});const path=statePath(),receipt=dirname(path)+'.cleanup.json';
  // Keep the fixture lease out of public evidence and delete only our exact private journal.
  if(!state.priorCleanup){directory(dirname(path),{privateDirectory:true});requireProof(readdirSync(dirname(path)).length===1&&basename(path)==='ownership.json');regular(path,{privateFile:true});const pending=encode({schemaVersion:1,source:state.source,cleanup});if(existsSync(receipt)){regular(receipt,{privateFile:true});requireProof(readFileSync(receipt).equals(pending));}else writeFileSync(receipt,pending,{flag:'wx',mode:0o600});rmSync(path);rmdirSync(dirname(path));}
  cleanup.privateFilesRemoved=true;const next=receipt+'.next';writeFileSync(next,encode({schemaVersion:1,source:state.source,cleanup}),{flag:'wx',mode:0o600});renameSync(next,receipt);
  if(existsSync(join(PUBLIC,'cleanup.json')))requireProof(publicBytes('cleanup.json').equals(encode(cleanup)));else writePublic('cleanup.json',cleanup);
 }catch(error){if(!existsSync(join(PUBLIC,'cleanup.json')))writePublic('cleanup.json',{schemaVersion:1,result:'failed-or-unverified',owner:state.owner,privateFilesRemoved:false});throw error;}
 requireProof(sourceVerified&&!interrupted&&process.env.AGENTCI_PYTHON_NATIVE_SCAN_OUTCOME==='success'&&process.env.AGENTCI_PYTHON_NATIVE_RUNTIME_OUTCOME==='success');recheck(state);
 const names=readdirSync(PUBLIC).sort();requireProof(names.every(name=>PYTHON_NATIVE_FILES.includes(name))&&!names.some(name=>name.startsWith('failure-')));
 const primary=names.filter(name=>!['result.json','artifact-manifest.json'].includes(name));const records={},bytes={};for(const name of primary){bytes[name]=publicBytes(name);records[name]=json(bytes[name]);}
 const componentsBytes=readFileSync(resolve(ROOT,'deploy/security/python-engine-components.json')),components=json(componentsBytes),requirements=readFileSync(resolve(ROOT,'deploy/engines/deepeval/requirements.txt'),'utf8');validatePythonNativeRecords(records,{components,componentsBytes,requirements,bytes});
 const result={schemaVersion:1,artifactKind:PYTHON_NATIVE_KIND,result:'passed',sourceCommit:state.source.sourceCommit,sourceTree:state.source.sourceTree,candidateCommit:state.source.candidateCommit,runId:state.source.runId,attempt:state.source.attempt,platform:state.source.platform,sourceSha256:sourceHash(state.source),imageId:state.imageId,runtimeAcceptance:'native-python-engines-qualified',aggregateM3Acceptance:false,releaseComplete:false};
 if(state.priorCleanup&&names.includes('result.json')&&names.includes('artifact-manifest.json')){requireProof(publicBytes('result.json').equals(encode(result)));const manifest=json(publicBytes('artifact-manifest.json'));requireProof(exactKeys(manifest,['schemaVersion','artifactKind','sourceCommit','sourceTree','candidateCommit','runId','attempt','sourceSha256','imageId','members'])&&manifest.schemaVersion===1&&manifest.artifactKind===PYTHON_NATIVE_KIND&&manifest.sourceCommit===state.source.sourceCommit&&manifest.sourceTree===state.source.sourceTree&&manifest.candidateCommit===state.source.candidateCommit&&manifest.runId===state.source.runId&&manifest.attempt===state.source.attempt&&manifest.sourceSha256===sourceHash(state.source)&&manifest.imageId===state.imageId&&Array.isArray(manifest.members)&&manifest.members.every(member=>exactKeys(member,['path','bytes','sha256']))&&JSON.stringify(manifest.members.map(member=>member.path).sort())===JSON.stringify(names.filter(name=>name!=='artifact-manifest.json')));for(const member of manifest.members){const bytes=publicBytes(member.path);requireProof(member.bytes===bytes.length&&member.sha256===hash(bytes));}return;}
 requireProof(!names.includes('result.json')&&!names.includes('artifact-manifest.json'));
 await pythonNativeCompletionBoundary({abortSignal:abortController.signal});requireProof(!interrupted);
 writePublic('result.json',result);
 writeManifest(state);
}
function writeManifest(state){
 const names=readdirSync(PUBLIC).filter(name=>name!=='artifact-manifest.json').sort();requireProof(names.every(name=>PYTHON_NATIVE_FILES.includes(name)));
 const members=names.map(path=>{const bytes=publicBytes(path);return {path,bytes:bytes.length,sha256:hash(bytes)};});
 writePublic('artifact-manifest.json',{schemaVersion:1,artifactKind:PYTHON_NATIVE_KIND,sourceCommit:state?.source.sourceCommit??null,sourceTree:state?.source.sourceTree??null,candidateCommit:state?.source.candidateCommit??null,runId:state?.source.runId??process.env.GITHUB_RUN_ID??null,attempt:state?.source.attempt??process.env.GITHUB_RUN_ATTEMPT??null,sourceSha256:state?sourceHash(state.source):null,imageId:state?.imageId??null,members});
}
async function main(){
 const [phase,arch,...extra]=process.argv.slice(2);requireProof(['source','scan','runtime','finalize'].includes(phase)&&extra.length===0&&(phase==='source'?['amd64','arm64'].includes(arch):arch===undefined));
 const handlers=Object.fromEntries(['SIGINT','SIGTERM'].map(signal=>[signal,()=>{interrupted=signal;abortController.abort();}]));for(const [signal,handler]of Object.entries(handlers))process.on(signal,handler);
 try{if(phase==='source')await sourcePhase(arch);else if(phase==='scan')await scanPhase();else if(phase==='runtime')await runtimePhase();else await finalizePhase();await pythonNativeCompletionBoundary({abortSignal:abortController.signal});requireProof(!interrupted);}
 catch(error){
  try{preparePublic();const name='failure-'+phase+'.json';if(!existsSync(join(PUBLIC,name)))writePublic(name,pythonNativeFailure(phase,error));}catch{}
  if(phase==='finalize')try{if(!existsSync(join(PUBLIC,'artifact-manifest.json'))){let state;try{state=readState();}catch{try{state=readCleanupState();}catch{}}if(!existsSync(join(PUBLIC,'result.json')))writePublic('result.json',{...pythonNativeFailure('finalize',error),sourceCommit:state?.source.sourceCommit??null,sourceTree:state?.source.sourceTree??null,candidateCommit:state?.source.candidateCommit??null,runId:state?.source.runId??process.env.GITHUB_RUN_ID??null,attempt:state?.source.attempt??process.env.GITHUB_RUN_ATTEMPT??null,sourceSha256:state?sourceHash(state.source):null,imageId:state?.imageId??null});writeManifest(state);}}catch{}
  process.stderr.write('Native Python qualification failed or remains unverified; retained bounded public evidence.\n');process.exitCode=1;
 }finally{for(const [signal,handler]of Object.entries(handlers))process.removeListener(signal,handler);}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
