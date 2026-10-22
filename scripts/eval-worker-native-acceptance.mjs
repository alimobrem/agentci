import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {readFile,writeFile,mkdir,mkdtemp,appendFile,lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {verifyNativeInputs,verifyNativeProvenance} from './verify-native-provenance.mjs';
import {cleanupImageSmokeState} from './lib/image-smoke-state.mjs';
import {SMOKE_OWNER_LABEL} from './lib/smoke-resources.mjs';
import {NATIVE_SCAN_IMAGE,NATIVE_FILES,EVAL_NATIVE_INPUTS,nativeHash,evalNativeFailure,validateEvalNativeSource,validateEvalNativeDaemon,validateEvalNativeImages,validateEvalNativeScan,validateEvalNativeProvenance,validateEvalNativeRuntime,validateEvalNativeRecords} from './lib/eval-worker-native-evidence.mjs';

const directory=resolve('.agentci/artifacts/eval-worker-native');
const inputPaths=EVAL_NATIVE_INPUTS;
const execute=(command,args,options={})=>execFileSync(command,args,{env:{PATH:process.env.PATH},encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:60000,maxBuffer:8*1024*1024,...options});
const git=args=>execute('git',args).trim();
async function save(name,value){const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n');if(bytes.length>4*1024*1024)throw Error('Public evaluator evidence exceeds its byte bound');await mkdir(directory,{recursive:true});await writeFile(join(directory,name),bytes,{flag:'wx',mode:0o644});}
async function load(name){const path=join(directory,name),info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||info.size>4*1024*1024)throw Error('Invalid evaluator evidence file');return JSON.parse(await readFile(path,'utf8'));}
async function bindSource(arch,harnessOwner){
 if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REPOSITORY!=='alimobrem/agentci'||!['pull_request','push'].includes(process.env.GITHUB_EVENT_NAME)||process.platform!=='linux'||process.version!=='v26.10.0'||(process.arch==='x64'?'amd64':process.arch)!==arch||process.env.AGENTCI_CONTAINER_ENGINE!=='docker')throw Error('Exact hosted native runner required');
 const sourceCommit=git(['rev-parse','HEAD']),candidateCommit=process.env.AGENTCI_EVAL_NATIVE_HEAD,event=process.env.GITHUB_EVENT_NAME,checkoutParents=git(['show','-s','--format=%P','HEAD']).split(/\s+/).filter(Boolean);if(sourceCommit!==process.env.GITHUB_SHA||event==='push'&&candidateCommit!==sourceCommit||event==='pull_request'&&candidateCommit!==sourceCommit&&!checkoutParents.includes(candidateCommit))throw Error('Hosted checkout source/head mismatch');git(['diff','--quiet','HEAD','--']);
 const inputs=[];for(const path of inputPaths){const info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1)throw Error('Committed regular proof inputs required');const bytes=await readFile(path);if(!bytes.equals(execFileSync('git',['show','HEAD:'+path],{env:{PATH:process.env.PATH},stdio:'pipe',maxBuffer:8*1024*1024})))throw Error('Proof input differs from Git');inputs.push({path,sha256:nativeHash(bytes)});}
 await verifyNativeInputs();const hash=path=>inputs.find(f=>f.path===path).sha256;
 return validateEvalNativeSource({schemaVersion:1,artifactKind:'nonpublishing-native-eval-worker',sourceCommit,sourceTree:git(['rev-parse','HEAD^{tree}']),candidateCommit,event,checkoutParents,runId:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT,arch,platform:'linux/'+arch,node:process.version,harnessOwner,rootLockSha256:hash('npm-shrinkwrap.json'),packageLockSha256:hash('package-lock.json'),nativePinsSha256:hash('deploy/security/native-components.json'),dockerfileSha256:hash('Dockerfile'),inputs});
}
async function recover(path){return path?cleanupImageSmokeState(path):{schemaVersion:1,result:'not-started'};}
let stage='prepare',source;
try{
 const command=process.argv[2];
 if(command==='source'){
  const owner='agentci-smoke-'+randomBytes(8).toString('hex');source=await bindSource(process.argv[3],owner);await save('source.json',source);
  const privateRoot=await mkdtemp(join(tmpdir(),'agentci-image-smoke-'));
  const state=join(privateRoot,'ownership.json');await writeFile(state,JSON.stringify({schemaVersion:1,owner}),{flag:'wx',mode:0o600});
  if(!process.env.GITHUB_ENV||!process.env.GITHUB_OUTPUT)throw Error('Hosted state/output channels required');
  // Keep the scanner journal distinct from the runtime journal registered by the child.
  await appendFile(process.env.GITHUB_ENV,'AGENTCI_EVAL_NATIVE_STATE_FILE='+state+'\n');
  for(const [key,value]of Object.entries({source:source.sourceCommit,tree:source.sourceTree,candidate:source.candidateCommit,root_lock:source.rootLockSha256,native_pins:source.nativePinsSha256}))await appendFile(process.env.GITHUB_OUTPUT,key+'='+value+'\n');
 }else if(command==='qualify'){
  source=await load('source.json');if(JSON.stringify(await bindSource(source.arch,source.harnessOwner))!==JSON.stringify(source))throw Error('Native source changed');
  const pins=await verifyNativeInputs(),images={};stage='images';
  const daemon=JSON.parse(execute('docker',['info','--format','{\"os\":{{json .OSType}},\"arch\":{{json .Architecture}}}']));daemon.arch=['x86_64','x64','amd64'].includes(daemon.arch)?'amd64':['aarch64','arm64'].includes(daemon.arch)?'arm64':daemon.arch;validateEvalNativeDaemon(daemon,source);await save('daemon.json',daemon);
  for(const role of ['eval-worker','eval-runner']){
   const tag=`agentci-${role}:qualification-${source.runId}-${source.attempt}-${source.arch}`,raw=JSON.parse(execute('docker',['image','inspect',tag]));if(raw.length!==1)throw Error('Ambiguous local image');const info=raw[0];images[role]={id:info.Id,os:info.Os,arch:info.Architecture,user:info.Config.User,command:info.Config.Cmd,entrypoint:info.Config.Entrypoint??null,labels:info.Config.Labels};
  }
  validateEvalNativeImages(images,source);await save('images.json',images);
  const state=process.env.AGENTCI_EVAL_NATIVE_STATE_FILE;if(!state)throw Error('Owned scanner state required');
  for(const [role,file]of [['eval-worker','worker-scan.json'],['eval-runner','runner-scan.json']]){
   stage=role==='eval-worker'?'worker-scan':'runner-scan';
   const scan=JSON.parse(execute('docker',['run','--rm','--name',source.harnessOwner+'-'+stage,'--label',SMOKE_OWNER_LABEL+'='+source.harnessOwner,'--read-only','--tmpfs','/tmp:rw,nosuid,nodev,size=1g','-v','/var/run/docker.sock:/var/run/docker.sock',NATIVE_SCAN_IMAGE,'image','--cache-dir','/tmp/trivy-cache','--scanners','vuln','--format','json',images[role].id],{timeout:180000}));
   await save(file,scan);validateEvalNativeScan(scan,images[role].id,source);
  }
  stage='native';const native=await verifyNativeProvenance(images['eval-worker'].id,{owner:source.harnessOwner});validateEvalNativeProvenance(native,images['eval-worker'].id,source,pins);await save('native.json',native);
  stage='runtime';const observed=JSON.parse(execute(process.execPath,['scripts/eval-worker-image-smoke.mjs',images['eval-worker'].id,images['eval-runner'].id],{env:{PATH:process.env.PATH,GITHUB_ENV:process.env.GITHUB_ENV,AGENTCI_CONTAINER_ENGINE:'docker'},timeout:300000}));
  const runtime=Object.fromEntries(['result','deployment','engine','platform','workerImage','runnerImage','uid','node','cli','license','checks','github','cleanup'].map(key=>[key,observed[key]]));validateEvalNativeRuntime(runtime,images,source,pins);await save('runtime.json',runtime);
  stage='source-recheck';if(JSON.stringify(await bindSource(source.arch,source.harnessOwner))!==JSON.stringify(source))throw Error('Native source changed');await save('attempt.json',{schemaVersion:1,result:'passed',source});
 }else if(command==='finalize'){
  const cleanup={result:'failed-or-unverified'};let error,runtimeProof;
  try{const bound=await load('source.json'),images=await load('images.json');validateEvalNativeSource(bound);validateEvalNativeImages(images,bound);const observed=await load('runtime.json');validateEvalNativeRuntime(observed,images,bound,await verifyNativeInputs());runtimeProof=observed;}catch{}
  try{cleanup.harness=await recover(process.env.AGENTCI_EVAL_NATIVE_STATE_FILE);}catch{cleanup.harness={schemaVersion:1,result:'recovery-required-unverified'};error=true;}
  // In-memory eval unit IDs cannot be recovered after an interrupted child. Retain
  // its journal and withhold all runtime zero/private-removal claims in that case.
  if(runtimeProof){try{const recovered=await recover(process.env.AGENTCI_IMAGE_SMOKE_STATE_FILE);if(recovered.owner!==runtimeProof.cleanup.owner)throw Error();cleanup.runtime={...recovered,ownedEvalContainers:0,evalUnitsChecked:runtimeProof.cleanup.evalUnitsChecked};}catch{cleanup.runtime={schemaVersion:1,result:'recovery-required-unverified'};error=true;}}
  else cleanup.runtime={schemaVersion:1,result:process.env.AGENTCI_IMAGE_SMOKE_STATE_FILE?'recovery-required-unverified':'not-started'};
  cleanup.result=error?'failed-or-unverified':['harness','runtime'].every(name=>cleanup[name]?.result==='passed')?'passed':'not-started-or-unverified';await save('cleanup.json',cleanup);stage='evidence-validation';
  const records={};for(const file of NATIVE_FILES)try{records[file]=await load(file);}catch{}
  let result='failed-or-unverified';try{const pins=await verifyNativeInputs();source=validateEvalNativeRecords(records,pins);if(process.env.AGENTCI_EVAL_NATIVE_OUTCOME!=='success'||JSON.stringify(await bindSource(source.arch,source.harnessOwner))!==JSON.stringify(source))throw Error();result='passed';}catch{}
  if(result!=='passed')await save('failure-finalize.json',evalNativeFailure(stage,{}));
  const files=[];for(const name of [...NATIVE_FILES,'failure-source.json','failure-qualify.json','failure-finalize.json'])try{const bytes=await readFile(join(directory,name));files.push({path:name,sha256:nativeHash(bytes),bytes:bytes.length});}catch{}
  await save('result.json',{schemaVersion:1,result,source:records['source.json']??null,files,publication:'not-performed',releaseComplete:false,qualification:'Native synthetic Docker evaluator runtime/scan/provenance only; no release, live provider, customer or other role acceptance.'});if(result!=='passed')throw Error('Native evaluator acceptance incomplete');
 }else throw Error('Use source, qualify or finalize');
}catch(error){
 try{await save('failure-'+(process.argv[2]==='finalize'?'finalize':process.argv[2]==='source'?'source':'qualify')+'.json',evalNativeFailure(stage,error));}catch{}
 console.error('Native evaluator qualification failed or remains unverified; retain bounded evidence and owned recovery state.');process.exitCode=1;
}
