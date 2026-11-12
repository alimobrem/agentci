import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,lstat,chmod,rename,symlink,link,open} from 'node:fs/promises';
import {mkdirSync,copyFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
// @ts-ignore Operational candidate package acceptance.
import {candidatePackageIdentity,runCandidatePackageAcceptance,validateCandidateAcceptance,loadCandidatePackageAcceptance} from '../scripts/lib/candidate-package-acceptance.mjs';

const hash=(bytes:any)=>createHash('sha256').update(bytes).digest('hex');
const repository=resolve(fileURLToPath(new URL('..',import.meta.url)));
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'candidate-acceptance-fixture-')),version='0.4.0-m3-dev.4';
 const package_={name:'agentci',version,type:'module',bin:{agentci:'dist/cmd/agentci/main.js'},exports:{'./client':'./dist/packages/client/index.js'}};
 const lock=JSON.stringify({name:'agentci',version,lockfileVersion:2,packages:{'':{name:'agentci',version}}})+'\n';
 const contents:Record<string,string>={'package.json':JSON.stringify(package_)+'\n','package-lock.json':lock,'npm-shrinkwrap.json':lock,'dist/cmd/agentci/main.js':`#!/usr/bin/env node\nconsole.log('${version}');\n`,'dist/packages/version.js':`export const VERSION='${version}';\n`,'dist/packages/client/index.js':'export class ModelReviewClient{};export class AgentCIError extends Error{};\n'};
 for(const name of ['openai','anthropic','xai'])contents['dist/packages/providers/'+name+'.js']='export const synthetic=true;\n';
 for(const [path,bytes]of Object.entries(contents)){await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),bytes);await chmod(join(root,path),path==='dist/cmd/agentci/main.js'?0o755:0o644);}
 const git=(args:string[])=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:'pipe'}).trim();
 git(['init','--quiet']);git(['add','.']);git(['-c','user.name=Synthetic Fixture','-c','user.email=fixture@example.invalid','commit','--quiet','-m','Synthetic package fixture']);
 const expected=candidatePackageIdentity({root,version,env:{PATH:process.env.PATH}});
 contents['dist/release-source.json']=JSON.stringify({schemaVersion:1,version,sourceCommit:expected.sourceCommit})+'\n';await writeFile(join(root,'dist/release-source.json'),contents['dist/release-source.json']);
 const files=await Promise.all(Object.entries(contents).map(async([path,bytes])=>({path,mode:(await lstat(join(root,path))).mode&0o777,size:Buffer.byteLength(bytes),sha256:hash(bytes)})));
 await mkdir(join(root,'releases'));
 const archiveSource=join(root,'archive-source');
 for(const [path,bytes]of Object.entries(contents)){const destination=join(archiveSource,'package',path);await mkdir(dirname(destination),{recursive:true});await writeFile(destination,bytes);await chmod(destination,files.find(file=>file.path===path)!.mode);}
 const archivePath=join(root,`releases/agentci-${version}.tgz`);
 execFileSync('tar',['--format=ustar','-czf',archivePath,'-C',archiveSource,'--',...Object.keys(contents).map(path=>'package/'+path)],{stdio:'pipe',env:{PATH:process.env.PATH,COPYFILE_DISABLE:'1'}});
 const archive=await readFile(archivePath),manifest:any={schemaVersion:1,artifactKind:'candidate-source-package',...expected,packaging:{npm:'12.2.0',lifecycleScripts:false},package:{name:`agentci-${version}.tgz`,sha256:hash(archive)},files,committedLocks:['package-lock.json','npm-shrinkwrap.json'].map(path=>({path,gitBlob:git(['rev-parse',`HEAD:${path}`]),sha256:hash(contents[path])})),provenance:{path:'dist/release-source.json',sha256:hash(contents['dist/release-source.json'])}};
 const manifestPath=join(root,'releases/candidate-package-manifest.json'),receiptPath=join(root,'.agentci/artifacts/candidate-package-acceptance.json');
 await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
 return {root,contents,expected,manifest,archivePath,manifestPath,receiptPath,options:{archivePath,manifestPath,receiptPath,expected,sourceRoot:root,offline:true}};
}
function syntheticRunner(f:any,{failStage='',mutate=false,developmentLoader=false}:any={}){
 const calls:any[]=[];let temporaryRoot='';
 const run=(command:string,args:string[],options:any)=>{
  if(command!=='npm')return execFileSync(command,args,options);
  calls.push({command,args,cwd:options.cwd,env:options.env,userConfig:readFileSync(options.env.npm_config_userconfig,'utf8'),globalConfig:readFileSync(options.env.npm_config_globalconfig,'utf8')});
  if(args[0]==='--version')return '12.2.0\n';
  if(args[0]===failStage){const error:any=Error('sentinel npm output must never be retained');error.status=73;error.stdout='sentinel-secret';throw error;}
  if(args[0]==='ci'){
   temporaryRoot=dirname(dirname(options.cwd));mkdirSync(join(options.cwd,'node_modules'),{recursive:true});
   if(mutate)copyFileSync(join(f.root,'package.json'),join(options.cwd,'package-lock.json'));
   if(developmentLoader){mkdirSync(join(options.cwd,'node_modules/tsx'),{recursive:true});copyFileSync(join(f.root,'package.json'),join(options.cwd,'node_modules/tsx/package.json'));}
  }else if(args[0]==='install'){
   const consumer=args[args.indexOf('--prefix')+1];assert.ok(consumer,'Synthetic consumer install requires its explicit prefix');
   for(const path of Object.keys(f.contents)){const target=join(consumer,'node_modules/agentci',path);mkdirSync(dirname(target),{recursive:true});copyFileSync(join(f.root,path),target);}
  }
  return '';
 };
 return {run,calls,get temporaryRoot(){return temporaryRoot;}};
}
async function receipt(f:any){return JSON.parse(await readFile(f.receiptPath,'utf8'));}
const fixtureConsumerSmoke=async({consumerRoot}:any)=>{await lstat(join(consumerRoot,'node_modules/agentci/package.json'));};

test('actual offline synthetic npm roots are distinct and final archive bytes remain verified',async()=>{
 const f=await fixture();
 try{
  const proof=await runCandidatePackageAcceptance(f.options,async({consumerRoot,lockedRoot}:any)=>{assert.notEqual(consumerRoot,lockedRoot);await lstat(join(consumerRoot,'node_modules/agentci'));});
  assert.equal(proof.lockedRoot.result,'passed');assert.equal(proof.consumer.result,'passed');assert.equal(proof.cleanup.result,'passed');
  const loaded=await loadCandidatePackageAcceptance({root:f.root,expected:f.expected});assert.equal(loaded.receipt.packageSha256,f.manifest.package.sha256);
 }finally{await rm(f.root,{recursive:true,force:true});}
});

test('candidate install environment excludes database, Temporal, token and npm config sentinels',async()=>{
 const f=await fixture(),runner=syntheticRunner(f),keys=['AGENTCI_TEST_DATABASE_URL','AGENTCI_TEST_TEMPORAL_ADDRESS','GITHUB_TOKEN','NODE_OPTIONS','npm_config_ignore_scripts'],previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 try{
  for(const key of keys)process.env[key]='sentinel-private-value';
  const proof=await runCandidatePackageAcceptance({...f.options,runCommand:runner.run},fixtureConsumerSmoke);
  assert.equal(proof.policy.dependencyLifecycleScripts,'enabled');
  assert.deepEqual(runner.calls.map(call=>call.args[0]),['--version','ci','install']);
  assert.notEqual(runner.calls[1].cwd,runner.calls[2].cwd);
  for(const call of runner.calls){assert.deepEqual(Object.keys(call.env).sort(),['HOME','PATH','npm_config_cache','npm_config_userconfig','npm_config_globalconfig','npm_config_registry'].sort());for(const key of keys)assert.equal(call.env[key],undefined);assert.equal(call.userConfig,'');assert.equal(call.globalConfig,'');}
  assert.ok(!JSON.stringify(proof).includes('sentinel'));
 }finally{for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}await rm(f.root,{recursive:true,force:true});}
});

test('missing locks, wrong identity and corrupt final archive reject before any npm command',async()=>{
 for(const change of ['missing-lock','wrong-tree','wrong-run','corrupt-archive','forged-lock-blob','changed-head','project-npmrc']){
  const f=await fixture(),runner=syntheticRunner(f);
  try{
   if(change==='missing-lock')f.manifest.files=f.manifest.files.filter((file:any)=>file.path!=='package-lock.json');
   if(change==='wrong-tree')f.manifest.sourceTree='b'.repeat(40);
   if(change==='wrong-run')f.manifest.runId='999';
   if(change==='forged-lock-blob')f.manifest.committedLocks[0].gitBlob='c'.repeat(40);
   if(change==='changed-head')execFileSync('git',['-c','user.name=Synthetic Fixture','-c','user.email=fixture@example.invalid','commit','--allow-empty','--quiet','-m','New synthetic head'],{cwd:f.root,stdio:'pipe'});
   if(change==='project-npmrc')await writeFile(join(f.root,'.npmrc'),'synthetic project config must not be read\n');
   await writeFile(f.manifestPath,JSON.stringify(f.manifest));if(change==='corrupt-archive')await writeFile(f.archivePath,'corrupt');
   await assert.rejects(runCandidatePackageAcceptance({...f.options,runCommand:runner.run},fixtureConsumerSmoke),/archive-validation/);
   assert.equal(runner.calls.length,0);const proof=await receipt(f);assert.equal(proof.result,'failed');assert.equal(proof.cleanup.result,'passed');
  }finally{await rm(f.root,{recursive:true,force:true});}
 }
});

test('install, byte-mutation, dev-loader, caller and cleanup failures retain bounded receipts',async()=>{
 for(const mode of ['ci','install','mutation','development-loader','caller','cleanup']){
  const f=await fixture(),runner=syntheticRunner(f,{failStage:mode,mutate:mode==='mutation',developmentLoader:mode==='development-loader'});
  try{
   await assert.rejects(runCandidatePackageAcceptance({...f.options,runCommand:runner.run,...(mode==='cleanup'?{removeRoot:async()=>{throw Error('cleanup denied');}}:{})},async()=>{if(mode==='caller')throw Error('caller sentinel-secret');}),/retained failure and cleanup receipt/);
   const proof=await receipt(f);assert.equal(proof.result,'failed');assert.ok(!JSON.stringify(proof).includes('sentinel-secret'));assert.equal(proof.cleanup.result,mode==='cleanup'?'failed':'passed');
   if(['ci','install'].includes(mode))assert.equal(proof.failure.exitCode,73);
   if(mode==='ci')assert.equal(proof.consumer.result,'not-run');
  }finally{if(runner.temporaryRoot)await rm(runner.temporaryRoot,{recursive:true,force:true});await rm(f.root,{recursive:true,force:true});}
 }
});

test('acceptance validation rejects consumer-only, stale, corrupt and unclean evidence',async()=>{
 const f=await fixture(),runner=syntheticRunner(f);
 try{
  const proof=await runCandidatePackageAcceptance({...f.options,runCommand:runner.run},fixtureConsumerSmoke),expected={...f.expected,manifestSha256:hash(await readFile(f.manifestPath)),packageSha256:f.manifest.package.sha256};
  validateCandidateAcceptance(proof,f.manifest,expected);
  const mutations=[(v:any)=>{delete v.lockedRoot;},(v:any)=>{v.lockedRoot.result='not-run';},(v:any)=>{v.cleanup.result='failed';},(v:any)=>{v.sourceTree='a'.repeat(40);},(v:any)=>{v.runId='999';},(v:any)=>{v.manifestSha256='0'.repeat(64);},(v:any)=>{v.packageSha256='0'.repeat(64);},(v:any)=>{v.consumer.result='not-run';},(v:any)=>{v.existingConsumerSmoke.result='not-run';}];
  for(const mutate of mutations){const changed=structuredClone(proof);mutate(changed);assert.throws(()=>validateCandidateAcceptance(changed,f.manifest,expected));}
 }finally{await rm(f.root,{recursive:true,force:true});}
});

test('missing explicit consumer smoke fails before npm and cannot claim smoke acceptance',async()=>{
 const f=await fixture(),runner=syntheticRunner(f);
 try{
  await assert.rejects(runCandidatePackageAcceptance({...f.options,runCommand:runner.run}),{code:'candidate-consumer-smoke-required'});
  const proof=await receipt(f);assert.equal(runner.calls.length,0);assert.equal(proof.failure.code,'candidate-consumer-smoke-required');assert.equal(proof.existingConsumerSmoke.result,'not-run');assert.equal(proof.cleanup.result,'passed');
 }finally{await rm(f.root,{recursive:true,force:true});}
});

test('acceptance and summary reject linked and oversized archive paths before reading or npm',async()=>{
 for(const mode of ['symlink','hardlink','oversized']){
  const f=await fixture(),runner=syntheticRunner(f);
  try{
   const retained=join(f.root,'original-archive.tgz');await rename(f.archivePath,retained);
   if(mode==='symlink')await symlink(retained,f.archivePath);
   if(mode==='hardlink')await link(retained,f.archivePath);
   if(mode==='oversized'){const file=await open(f.archivePath,'wx');try{await file.truncate(64*1024*1024+1);}finally{await file.close();}}
   await assert.rejects(runCandidatePackageAcceptance({...f.options,runCommand:runner.run},fixtureConsumerSmoke),{code:'candidate-archive-input-rejected'});
   assert.equal(runner.calls.length,0);const proof=await receipt(f);assert.equal(proof.failure.code,'candidate-archive-input-rejected');assert.equal(proof.archiveVerified,false);assert.equal(proof.lockedRoot.result,'not-run');assert.equal(proof.cleanup.result,'passed');
   await assert.rejects(loadCandidatePackageAcceptance({root:f.root,expected:f.expected}),{code:'candidate-archive-input-rejected'});
  }finally{await rm(f.root,{recursive:true,force:true});}
 }
});

test('actual verification summary requires current candidate manifest, archive and both cleaned install receipts',async()=>{
 const f=await fixture(),runner=syntheticRunner(f),put=async(path:string,value:any)=>{await mkdir(dirname(join(f.root,path)),{recursive:true});await writeFile(join(f.root,path),JSON.stringify(value));};
 try{
  await runCandidatePackageAcceptance({...f.options,runCommand:runner.run},fixtureConsumerSmoke);
  await put('.agentci/artifacts/delivery/fast-latest.json',{passed:true,sourceCommit:f.expected.sourceCommit});
  await put('.agentci/artifacts/api-compatibility.json',{sourceCommit:f.expected.sourceCommit,exitCode:0});
  await put('.agentci/artifacts/image-smoke.json',{result:'passed'});await put('.agentci/artifacts/eval-worker-image-smoke.json',{result:'passed',workerImage:'synthetic-image'});
  await put('.agentci/artifacts/customer-dev4-scope-regression.json',{harnessSource:f.expected.sourceCommit,result:'passed',sameScope:{rejection:'attempt-limit',countsBefore:{owned:0},countsAfter:{owned:0}},isolated:{ownedContainers:0},primaryHistoryImmutable:true,cleanup:[{result:'passed',ownedDatabases:0},{result:'passed',ownedDatabases:0}]});
  for(const role of ['worker','eval-worker'])await put(`.agentci/artifacts/native-provenance-${role}.json`,{temporalNativeArtifacts:true,files:{fixture:'hash'},dockerCli:true,podmanClient:false,image:'synthetic-image'});
  await mkdir(join(f.root,'scan-results'));
  const command=()=>execFileSync(process.execPath,[join(repository,'scripts/verification-summary.mjs')],{cwd:f.root,env:{PATH:process.env.PATH},encoding:'utf8',stdio:'pipe'});
  command();const report=JSON.parse(await readFile(join(f.root,'.agentci/artifacts/verification.json'),'utf8'));assert.equal(report.releaseComplete,false);assert.equal(report.candidatePackageAcceptance.lockedRoot.result,'passed');
  const originalReceipt=await readFile(f.receiptPath),originalManifest=await readFile(f.manifestPath),originalArchive=await readFile(f.archivePath);
  for(const mode of ['missing-receipt','missing-lock-proof','corrupt-manifest','corrupt-archive']){
   await writeFile(f.receiptPath,originalReceipt);await writeFile(f.manifestPath,originalManifest);await writeFile(f.archivePath,originalArchive);
   if(mode==='missing-receipt')await rm(f.receiptPath);if(mode==='missing-lock-proof'){const changed=JSON.parse(originalReceipt.toString());delete changed.lockedRoot;await writeFile(f.receiptPath,JSON.stringify(changed));}if(mode==='corrupt-manifest')await writeFile(f.manifestPath,'{}');if(mode==='corrupt-archive')await writeFile(f.archivePath,'corrupt');
   assert.throws(command);
  }
 }finally{await rm(f.root,{recursive:true,force:true});}
});
