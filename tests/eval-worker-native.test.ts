import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,copyFile,symlink,rm,lstat} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {parse} from 'yaml';
import {minimatch} from 'minimatch';
// @ts-expect-error operational ESM evidence helper
import {EVAL_NATIVE_INPUTS,evalEngineMismatchRejected,evalNativeLabels,evalNativeFailure,validateEvalNativeSource,validateEvalNativeRecords} from '../scripts/lib/eval-worker-native-evidence.mjs';
// @ts-expect-error operational ESM evidence helper
import {EVAL_CHECKS} from '../scripts/lib/download-runtime-evidence.mjs';
// @ts-expect-error operational ESM owned cleanup
import {cleanupImageSmokeState} from '../scripts/lib/image-smoke-state.mjs';

function fixture(arch='amd64'){
 const hash='1'.repeat(64),source={schemaVersion:1,artifactKind:'nonpublishing-native-eval-worker',sourceCommit:'a'.repeat(40),sourceTree:'b'.repeat(40),candidateCommit:'c'.repeat(40),event:'pull_request',checkoutParents:['d'.repeat(40),'c'.repeat(40)],runId:'123',attempt:'1',arch,platform:'linux/'+arch,node:'v26.10.0',harnessOwner:'agentci-smoke-'+'1'.repeat(16),rootLockSha256:hash,packageLockSha256:hash,nativePinsSha256:hash,dockerfileSha256:hash,inputs:EVAL_NATIVE_INPUTS.map((path:string)=>({path,sha256:hash}))};
 const cleanup=(digit:string)=>({schemaVersion:1,result:'passed',owner:'agentci-smoke-'+digit.repeat(16),ownedContainers:0,ownedNetworks:0,ownedVolumes:0,privateFilesRemoved:true});
 const pins={temporalBridge:{files:{'native.node':hash}},dockerCli:{version:'29.9.2',sourceCommit:'a82e528'+'0'.repeat(33),goVersion:'go1.26.10',binarySha256:{amd64:hash,arm64:hash},vendorManifest:{sha256:hash},licenseSha256:hash,notice:{sha256:hash}}};
 const images:any={};for(const [index,role]of ['eval-worker','eval-runner'].entries())images[role]={id:'sha256:'+String(index+2).repeat(64),os:'linux',arch,user:'1001',command:role==='eval-worker'?['node','dist/apps/eval-worker/main.js']:['node','--version'],entrypoint:null,labels:evalNativeLabels(source,role)};
 const scan=(role:string)=>({ArtifactType:'container_image',ArtifactName:images[role].id,Metadata:{ImageID:images[role].id,ImageConfig:{os:'linux',architecture:arch}},Results:[{Target:'runtime',Vulnerabilities:[]}]});
 const runtime={result:'passed',deployment:'native-CLI',engine:'docker',platform:source.platform,workerImage:images['eval-worker'].id,runnerImage:images['eval-runner'].id,uid:1001,node:'v26.10.0',cli:'Docker version 29.9.2, build a82e528',license:hash,checks:[...EVAL_CHECKS],cleanup:{...cleanup('2'),ownedEvalContainers:0,evalUnitsChecked:3}};
 const records:any={'source.json':source,'daemon.json':{os:'linux',arch},'images.json':images,'worker-scan.json':scan('eval-worker'),'runner-scan.json':scan('eval-runner'),'native.json':{image:images['eval-worker'].id,engine:'docker',platform:source.platform,temporalNativeArtifacts:'matched official npm artifact',files:{...pins.temporalBridge.files},dockerCli:{Version:'29.9.2',GitCommit:'a82e528',GoVersion:'go1.26.10',sha256:hash,vendorManifestSha256:hash,licenseSha256:hash,noticeSha256:hash}},'runtime.json':runtime,'attempt.json':{schemaVersion:1,result:'passed',source},'cleanup.json':{result:'passed',harness:cleanup('1'),runtime:{...cleanup('2'),ownedEvalContainers:0,evalUnitsChecked:3}}};
 return {source,pins,records};
}
test('native evaluator source, scan, actual CLI/Temporal and cleanup proof are required separately on both architectures',()=>{
 for(const arch of ['amd64','arm64']){const f=fixture(arch);assert.equal(validateEvalNativeRecords(f.records,f.pins),f.source);}
 const changes:[string,(v:any)=>void][]=[
  ['missing runtime',v=>{delete v['runtime.json'];}],['source unrelated to candidate',v=>{v['source.json'].checkoutParents=[];}],['wrong daemon arch',v=>{v['daemon.json'].arch='arm64';}],['nonLinux daemon',v=>{v['daemon.json'].os='darwin';}],['unverified child cleanup',v=>{delete v['runtime.json'].cleanup.ownedEvalContainers;}],['wrong native arch',v=>{v['native.json'].platform='linux/arm64';}],['wrong image architecture',v=>{v['images.json']['eval-worker'].arch='arm64';}],
  ['wrong source label',v=>{v['images.json']['eval-worker'].labels['org.opencontainers.image.revision']='d'.repeat(40);}],['wrong lock label',v=>{v['images.json']['eval-runner'].labels['org.agentci.root-lock']='0'.repeat(64);}],
  ['wrong scan image',v=>{v['worker-scan.json'].Metadata.ImageID='sha256:'+'e'.repeat(64);}],['missing scan inventory',v=>{v['runner-scan.json'].Results=[];}],
  ['fixed high',v=>{v['worker-scan.json'].Results[0].Vulnerabilities=[{Severity:'HIGH',FixedVersion:'patched'}];}],['malformed severity',v=>{v['worker-scan.json'].Results[0].Vulnerabilities=[{Severity:'high',FixedVersion:'patched'}];}],
  ['old CLI',v=>{v['native.json'].dockerCli.Version='29.9.0';}],['old Go',v=>{v['native.json'].dockerCli.GoVersion='go1.26.9';}],['wrong binary',v=>{v['native.json'].dockerCli.sha256='0'.repeat(64);}],['wrong notice',v=>{v['native.json'].dockerCli.noticeSha256='0'.repeat(64);}],['missing native bridge',v=>{v['native.json'].files={};}],
  ['missing negative runtime check',v=>{v['runtime.json'].checks.pop();}],['wrong actual runtime image',v=>{v['runtime.json'].workerImage='sha256:'+'d'.repeat(64);}],['root runtime',v=>{v['runtime.json'].uid=0;}],
  ['not-started runtime cleanup',v=>{v['cleanup.json'].runtime={result:'not-started'};}],['remaining container',v=>{v['cleanup.json'].harness.ownedContainers=1;}],['private files remain',v=>{v['cleanup.json'].runtime.privateFilesRemoved=false;}],['wrong cleanup owner',v=>{v['cleanup.json'].harness.owner='agentci-smoke-'+'3'.repeat(16);}],['failed attempt',v=>{v['attempt.json'].result='failed-or-unverified';}],['wrong cohort',v=>{v['attempt.json'].source={...v['attempt.json'].source,attempt:'2'};}],
 ];
 for(const [name,change]of changes){const f=fixture();change(f.records);assert.throws(()=>validateEvalNativeRecords(f.records,f.pins),/Native evaluator evidence/,name);}
 const qualified=fixture();qualified.records['worker-scan.json'].Results[0].Vulnerabilities=[{Severity:'MEDIUM',FixedVersion:'patched'},{Severity:'HIGH'}];assert.doesNotThrow(()=>validateEvalNativeRecords(qualified.records,qualified.pins));
 const missingInput=fixture();missingInput.source.inputs.pop();assert.throws(()=>validateEvalNativeSource(missingInput.source));
});
test('public native failure projection excludes diagnostics and unknown/private fields',()=>{
 const error:any=Object.assign(Error('synthetic-private-content'),{status:73,signal:'SIGTERM',stdout:'synthetic-private-content',stderr:'synthetic-private-content'});
 assert.deepEqual(evalNativeFailure('runtime',error),{schemaVersion:1,result:'failed-or-unverified',stage:'runtime',exitCode:73,signal:'SIGTERM'});assert.ok(!JSON.stringify(evalNativeFailure('private-stage',error)).includes('private'));
});
test('engine mismatch requires natural nonzero termination and rejects timeout or signal after the expected marker',()=>{
 const result={status:1,signal:null,stderr:'Configured container engine client is unavailable'};assert.equal(evalEngineMismatchRejected(result),true);
 for(const change of [{status:0},{status:null,signal:'SIGTERM'},{status:null,error:{code:'ETIMEDOUT'}},{status:1,signal:'SIGKILL'},{stderr:''}])assert.equal(evalEngineMismatchRejected({...result,...change}),false);
});

test('actual evaluator script journals before engine work and withholds success through failure and owned recovery',async()=>{
 for(const kind of ['inspect-failure','runtime-failure','cleanup-failure']){
  const root=await mkdtemp(join(tmpdir(),'native-evaluator-transport-'));let state:string|undefined;
  try{
   const put=async(path:string,body:string)=>{await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),body);};
   for(const path of ['scripts/eval-worker-image-smoke.mjs','scripts/lib/image-smoke-state.mjs','scripts/lib/smoke-resources.mjs','scripts/lib/eval-worker-native-evidence.mjs','scripts/lib/download-runtime-evidence.mjs']){await mkdir(dirname(join(root,path)),{recursive:true});await copyFile(path,join(root,path));}
   await put('package.json','{"type":"module"}');await symlink(resolve('node_modules'),join(root,'node_modules'));
   for(const [file,body]of Object.entries({'evals/runner':'export const containerEngine=()=>"docker";','project/index':'export const parseYaml=()=>({});','storage/postgres':'export class Store{}','storage/evals':'export class EvalStore{}','review/engine':'export const analyze=()=>({});'}))await put('dist/packages/'+file+'.js',body);
   await put('bin/docker',`#!/usr/bin/env node\nimport fs from 'node:fs';const a=process.argv.slice(2),kind=${JSON.stringify(kind)},state=fs.readFileSync(process.env.GITHUB_ENV,'utf8').trim().split('=')[1],owner=JSON.parse(fs.readFileSync(state,'utf8')).owner;if(a[0]==='image'&&kind!=='inspect-failure'){console.log(a.at(-1).includes('Architecture')?'linux/amd64':'sha256:'+'a'.repeat(64));}else if(a[0]==='ps'&&kind==='cleanup-failure'){console.log('owned-container');}else if(a[0]==='inspect'&&kind==='cleanup-failure'){console.log(JSON.stringify({name:'/'+owner+'-db',labels:{'agentci.image-smoke.owner':owner}}));}else if(['ps','network','volume'].includes(a[0])){}else{console.error('synthetic-private-engine-content');process.exit(73);}\n`);
   const {chmod}=await import('node:fs/promises');await chmod(join(root,'bin/docker'),0o700);
   const envFile=join(root,'github-env');await writeFile(envFile,'');const result=spawnSync(process.execPath,['scripts/eval-worker-image-smoke.mjs'],{cwd:root,env:{PATH:join(root,'bin')+':'+process.env.PATH,GITHUB_ENV:envFile},encoding:'utf8',timeout:15000});
   assert.notEqual(result.status,0);assert.ok(!result.stdout.includes('"result":"passed"'));assert.ok(!result.stderr.includes('synthetic-private-engine-content'));
   state=(await readFile(envFile,'utf8')).trim().split('=')[1];assert.ok(state);if(kind==='cleanup-failure'){assert.ok((await lstat(state)).isFile());await assert.rejects(lstat(dirname(state)+'.cleanup.json'),{code:'ENOENT'});}const cleanup=await cleanupImageSmokeState(state,{command:()=>''});assert.equal(cleanup.result,'passed');assert.equal(cleanup.privateFilesRemoved,true);await assert.rejects(lstat(dirname(state)),{code:'ENOENT'});
  }finally{if(state){await rm(dirname(state),{recursive:true,force:true});await rm(dirname(state)+'.cleanup.json',{force:true});}await rm(root,{recursive:true,force:true});}
 }
});
test('native proof workflow publishes only local build evidence with read-only permissions and native runners',async()=>{
 const workflow=await readFile('.github/workflows/eval-worker-native.yaml','utf8');assert.match(workflow,/contents: read/);assert.match(workflow,/ubuntu-24\.04-arm/);assert.match(workflow,/ubuntu-24\.04/);assert.match(workflow,/--load/);assert.doesNotMatch(workflow,/workflow_dispatch|--push|packages: write|contents: write/);assert.match(workflow,/if: always\(\)/);assert.match(workflow,/AGENTCI_EVAL_NATIVE_OUTCOME/);assert.match(workflow,/persist-credentials: false/);const spec=parse(workflow);assert.equal(spec.jobs.native.steps[0].with['fetch-depth'],2);assert.deepEqual(spec.on.push.paths,spec.on.pull_request.paths);assert.deepEqual(spec.on.push.branches,['main']);for(const input of EVAL_NATIVE_INPUTS)assert.ok(spec.on.push.paths.some((pattern:string)=>minimatch(input,pattern)),input);
});
test('checkout depth retains actual PR merge parents required by the source binding',async()=>{
 const root=await mkdtemp(join(tmpdir(),'native-evaluator-git-'));
 const git=(cwd:string,args:string[])=>{const result=spawnSync('git',args,{cwd,env:{PATH:process.env.PATH,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'},encoding:'utf8',timeout:15000});assert.equal(result.status,0,result.stderr);return result.stdout.trim();};
 try{
  const source=join(root,'source');await mkdir(source);git(source,['init','-b','main']);git(source,['config','user.name','Synthetic Fixture']);git(source,['config','user.email','synthetic@example.invalid']);
  await writeFile(join(source,'base'),'base');git(source,['add','base']);git(source,['commit','-m','base']);git(source,['checkout','-b','candidate']);await writeFile(join(source,'candidate'),'candidate');git(source,['add','candidate']);git(source,['commit','-m','candidate']);const candidate=git(source,['rev-parse','HEAD']);
  git(source,['checkout','main']);await writeFile(join(source,'main'),'main');git(source,['add','main']);git(source,['commit','-m','main']);git(source,['merge','--no-ff','candidate','-m','synthetic merge']);
  for(const depth of [1,2]){const clone=join(root,'depth-'+depth);git(root,['clone','--depth',String(depth),pathToFileURL(source).href,clone]);const parents=git(clone,['show','-s','--format=%P','HEAD']).split(/\s+/).filter(Boolean);const f=fixture();f.source.sourceCommit=git(clone,['rev-parse','HEAD']);f.source.candidateCommit=candidate;f.source.checkoutParents=parents;if(depth===1)assert.throws(()=>validateEvalNativeSource(f.source));else{assert.equal(parents.length,2);assert.doesNotThrow(()=>validateEvalNativeSource(f.source));}}
 }finally{await rm(root,{recursive:true,force:true});}
});
test('actual native finalizer cannot upgrade success step status or partial cleanup into missing proof',async()=>{
 for(const interrupted of [false,true]){const root=await mkdtemp(join(tmpdir(),'native-evaluator-finalizer-'));let privateRoot:string|undefined;
 try{
  if(interrupted){privateRoot=await mkdtemp(join(tmpdir(),'agentci-image-smoke-'));await writeFile(join(privateRoot,'ownership.json'),JSON.stringify({schemaVersion:1,owner:'agentci-smoke-'+'7'.repeat(16)}),{mode:0o600});}
  const result=spawnSync(process.execPath,[resolve('scripts/eval-worker-native-acceptance.mjs'),'finalize'],{cwd:root,env:{PATH:process.env.PATH,AGENTCI_EVAL_NATIVE_OUTCOME:'success',...(privateRoot?{AGENTCI_IMAGE_SMOKE_STATE_FILE:join(privateRoot,'ownership.json')}:{})},encoding:'utf8',timeout:15000});
  assert.notEqual(result.status,0);const directory=join(root,'.agentci/artifacts/eval-worker-native');const record=JSON.parse(await readFile(join(directory,'result.json'),'utf8'));
  assert.equal(record.result,'failed-or-unverified');assert.equal(record.source,null);assert.equal(record.publication,'not-performed');assert.equal(record.releaseComplete,false);
  const cleanup=JSON.parse(await readFile(join(directory,'cleanup.json'),'utf8'));assert.equal(cleanup.result,'not-started-or-unverified');assert.equal(cleanup.harness.result,'not-started');assert.equal(cleanup.runtime.result,interrupted?'recovery-required-unverified':'not-started');assert.equal(cleanup.runtime.ownedContainers,undefined);assert.equal(cleanup.runtime.privateFilesRemoved,undefined);if(privateRoot)assert.ok((await lstat(join(privateRoot,'ownership.json'))).isFile());
  assert.deepEqual(record.files.map((file:any)=>file.path).sort(),['cleanup.json','failure-finalize.json']);
  for(const file of record.files){const bytes=await readFile(join(directory,file.path));assert.equal(bytes.length,file.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);}
 }finally{if(privateRoot)await rm(privateRoot,{recursive:true,force:true});await rm(root,{recursive:true,force:true});}}
});
