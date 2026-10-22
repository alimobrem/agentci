import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm,realpath,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
// @ts-expect-error operational ESM native Python evidence
import reporter,{PYTHON_NATIVE_KIND,PYTHON_NATIVE_MODE,PYTHON_NATIVE_REF,PYTHON_NATIVE_WORKFLOW,PYTHON_NATIVE_INPUTS,PYTHON_NATIVE_FILES,NATIVE_SCAN_IMAGE,pythonNativeHash,pythonNativeLabels,validatePythonNativeHostedContext,validatePythonNativeSource,validatePythonNativeImage,validatePythonNativeScan,validatePythonNativeScanExecution,validatePythonNativeRuntime,validatePythonNativeCleanup,validatePythonNativeRecords,pythonNativeFailure} from '../scripts/lib/python-engine-native-evidence.mjs';
// @ts-expect-error operational ESM installed provenance validator
import {pythonEngineRequirements} from '../scripts/lib/python-engine-provenance.mjs';
// @ts-expect-error injected-only native subprocess and ownership controls
import {runPythonNativeChild,cleanupPythonNativeFixtures,pythonNativeCompletionBoundary} from '../scripts/python-engine-native-acceptance.mjs';

const componentsBytes=await readFile('deploy/security/python-engine-components.json'),components=JSON.parse(componentsBytes.toString());
const requirements=await readFile('deploy/engines/deepeval/requirements.txt','utf8');
const suitePath=resolve('tests/integration/eval-engines.test.ts'),suiteHash=pythonNativeHash(await readFile(suitePath));
const clone=<T>(value:T):T=>structuredClone(value);
const bytes=(value:unknown)=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const empty=pythonNativeHash('');
function source(arch='arm64'){
 const inputs=PYTHON_NATIVE_INPUTS.map((path:string)=>({path,sha256:path==='tests/integration/eval-engines.test.ts'?suiteHash:path==='deploy/security/python-engine-components.json'?pythonNativeHash(componentsBytes):path==='deploy/engines/deepeval/requirements.txt'?pythonNativeHash(requirements):'a'.repeat(64)}));
 return {schemaVersion:1,artifactKind:PYTHON_NATIVE_KIND,mode:PYTHON_NATIVE_MODE,repository:'alimobrem/agentci',ref:PYTHON_NATIVE_REF,workflowPath:PYTHON_NATIVE_WORKFLOW,workflowRef:'alimobrem/agentci/'+PYTHON_NATIVE_WORKFLOW+'@'+PYTHON_NATIVE_REF,workflowSha:'b'.repeat(40),workflowPermissions:'contents-read-only',sourceCommit:'b'.repeat(40),sourceTree:'c'.repeat(40),candidateCommit:'b'.repeat(40),expectedSourceCommit:'b'.repeat(40),checkoutParents:['d'.repeat(40)],event:'workflow_dispatch',runId:'123456',attempt:'1',arch,platform:'linux/'+arch,node:'v26.10.0',harnessOwner:'agentci-smoke-'+'e'.repeat(16),fixtureUnitId:'11111111-1111-4111-8111-111111111111',fixtureLeaseSha256:'f'.repeat(64),trackedClean:true,committedInputBytes:true,rootLockSha256:'a'.repeat(64),packageLockSha256:'a'.repeat(64),nativePinsSha256:'a'.repeat(64),dockerfileSha256:'a'.repeat(64),pythonComponentsSha256:pythonNativeHash(componentsBytes),requirementsSha256:pythonNativeHash(requirements),inputs};
}
function installed(arch:string){
 const aiohttp=components.packages.find((p:any)=>p.name==='aiohttp').selectedWheelStaticProof.find((w:any)=>w.platform==='linux/'+arch),certifi=components.packages.find((p:any)=>p.name==='certifi').selectedWheelStaticProof[0];
 const files=[...aiohttp.nativeExtensions,...aiohttp.licenses,...aiohttp.metadata,...certifi.licenses,...certifi.metadata,{path:'certifi/cacert.pem',bytes:components.certifiTrust.current.bundleBytes,sha256:components.certifiTrust.current.bundleSha256}].map(({path,bytes,sha256,machine}:any)=>({path,bytes,sha256,machine:machine??null})).sort((a,b)=>a.path.localeCompare(b.path));
 return {schemaVersion:1,kind:'installed-optional-python-provenance',requirementsSha256:pythonNativeHash(requirements),pythonVersion:'3.14.8',implementation:'cpython',abi:'cp314',freeThreaded:false,platform:'linux/'+arch,uid:1001,packages:pythonEngineRequirements(requirements,components),dependencyClosure:{method:'installed-default-marker-requirements',checkedRequirements:100,unmet:0},files,importedExtensions:files.filter(f=>f.machine!==null).map(f=>({name:f.path.split('.cpython-314-')[0]!.replaceAll('/','.'),path:f.path})),defaultCParserSelected:true,certifiAnchors:120,removedAnchorsPresent:[]};
}
const summary=(file:string|null,tests=1)=>({file,success:true,counts:{tests,passed:tests,failed:0,skipped:0,cancelled:0,todo:0}});
function fixture(arch='arm64'){
 const s=source(arch),sourceSha256=pythonNativeHash(JSON.stringify(s));
 const image={role:'eval-engines',id:'sha256:'+'1'.repeat(64),os:'linux',arch,user:'1001',command:['node','--version'],entrypoint:null,labels:pythonNativeLabels(s)};
 const scan={ArtifactType:'container_image',ArtifactName:image.id,Metadata:{ImageID:image.id,ImageConfig:{os:'linux',architecture:arch}},Results:[{Target:'optional engines',Vulnerabilities:[]}]};
 const report={schemaVersion:1,artifactKind:'native-python-engine-test-report',runId:s.runId,attempt:s.attempt,sourceCommit:s.sourceCommit,tests:1,suites:1,inputs:[{file:suitePath,sha256:suiteHash}],summaries:[summary(suitePath),summary(null)]};
 const provenance=installed(arch),testReportBytes=bytes(report),provenanceBytes=bytes(provenance),scanBytes=bytes(scan);
 const scanExecution={schemaVersion:1,artifactKind:'native-python-engine-scan-execution',sourceSha256,imageId:image.id,result:'passed',scanner:NATIVE_SCAN_IMAGE,exitCode:0,signal:null,errorCode:null,timeoutMs:600000,terminationGraceMs:10000,forced:false,stdoutBytes:scanBytes.length,stderrBytes:0,stdoutSha256:pythonNativeHash(scanBytes),stderrSha256:empty};
 const runtime={schemaVersion:1,artifactKind:'native-python-engine-runtime',sourceSha256,imageId:image.id,result:'passed',platform:s.platform,node:s.node,testReportSha256:pythonNativeHash(testReportBytes),provenanceSha256:pythonNativeHash(provenanceBytes),stdoutBytes:testReportBytes.length,stderrBytes:0,stdoutSha256:pythonNativeHash(testReportBytes),stderrSha256:empty,exitCode:0,signal:null,errorCode:null,timeoutMs:120000,terminationGraceMs:10000,forced:false,runtimeAcceptance:'native-python-engines-qualified',aggregateM3Acceptance:false,releaseComplete:false};
 const cleanup={schemaVersion:1,result:'passed',owner:s.harnessOwner,sourceSha256,imageId:image.id,fixtureUnitId:s.fixtureUnitId,fixtureLeaseSha256:s.fixtureLeaseSha256,fixtureContainers:0,ownedContainers:0,ownedNetworks:0,ownedVolumes:0,fixedCacheRemoved:true,privateFilesRemoved:true};
 const records:Record<string,any>={'source.json':s,'daemon.json':{os:'linux',arch},'image.json':image,'scan.json':scan,'scan-execution.json':scanExecution,'runtime-tests.json':report,'python-installed-provenance.json':provenance,'runtime.json':runtime,'cleanup.json':cleanup};
 const raw=Object.fromEntries(Object.entries(records).map(([name,value])=>[name,bytes(value)]));
 return {s,image,scan,report,provenance,scanExecution,runtime,cleanup,records,raw,context:{testReport:report,provenance,components,componentsBytes,requirements,testReportBytes,provenanceBytes},options:{components,componentsBytes,requirements,bytes:raw}};
}

test('hosted qualification requires explicit exact-head manual native context and rejects ambient substitutes',()=>{
 const s=source(),env={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'alimobrem/agentci',GITHUB_EVENT_NAME:'workflow_dispatch',AGENTCI_PYTHON_NATIVE_MODE:PYTHON_NATIVE_MODE,AGENTCI_CONTAINER_ENGINE:'docker',GITHUB_REF:PYTHON_NATIVE_REF,GITHUB_WORKFLOW_REF:s.workflowRef,INPUT_EXPECTED_SOURCE:s.sourceCommit,GITHUB_SHA:s.sourceCommit,GITHUB_WORKFLOW_SHA:s.sourceCommit,GITHUB_RUN_ID:s.runId,GITHUB_RUN_ATTEMPT:s.attempt};
 assert.equal(validatePythonNativeHostedContext(env,{platform:'linux',node:'v26.10.0',arch:'arm64'},'arm64',s.sourceCommit),true);
 for(const [field,value]of Object.entries({GITHUB_ACTIONS:'false',GITHUB_REPOSITORY:'other/repo',GITHUB_EVENT_NAME:'pull_request',AGENTCI_PYTHON_NATIVE_MODE:'verify',AGENTCI_CONTAINER_ENGINE:'podman',GITHUB_REF:'refs/heads/main',GITHUB_WORKFLOW_REF:s.workflowRef+'-wrong',INPUT_EXPECTED_SOURCE:'d'.repeat(40),GITHUB_SHA:'d'.repeat(40),GITHUB_WORKFLOW_SHA:'d'.repeat(40),GITHUB_RUN_ID:'0',GITHUB_RUN_ATTEMPT:'1\n'}))assert.throws(()=>validatePythonNativeHostedContext({...env,[field]:value},{platform:'linux',node:'v26.10.0',arch:'arm64'},'arm64',s.sourceCommit),field);
 for(const runtime of [{platform:'darwin',node:'v26.10.0',arch:'arm64'},{platform:'linux',node:'v26.11.0',arch:'arm64'},{platform:'linux',node:'v26.10.0',arch:'x64'}])assert.throws(()=>validatePythonNativeHostedContext(env,runtime,'arm64',s.sourceCommit));
});

test('source has an exact committed-input index, manual cohort, fresh ownership and separate qualification',()=>{
 assert.equal(new Set(PYTHON_NATIVE_INPUTS).size,PYTHON_NATIVE_INPUTS.length);assert.ok(PYTHON_NATIVE_INPUTS.includes('tests/python-engine-native-workflow.test.ts'));
 const valid=source();validatePythonNativeSource(valid);
 for(const change of [(v:any)=>v.inputs.pop(),(v:any)=>v.inputs.reverse(),(v:any)=>v.inputs[0].sha256='not-hash',(v:any)=>v.inputs[0].path='../Dockerfile',(v:any)=>v.expectedSourceCommit='0'.repeat(40),(v:any)=>v.candidateCommit='0'.repeat(40),(v:any)=>v.workflowSha='0'.repeat(40),(v:any)=>v.event='push',(v:any)=>v.fixtureUnitId='invalid',(v:any)=>v.fixtureLeaseSha256='raw-private-lease',(v:any)=>v.harnessOwner+='\n',(v:any)=>v.trackedClean=false,(v:any)=>v.committedInputBytes=false,(v:any)=>v.packageLockSha256='0'.repeat(64),(v:any)=>v.pythonComponentsSha256='0'.repeat(64),(v:any)=>v.requirementsSha256='0'.repeat(64),(v:any)=>v.extra=true]){const bad=clone(valid);change(bad);assert.throws(()=>validatePythonNativeSource(bad));}
});

test('image and scan need native identity, all six exact labels and the existing unweakened vulnerability policy',()=>{
 for(const arch of ['amd64','arm64']){const f=fixture(arch);validatePythonNativeImage(f.image,f.s);validatePythonNativeScan(f.scan,f.image,f.s);
  for(const change of [(v:any)=>v.role='eval-runner',(v:any)=>v.arch=arch==='amd64'?'arm64':'amd64',(v:any)=>v.user='0',(v:any)=>v.command=['sh'],(v:any)=>v.entrypoint=['sh'],(v:any)=>v.labels['org.agentci.native-role']='eval-worker',(v:any)=>v.labels.extra='ambient']){const bad=clone(f.image);change(bad);assert.throws(()=>validatePythonNativeImage(bad,f.s));}
  for(const change of [(v:any)=>v.ArtifactName='sha256:'+'0'.repeat(64),(v:any)=>v.Metadata.ImageID='sha256:'+'0'.repeat(64),(v:any)=>v.Metadata.ImageConfig.os='darwin',(v:any)=>v.Results=[],(v:any)=>v.Results[0].Vulnerabilities=[{Severity:'HIGH',FixedVersion:'patched'}],(v:any)=>v.Results[0].Vulnerabilities=[{Severity:'UNKNOWN-NEW'}]]){const bad=clone(f.scan);change(bad);assert.throws(()=>validatePythonNativeScan(bad,f.image,f.s));}
 }
});

test('actual scan bytes and child outcome bind the successful scan execution receipt',()=>{
 const f=fixture();validatePythonNativeScanExecution(f.scanExecution,f.s,f.image,{scanBytes:f.raw['scan.json']});
 for(const change of [(v:any)=>v.exitCode=1,(v:any)=>v.signal='SIGTERM',(v:any)=>v.errorCode='ETIMEDOUT',(v:any)=>v.timeoutMs=180000,(v:any)=>v.terminationGraceMs=0,(v:any)=>v.forced=true,(v:any)=>v.stdoutBytes++,(v:any)=>v.stdoutSha256='0'.repeat(64),(v:any)=>v.scanner='latest',(v:any)=>v.imageId='sha256:'+'0'.repeat(64)]){const bad=clone(f.scanExecution);change(bad);assert.throws(()=>validatePythonNativeScanExecution(bad,f.s,f.image,{scanBytes:f.raw['scan.json']}));}
 assert.throws(()=>validatePythonNativeScanExecution(f.scanExecution,f.s,f.image,{scanBytes:bytes({result:'passed'})}));
});

test('runtime requires one actual passing source suite, exact transport closure and authentic installed provenance',()=>{
 for(const arch of ['amd64','arm64']){const f=fixture(arch);validatePythonNativeRuntime(f.runtime,f.s,f.image,f.context);
  for(const change of [(v:any)=>v.exitCode=1,(v:any)=>v.signal='SIGKILL',(v:any)=>v.errorCode='ENOBUFS',(v:any)=>v.forced=true,(v:any)=>v.timeoutMs=180000,(v:any)=>v.terminationGraceMs=0,(v:any)=>v.aggregateM3Acceptance=true,(v:any)=>v.releaseComplete=true,(v:any)=>v.testReportSha256='0'.repeat(64),(v:any)=>v.provenanceSha256='0'.repeat(64),(v:any)=>v.stdoutBytes++]){const bad=clone(f.runtime);change(bad);assert.throws(()=>validatePythonNativeRuntime(bad,f.s,f.image,f.context));}
  for(const change of [(v:any)=>v.summaries.pop(),(v:any)=>v.summaries.push(summary(suitePath)),(v:any)=>v.inputs[0].sha256='0'.repeat(64),(v:any)=>v.sourceCommit='0'.repeat(40),(v:any)=>v.summaries[0].file=resolve('tests/integration/unrelated.test.ts'),(v:any)=>v.summaries[0].counts.tests=2,...['skipped','failed','cancelled','todo'].map(key=>(v:any)=>v.summaries[0].counts[key]=1)]){const report=clone(f.report);change(report);const reportBytes=bytes(report),runtime={...f.runtime,testReportSha256:pythonNativeHash(reportBytes),stdoutSha256:pythonNativeHash(reportBytes),stdoutBytes:reportBytes.length};assert.throws(()=>validatePythonNativeRuntime(runtime,f.s,f.image,{...f.context,testReport:report,testReportBytes:reportBytes}));}
  for(const change of [(v:any)=>v.defaultCParserSelected=false,(v:any)=>v.removedAnchorsPresent=['86a1ecba089c4a8d3bbe2734c612ba341d813e043cf9e8a862cd5c57a36bbe6b'],(v:any)=>v.dependencyClosure.unmet=1,(v:any)=>v.files[0].sha256='0'.repeat(64),(v:any)=>v.platform=arch==='amd64'?'linux/arm64':'linux/amd64']){const provenance=clone(f.provenance);change(provenance);const provenanceBytes=bytes(provenance);assert.throws(()=>validatePythonNativeRuntime({...f.runtime,provenanceSha256:pythonNativeHash(provenanceBytes)},f.s,f.image,{...f.context,provenance,provenanceBytes}));}
  assert.throws(()=>validatePythonNativeRuntime(f.runtime,f.s,f.image,{...f.context,componentsBytes:bytes({...components,ambient:true})}));
 }
});

test('cleanup binds both fixture identities and image ownership and cannot overlook the fixed cache or private journal',()=>{
 const f=fixture();validatePythonNativeCleanup(f.cleanup,f.s,f.image);
 for(const change of [(v:any)=>v.owner='agentci-smoke-'+'0'.repeat(16),(v:any)=>v.fixtureUnitId='22222222-2222-4222-8222-222222222222',(v:any)=>v.fixtureLeaseSha256='0'.repeat(64),(v:any)=>v.imageId='sha256:'+'0'.repeat(64),(v:any)=>v.fixtureContainers=1,(v:any)=>v.ownedContainers=1,(v:any)=>v.ownedNetworks=1,(v:any)=>v.ownedVolumes=1,(v:any)=>v.fixedCacheRemoved=false,(v:any)=>v.privateFilesRemoved=false]){const bad=clone(f.cleanup);change(bad);assert.throws(()=>validatePythonNativeCleanup(bad,f.s,f.image));}
});

test('complete records reject every missing file, unknown/failure presence, substituted bytes and failed scan',()=>{
 const f=fixture();validatePythonNativeRecords(f.records,f.options);
 for(const name of Object.keys(f.records)){const records={...f.records};delete records[name];assert.throws(()=>validatePythonNativeRecords(records,f.options),name);}
 for(const name of [...PYTHON_NATIVE_FILES.filter((name:string)=>name.startsWith('failure-')),'unknown.json','result.json','artifact-manifest.json'])assert.throws(()=>validatePythonNativeRecords({...f.records,[name]:null},f.options),name);
 const raw={...f.raw,'runtime-tests.json':bytes({tests:1})};assert.throws(()=>validatePythonNativeRecords(f.records,{...f.options,bytes:raw}));
 const failed={...f.records,'scan-execution.json':{...f.scanExecution,result:'failed'}};assert.throws(()=>validatePythonNativeRecords(failed,{...f.options,bytes:{...f.raw,'scan-execution.json':bytes(failed['scan-execution.json'])}}));
 const failure=pythonNativeFailure('runtime',Object.assign(Error('PRIVATE-CANARY'),{status:1,signal:'SIGTERM',stderr:'PRIVATE-CANARY'}));assert.equal(failure.runtimeAcceptance,'not-performed');assert.equal(failure.releaseComplete,false);assert.ok(!JSON.stringify(failure).includes('PRIVATE-CANARY'));
});

test('single-suite reporter projects only public counts and rejects skips, partial suites and source mutation',async()=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'agentci-python-reporter-'))),file=join(root,'tests/integration/eval-engines.test.ts');await mkdir(join(root,'tests/integration'),{recursive:true});await writeFile(file,'// inert reporter fixture\n');
 const environment={INPUT_EXPECTED_SOURCE:'a'.repeat(40),GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1'};
 const run=async(reports:any[])=>{async function* events(){for(const data of reports)yield {type:'test:summary',data};}let result='';for await(const chunk of reporter(events(),{root,environment}))result+=chunk;return JSON.parse(result);};
 try{
  const valid=[summary(file),summary(null)],result=await run(valid);assert.equal(result.tests,1);assert.equal(result.suites,1);assert.equal(result.inputs[0].file,file);assert.equal(result.inputs[0].sha256,pythonNativeHash('// inert reporter fixture\n'));
  for(const reports of [[summary(file)],[],[summary(file),summary(file),summary(null)],[summary(resolve(root,'other.test.ts')),summary(null)],[summary(file,2),summary(null,2)]])await assert.rejects(run(reports));
  for(const key of ['skipped','failed','cancelled','todo']){const reports=clone(valid);reports[0]!.counts[key as keyof typeof reports[0]['counts']]=1;await assert.rejects(run(reports));}
  const privateSummary={...summary(file),output:'PRIVATE-CANARY'};assert.ok(!JSON.stringify(await run([privateSummary,summary(null)])).includes('PRIVATE-CANARY'));
  async function* changed(){yield {type:'test:summary',data:summary(file)};await writeFile(file,'// changed\n');yield {type:'test:summary',data:summary(null)};}
  await assert.rejects(async()=>{for await(const _ of reporter(changed(),{root,environment})){void _;}});
 }finally{await rm(root,{recursive:true,force:true});}
});

class InertChild extends EventEmitter{
 stdout=new PassThrough();stderr=new PassThrough();exitCode:number|null=null;signalCode:string|null=null;signals:string[]=[];ignoreTerm:boolean;closed=false;
 constructor(ignoreTerm=false){super();this.ignoreTerm=ignoreTerm;}
 complete(code:number|null,signal:string|null){queueMicrotask(()=>{if(this.closed)return;this.closed=true;this.exitCode=code;this.signalCode=signal;this.stdout.end();this.stderr.end();this.emit('close',code,signal);});}
 kill(signal:string){this.signals.push(signal);if(signal!=='SIGTERM'||!this.ignoreTerm)this.complete(null,signal);return true;}
}

test('injected children keep channels separate and cannot pass overflow, timeout, abort or forced closure',async()=>{
 const normal=new InertChild();const ok=await runPythonNativeChild('inert-command',['inert-argument'],{environment:{PATH:'/inert'},cap:4,timeoutMs:100,graceMs:5,spawnChild:(command:string,args:string[],options:any)=>{assert.equal(command,'inert-command');assert.deepEqual(args,['inert-argument']);assert.deepEqual(options.env,{PATH:'/inert'});queueMicrotask(()=>{normal.stdout.write('one');normal.stderr.write('two');normal.complete(0,null);});return normal;}});
 assert.equal(ok.exitCode,0);assert.equal(ok.closed,true);assert.equal(ok.errorCode,null);assert.equal(ok.forced,false);assert.equal(ok.stdoutSha256,pythonNativeHash('one'));assert.equal(ok.stderrSha256,pythonNativeHash('two'));assert.equal(ok.stdoutBytes,3);assert.equal(ok.stderrBytes,3);
 for(const channel of ['stdout','stderr'] as const){const child=new InertChild();const result=await runPythonNativeChild('inert',[],{cap:4,timeoutMs:100,graceMs:5,spawnChild:()=>{queueMicrotask(()=>{child[channel].write('12345');});return child;}});assert.equal(result.errorCode,'ENOBUFS');assert.equal(result.overflow,true);assert.equal(result.closed,true);assert.equal(result[channel+'Bytes'],5);assert.equal(result[channel+'Sha256'],pythonNativeHash('12345'));assert.ok(result[channel].length<=4);assert.deepEqual(child.signals,['SIGTERM']);}
 const timed=new InertChild();const timeout=await runPythonNativeChild('inert',[],{timeoutMs:5,graceMs:5,spawnChild:()=>timed});assert.equal(timeout.errorCode,'ETIMEDOUT');assert.equal(timeout.timedOut,true);assert.equal(timeout.closed,true);assert.notEqual(timeout.signal,null);
 const forcedChild=new InertChild(true);const forced=await runPythonNativeChild('inert',[],{timeoutMs:5,graceMs:5,spawnChild:()=>forcedChild});assert.equal(forced.errorCode,'ETIMEDOUT');assert.equal(forced.forced,true);assert.equal(forced.signal,'SIGKILL');assert.deepEqual(forcedChild.signals,['SIGTERM','SIGKILL']);
 const controller=new AbortController(),abortedChild=new InertChild();queueMicrotask(()=>controller.abort());const aborted=await runPythonNativeChild('inert',[],{timeoutMs:100,graceMs:5,abortSignal:controller.signal,spawnChild:()=>abortedChild});assert.equal(aborted.errorCode,'ABORT_ERR');assert.equal(aborted.closed,true);assert.notEqual(aborted.signal,null);
 const alreadyAborted=new AbortController();alreadyAborted.abort();let started=0;const unstarted=await runPythonNativeChild('inert',[],{abortSignal:alreadyAborted.signal,spawnChild:()=>{started++;throw Error('A cancelled command must not spawn');}});assert.equal(started,0);assert.equal(unstarted.errorCode,'ABORT_ERR');assert.equal(unstarted.closed,false);assert.equal(unstarted.exitCode,null);
 const absent=await runPythonNativeChild('inert',[],{spawnChild:()=>{throw Object.assign(Error('private transport message'),{code:'ENOENT'});}});assert.equal(absent.errorCode,'ENOENT');assert.equal(absent.closed,false);assert.equal(absent.exitCode,null);
});

test('unclosed injected children resolve as unverified after escalation and never signal a real process group',{timeout:7000},async()=>{
 const child=new InertChild(true);child.kill=(signal:string)=>{child.signals.push(signal);return true;};Object.defineProperty(child,'pid',{value:123456789});
 const actualKill=process.kill;let groupCalls=0;process.kill=((..._args:any[])=>{groupCalls++;return true;}) as typeof process.kill;
 try{const result=await runPythonNativeChild('inert',[],{timeoutMs:1,graceMs:1,spawnChild:()=>child});assert.equal(result.closed,false);assert.equal(result.forced,true);assert.equal(result.errorCode,'ETIMEDOUT');assert.equal(result.exitCode,null);assert.deepEqual(child.signals,['SIGTERM','SIGKILL']);assert.equal(groupCalls,0);}finally{process.kill=actualKill;child.stdout.destroy();child.stderr.destroy();}
});

function descendantGone(pid:number){
 assert.ok(Number.isSafeInteger(pid)&&pid>1&&pid!==process.pid,'Only the exact fresh fixture descendant may be queried');
 try{process.kill(pid,0);return false;}catch(error:any){if(error.code==='ESRCH')return true;throw error;}
}

test('actual inert Node groups reap TERM-ignoring descendants after normal and timed-out leader closure',{timeout:20000},async(t)=>{
 assert.ok(['darwin','linux'].includes(process.platform),'Actual POSIX process-group proof is required; unsupported hosts must not silently pass');
 for(const mode of ['normal','timeout']){
  const nonce=randomUUID(),startedAt=performance.now();let leaderPid:number|undefined,grandchildPid:number|undefined,confirmedGone=false,observationDenied=false;
  const grandchild=`const nonce=${JSON.stringify(nonce)};process.on('SIGTERM',()=>{});setInterval(()=>{},1000);setTimeout(()=>process.exit(0),5000);process.send({ready:true,pid:process.pid},()=>process.disconnect());`;
  const leader=`import {spawn} from 'node:child_process';const nonce=${JSON.stringify(nonce)};process.on('SIGTERM',()=>process.exit(0));setInterval(()=>{},1000);process.stdout.write(JSON.stringify({kind:'leader',nonce,leaderPid:process.pid,parentPid:process.ppid})+'\\n',()=>{const child=spawn(process.execPath,['--input-type=module','-e',${JSON.stringify(grandchild)}],{stdio:['ignore','ignore','ignore','ipc']});child.once('error',()=>process.exit(2));process.stdout.write(JSON.stringify({kind:'spawned',nonce,leaderPid:process.pid,grandchildPid:child.pid})+'\\n');child.once('message',message=>{if(message?.ready!==true||message.pid!==child.pid)process.exit(3);process.stdout.write(JSON.stringify({kind:'ready',nonce,leaderPid:process.pid,grandchildPid:child.pid})+'\\n',()=>{if(${JSON.stringify(mode)}==='normal')process.exit(0);});});});`;
  try{
   const result=await runPythonNativeChild(process.execPath,['--input-type=module','-e',leader],{environment:{PATH:dirname(process.execPath)+':/usr/bin:/bin'},timeoutMs:500,graceMs:100,cap:4096});
   const returnedAt=performance.now();
   const frames=result.stdout.toString('utf8').trim().split('\n').map((line:string)=>JSON.parse(line));
   const initial=frames.find((frame:any)=>frame.kind==='leader'),spawned=frames.find((frame:any)=>frame.kind==='spawned'),ready=frames.find((frame:any)=>frame.kind==='ready');
   if(Number.isSafeInteger(initial?.leaderPid)&&initial.leaderPid>1)leaderPid=initial.leaderPid;
   if(Number.isSafeInteger(spawned?.grandchildPid)&&spawned.grandchildPid>1)grandchildPid=spawned.grandchildPid;
   assert.ok(leaderPid&&grandchildPid&&ready,'The fixture must prove that the grandchild installed its TERM handler');assert.notEqual(leaderPid,process.pid);assert.notEqual(grandchildPid,process.pid);assert.notEqual(leaderPid,grandchildPid);
   assert.equal(initial.parentPid,process.pid);assert.ok(frames.every((frame:any)=>frame.nonce===nonce&&frame.leaderPid===leaderPid));assert.equal(ready.grandchildPid,grandchildPid);
   assert.equal(result.closed,true);assert.equal(result.exitCode,0);assert.equal(result.signal,null);assert.equal(result.forced,true);assert.equal(result.errorCode,mode==='normal'?'OTHER':'ETIMEDOUT');assert.equal(result.timedOut,mode==='timeout');assert.equal(result.overflow,false);
   assert.ok(returnedAt-startedAt<1500,'The wrapper must return well before the fixture self-exit backstop');
   const deadline=Math.min(returnedAt+2000,startedAt+3500);let observedAt=returnedAt;
   while(performance.now()<deadline){try{confirmedGone=descendantGone(grandchildPid);}catch(error){observationDenied=true;throw error;}observedAt=performance.now();if(confirmedGone){assert.ok(observedAt<deadline&&observedAt-startedAt<3500,'A delayed wake-up after the self-exit backstop cannot establish group cleanup');break;}await delay(20);}
   assert.equal(confirmedGone,true,mode+': only ESRCH establishes that the fresh descendant is gone; persistence or a zombie cannot pass');
   t.diagnostic(JSON.stringify({mode,closed:result.closed,exitCode:result.exitCode,signal:result.signal,forced:result.forced,errorCode:result.errorCode,timedOut:result.timedOut,wrapperElapsedMs:Math.ceil(returnedAt-startedAt),esrchObservedMs:Math.ceil(observedAt-startedAt)}));
  }finally{
   // The wrapper owns all signals. On failure, wait only for this fixture's own
   // five-second backstop; it cannot turn the earlier proof failure into a pass.
   if(grandchildPid&&!confirmedGone){const deadline=performance.now()+6000;if(observationDenied)await delay(5500);else while(performance.now()<deadline){if(descendantGone(grandchildPid))break;await delay(25);}}
  }
 }
});

test('actual late abort vetoes completion after a successful inert Node child',{timeout:5000},async(t)=>{
 const controller=new AbortController(),result=await runPythonNativeChild(process.execPath,['-e','process.exit(0)'],{environment:{PATH:dirname(process.execPath)+':/usr/bin:/bin'},timeoutMs:500,graceMs:100,abortSignal:controller.signal});
 assert.equal(result.closed,true);assert.equal(result.exitCode,0);assert.equal(result.signal,null);assert.equal(result.errorCode,null);assert.equal(result.forced,false);await pythonNativeCompletionBoundary({abortSignal:controller.signal});
 setImmediate(()=>controller.abort());await assert.rejects(pythonNativeCompletionBoundary({abortSignal:controller.signal}));assert.equal(controller.signal.aborted,true);
 t.diagnostic(JSON.stringify({closed:result.closed,exitCode:result.exitCode,forced:result.forced,errorCode:result.errorCode,lateAbortRejected:true}));
});

test('actual Node source refusal preserves a preexisting artifact directory byte for byte',async()=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'agentci-python-preserve-'))),artifactRoot=join(root,'.agentci/artifacts/eval-engines-native'),old=Buffer.from('{"previous":"immutable-evidence"}\n');
 try{await mkdir(artifactRoot,{recursive:true,mode:0o700});await writeFile(join(artifactRoot,'synthetic-old.json'),old,{flag:'wx',mode:0o600});const before=(await readdir(artifactRoot)).sort();
  const result=spawnSync(process.execPath,[resolve('scripts/python-engine-native-acceptance.mjs'),'source','arm64'],{cwd:root,env:{PATH:dirname(process.execPath)},encoding:'utf8',timeout:5000,maxBuffer:4096,stdio:['ignore','pipe','pipe']});
  assert.equal(result.error,undefined);assert.equal(result.status,1);assert.equal(result.signal,null);assert.deepEqual((await readdir(artifactRoot)).sort(),before);assert.deepEqual(await readFile(join(artifactRoot,'synthetic-old.json')),old);
 }finally{await rm(root,{recursive:true,force:true});}
});

function cleanupTransport({wrongLease=false,wrongImage=false,wrongPurpose=false,wrongCacheOwner=false,extraCacheLabel=false,unownedCache=false,wrongSmokeOwner=false,nameOnlyMissingOwner=false,nameOnlyWrongOwner=false}={}){
 const f=fixture(),lease='22222222-2222-4222-8222-222222222222',state={owner:f.s.harnessOwner,unit:f.s.fixtureUnitId,lease,imageId:f.image.id,source:{...f.s,fixtureLeaseSha256:pythonNativeHash(lease)},cacheIntent:!unownedCache};
 const calls:string[][]=[];let fixtureLive=!wrongCacheOwner&&!extraCacheLabel&&!unownedCache&&!wrongSmokeOwner&&!nameOnlyMissingOwner&&!nameOnlyWrongOwner,smokeLive=wrongSmokeOwner||nameOnlyMissingOwner||nameOnlyWrongOwner,cacheLive=true;
 const fixtureId='2'.repeat(64),smokeId='3'.repeat(64),cache='agentci-trivy-cache';
 const command=async(args:string[])=>{
  calls.push([...args]);
  if(args[0]==='ps'){
   if(args.includes('label=agentci.eval.unit='+state.unit))return fixtureLive?fixtureId:'';
   if(nameOnlyMissingOwner||nameOnlyWrongOwner)return args.includes('name=^/'+state.owner+'-scan$')&&smokeLive?smokeId:'';
   return smokeLive?smokeId:'';
  }
  if(args[0]==='inspect'){
   if(args[1]===fixtureId)return JSON.stringify([{Id:fixtureId,Name:'/agentci-eval-11111111-1111-4111-8111-111111111111',Image:wrongImage?'sha256:'+'0'.repeat(64):f.image.id,Config:{Image:f.image.id,Labels:{'agentci.purpose':wrongPurpose?'foreign-purpose':'eval-runner','agentci.eval.unit':state.unit,'agentci.eval.lease':wrongLease?'33333333-3333-4333-8333-333333333333':lease,'agentci.runner.image':f.image.id}}}]);
   return JSON.stringify([{Id:smokeId,Name:'/'+state.owner+'-scan',Config:{Image:NATIVE_SCAN_IMAGE,Labels:nameOnlyMissingOwner?{}:{'agentci.image-smoke.owner':'agentci-smoke-'+'0'.repeat(16)}}}]);
  }
  if(args[0]==='rm'){if(args.at(-1)===fixtureId)fixtureLive=false;else if(args.at(-1)===smokeId)smokeLive=false;else assert.fail('Unexpected container removal');return args.at(-1)!;}
  if(args[0]==='network'&&args[1]==='ls')return '';
  if(args[0]==='volume'&&args[1]==='ls')return args.some(value=>value==='name=^agentci-trivy-cache$')?(cacheLive?cache:''):'';
  if(args[0]==='volume'&&args[1]==='inspect')return JSON.stringify([{Name:cache,Driver:'local',Labels:{'agentci.python-native.cache-owner':wrongCacheOwner?'agentci-smoke-'+'0'.repeat(16):state.owner,...(extraCacheLabel?{ambient:'foreign'}:{})},Options:{}}]);
  if(args[0]==='volume'&&args[1]==='rm'){assert.equal(args[2],cache);cacheLive=false;return cache;}
  assert.fail('Unexpected injected cleanup command');
 };
 return {state,command,calls};
}

test('injected cleanup requires the exact fixture lease, immutable image and fixed-cache owner before removal',async()=>{
 const valid=cleanupTransport();const result=await cleanupPythonNativeFixtures(valid.state,{command:valid.command});assert.equal(result.result,'passed');assert.equal(result.fixtureContainers,0);assert.equal(result.fixedCacheRemoved,true);assert.equal(result.privateFilesRemoved,false);assert.ok(valid.calls.some(args=>args[0]==='rm'));assert.ok(valid.calls.some(args=>args[0]==='volume'&&args[1]==='rm'));
 for(const options of [{wrongLease:true},{wrongImage:true},{wrongPurpose:true},{wrongSmokeOwner:true}]){const invalid=cleanupTransport(options);await assert.rejects(cleanupPythonNativeFixtures(invalid.state,{command:invalid.command}));assert.ok(!invalid.calls.some(args=>args[0]==='rm'));}
 for(const options of [{nameOnlyMissingOwner:true},{nameOnlyWrongOwner:true}]){const invalid=cleanupTransport(options);await assert.rejects(cleanupPythonNativeFixtures(invalid.state,{command:invalid.command}));assert.ok(invalid.calls.some(args=>args.includes('name=^/'+invalid.state.owner+'-scan$')));assert.ok(!invalid.calls.some(args=>args[0]==='rm'));}
 for(const options of [{wrongCacheOwner:true},{extraCacheLabel:true},{unownedCache:true}]){const invalid=cleanupTransport(options);await assert.rejects(cleanupPythonNativeFixtures(invalid.state,{command:invalid.command}));assert.ok(!invalid.calls.some(args=>args[0]==='volume'&&args[1]==='rm'));}
});
