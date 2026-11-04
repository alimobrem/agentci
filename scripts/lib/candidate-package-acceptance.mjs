import {mkdtemp,mkdir,readFile,writeFile,rm,lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {hash,sanitizedPackageEnvironment} from './development-artifacts.mjs';
import {validateCandidateManifest,verifyCandidateArchive,extractCandidateArchive,readCandidateArchive} from './source-package.mjs';

export const CANDIDATE_MANIFEST_PATH='releases/candidate-package-manifest.json';
export const CANDIDATE_ACCEPTANCE_PATH='.agentci/artifacts/candidate-package-acceptance.json';
const npmFlags=['--omit=dev','--no-audit','--no-fund'];
const installPolicy={npm:'12.2.0',productionOnly:true,dependencyLifecycleScripts:'enabled',registry:'https://registry.npmjs.org/',credentialEnvironment:'excluded',npmConfigs:'empty',homeAndCache:'owned-temporary'};
const identityKeys=['version','sourceCommit','sourceTree','candidateCommit','runId','attempt'];

export function candidatePackageIdentity({root=process.cwd(),version,env=process.env}={}){
 const git=args=>execFileSync('git',args,{cwd:root,env:{PATH:env.PATH},encoding:'utf8',stdio:'pipe'}).trim();
 const sourceCommit=git(['rev-parse','HEAD']);
 return {version,sourceCommit,sourceTree:git(['rev-parse','HEAD^{tree}']),candidateCommit:env.AGENTCI_CANDIDATE_SHA??sourceCommit,runId:env.GITHUB_RUN_ID??'0',attempt:env.GITHUB_RUN_ATTEMPT??'1'};
}

export async function verifyCandidateCommittedLocks(manifest,sourceRoot){
 const git=args=>execFileSync('git',args,{cwd:sourceRoot,env:{PATH:process.env.PATH},stdio:'pipe',timeout:30000,maxBuffer:8*1024*1024});
 const committed=path=>{
  const entry=git(['ls-tree','-z',manifest.sourceCommit,'--',path]).toString(),match=/^100(?:644|755) blob ([a-f0-9]{40})\t([^\0]+)\0$/.exec(entry);
  if(!match||match[2]!==path)throw Error('Committed candidate root must be regular Git files');
  return {blob:match[1],bytes:git(['cat-file','blob',match[1]])};
 };
 if(git(['rev-parse','HEAD']).toString().trim()!==manifest.sourceCommit||git(['rev-parse','HEAD^{tree}']).toString().trim()!==manifest.sourceTree)throw Error('Candidate source differs from current checkout');
 if(hash(committed('package.json').bytes)!==manifest.files.find(file=>file.path==='package.json')?.sha256)throw Error('Candidate package manifest differs from committed source');
 const locks=[];
 for(const path of ['package-lock.json','npm-shrinkwrap.json']){
  const proof=manifest.committedLocks.find(file=>file.path===path);
  const {bytes,blob}=committed(path);
  if(proof?.gitBlob!==blob||proof.sha256!==hash(bytes))throw Error('Candidate lock differs from committed source');
  locks.push(bytes);
 }
 if(!locks[0].equals(locks[1]))throw Error('Committed candidate locks differ');
}

async function noProjectNpmrc(root){
 try{await lstat(join(root,'.npmrc'));}catch(error){if(error.code==='ENOENT')return;throw error;}
 throw Error('Project npm configuration is outside the candidate install policy');
}

export async function verifyInstalledCandidateFiles(packageRoot,manifest){
 const rootInfo=await lstat(packageRoot);if(!rootInfo.isDirectory()||rootInfo.isSymbolicLink())throw Error('Candidate package root changed');
 for(const file of manifest.files){
  let parent=packageRoot;
  for(const segment of file.path.split('/').slice(0,-1)){
   parent=join(parent,segment);const info=await lstat(parent);
   if(!info.isDirectory()||info.isSymbolicLink())throw Error('Candidate package parent changed');
  }
  const path=join(packageRoot,file.path),info=await lstat(path);
  if(!info.isFile()||info.isSymbolicLink()||info.size!==file.size||(info.mode&0o777)!==file.mode||hash(await readFile(path))!==file.sha256)throw Error('Installed candidate file differs from verified archive');
 }
}

async function noDevelopmentLoader(root){
 try{await lstat(join(root,'node_modules/tsx/package.json'));}catch(error){if(error.code==='ENOENT')return;throw error;}
 throw Error('Development loader entered candidate production install');
}

async function createNpmEnvironment(root,path){
 await mkdir(root,{mode:0o700});
 await writeFile(join(root,'empty.npmrc'),'',{flag:'wx',mode:0o600});
 await writeFile(join(root,'empty-global.npmrc'),'',{flag:'wx',mode:0o600});
 return sanitizedPackageEnvironment(root,path);
}

function candidateProbes(packageRoot,projectRoot,version,env,run){
 if(run(process.execPath,[join(packageRoot,'dist/cmd/agentci/main.js'),'--version'],{env}).trim()!==version)throw Error('Candidate production CLI version mismatch');
 run(process.execPath,['--input-type=module','-e',"import {ModelReviewClient,AgentCIError} from 'agentci/client';if(typeof ModelReviewClient!=='function'||typeof AgentCIError!=='function')throw Error('Candidate public client missing');"],{cwd:projectRoot,env});
 for(const name of ['openai','anthropic','xai'])run(process.execPath,['--input-type=module','-e','await import('+JSON.stringify(pathToFileURL(join(packageRoot,'dist/packages/providers/'+name+'.js')).href)+');'],{env});
}

/** Validate the final archive before npm, then keep both install routes distinct.
 * The callback retains existing consumer/installed PostgreSQL acceptance. Only
 * those explicit source-test children receive their database/Temporal context.
 */
export async function runCandidatePackageAcceptance({archivePath,manifestPath=CANDIDATE_MANIFEST_PATH,receiptPath=CANDIDATE_ACCEPTANCE_PATH,expected,sourceRoot=process.cwd(),offline=false,runCommand=execFileSync,removeRoot=root=>rm(root,{recursive:true,force:true})},smoke){
 let temporaryRoot,stage='consumer-smoke-contract',failure;
 const receipt={schemaVersion:1,artifactKind:'candidate-package-acceptance',...expected,result:'failed',platform:process.platform+'/'+(process.arch==='x64'?'amd64':process.arch),node:process.version,offline,policy:{...installPolicy},archiveVerified:false,lockedRoot:{result:'not-run'},consumer:{result:'not-run'},existingConsumerSmoke:{result:'not-run'},cleanup:{result:'not-run',ownedTemporaryRoots:0},releaseComplete:false};
 try{
  if(typeof smoke!=='function'){const error=Error('Explicit consumer smoke callback required');error.code='candidate-consumer-smoke-required';throw error;}
  stage='archive-validation';
  const manifestBytes=await readFile(manifestPath),manifest=validateCandidateManifest(JSON.parse(manifestBytes),expected);
  const archive=await readCandidateArchive(archivePath);
  await verifyCandidateArchive(archive,manifest,expected);
  await verifyCandidateCommittedLocks(manifest,sourceRoot);
  if(manifest.files.some(file=>file.path.split('/').at(-1)==='.npmrc'))throw Error('Packaged project npm configuration is not permitted');
  await noProjectNpmrc(sourceRoot);
  Object.assign(receipt,{manifestSha256:hash(manifestBytes),packageSha256:hash(archive),filesVerified:manifest.files.length,committedLocks:manifest.committedLocks,archiveVerified:true});
  temporaryRoot=await mkdtemp(join(tmpdir(),'agentci-candidate-acceptance-'));
  const extracted=join(temporaryRoot,'extracted');await mkdir(extracted,{mode:0o700});
  const {packageRoot:lockedRoot}=await extractCandidateArchive(archive,manifest,extracted,expected);
  await noProjectNpmrc(lockedRoot);
  const lockedEnv=await createNpmEnvironment(join(temporaryRoot,'locked-npm'),process.env.PATH);
  const consumerEnv=await createNpmEnvironment(join(temporaryRoot,'consumer-npm'),process.env.PATH);
  const run=(command,args,options={})=>runCommand(command,args,{encoding:'utf8',timeout:300000,maxBuffer:8*1024*1024,stdio:'pipe',...options});
  stage='npm-policy';
  if(run('npm',['--version'],{cwd:lockedRoot,env:lockedEnv}).trim()!==installPolicy.npm)throw Error('Pinned candidate npm required');
  const flags=[...(offline?['--offline']:[]),...npmFlags];
  stage='locked-root-install';
  receipt.lockedRoot={result:'failed',command:'npm ci',flags,filesVerifiedBefore:manifest.files.length};
  await verifyInstalledCandidateFiles(lockedRoot,manifest);
  run('npm',['ci',...flags],{cwd:lockedRoot,env:lockedEnv});
  await verifyInstalledCandidateFiles(lockedRoot,manifest);await noDevelopmentLoader(lockedRoot);
  stage='locked-root-probes';candidateProbes(lockedRoot,lockedRoot,manifest.version,lockedEnv,run);
  receipt.lockedRoot={...receipt.lockedRoot,result:'passed',filesVerifiedAfter:manifest.files.length,developmentLoaderInstalled:false,cliVersion:manifest.version,publicClient:true,providerImports:['openai','anthropic','xai']};
  stage='consumer-install';
  const consumerRoot=join(temporaryRoot,'consumer');await mkdir(consumerRoot,{mode:0o700});
  await noProjectNpmrc(consumerRoot);
  receipt.consumer={result:'failed',command:'npm install',flags};
  const ownedArchive=join(temporaryRoot,manifest.package.name);await writeFile(ownedArchive,archive,{flag:'wx'});
  run('npm',['install',...flags,'--prefix',consumerRoot,ownedArchive],{cwd:consumerRoot,env:consumerEnv});
  const installedRoot=join(consumerRoot,'node_modules/agentci');
  await verifyInstalledCandidateFiles(installedRoot,manifest);await noDevelopmentLoader(consumerRoot);
  stage='consumer-probes';candidateProbes(installedRoot,consumerRoot,manifest.version,consumerEnv,run);
  receipt.consumer={...receipt.consumer,result:'passed',filesVerifiedAfter:manifest.files.length,developmentLoaderInstalled:false,cliVersion:manifest.version,publicClient:true,providerImports:['openai','anthropic','xai'],packagedLocksDoNotEstablishConsumerResolution:true};
  stage='existing-consumer-smoke';receipt.existingConsumerSmoke={result:'failed'};
  await smoke({consumerRoot,installedRoot,lockedRoot,manifest,env:consumerEnv});
  await verifyInstalledCandidateFiles(lockedRoot,manifest);await verifyInstalledCandidateFiles(installedRoot,manifest);
  receipt.existingConsumerSmoke={result:'passed'};
 }catch(error){
  failure={stage,code:['candidate-archive-input-rejected','candidate-consumer-smoke-required'].includes(error.code)?error.code:'candidate-package-acceptance-failed',exitCode:Number.isInteger(error.status)?error.status:null,signal:typeof error.signal==='string'&&/^SIG[A-Z]+$/.test(error.signal)?error.signal:null};
 }finally{
  if(temporaryRoot){
   try{await removeRoot(temporaryRoot);try{await lstat(temporaryRoot);throw Error('Owned candidate root remains');}catch(error){if(error.code!=='ENOENT')throw error;}receipt.cleanup={result:'passed',ownedTemporaryRoots:0};}
   catch{receipt.cleanup={result:'failed',ownedTemporaryRoots:null};failure??={stage:'cleanup',code:'candidate-package-cleanup-failed',exitCode:null,signal:null};}
  }else receipt.cleanup={result:'passed',ownedTemporaryRoots:0};
  if(!failure)receipt.result='passed';else receipt.failure=failure;
  await mkdir(dirname(resolve(receiptPath)),{recursive:true});
  await writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
 }
 if(failure){const error=Error('Candidate package acceptance failed at '+failure.stage+'; retained failure and cleanup receipt');error.code=failure.code;throw error;}
 return receipt;
}

export function validateCandidateAcceptance(receipt,manifest,{manifestSha256,packageSha256,...expected},platform=process.platform+'/'+(process.arch==='x64'?'amd64':process.arch)){
 validateCandidateManifest(manifest,expected);
 if(receipt?.schemaVersion!==1||receipt.artifactKind!=='candidate-package-acceptance'||receipt.result!=='passed'||receipt.releaseComplete!==false||receipt.platform!==platform||receipt.node!==process.version||typeof receipt.offline!=='boolean'||receipt.archiveVerified!==true||receipt.packageSha256!==packageSha256||receipt.manifestSha256!==manifestSha256||receipt.filesVerified!==manifest.files.length||JSON.stringify(receipt.committedLocks)!==JSON.stringify(manifest.committedLocks)||JSON.stringify(receipt.policy)!==JSON.stringify(installPolicy)||receipt.cleanup?.result!=='passed'||receipt.cleanup.ownedTemporaryRoots!==0||receipt.existingConsumerSmoke?.result!=='passed')throw Error('Missing current candidate package acceptance');
 for(const key of identityKeys)if(receipt[key]!==expected[key])throw Error('Candidate acceptance source or cohort mismatch');
 for(const [name,command] of [['lockedRoot','npm ci'],['consumer','npm install']]){
  const proof=receipt[name],flags=[...(receipt.offline?['--offline']:[]),...npmFlags];
  if(proof?.result!=='passed'||proof.command!==command||JSON.stringify(proof.flags)!==JSON.stringify(flags)||proof.filesVerifiedAfter!==manifest.files.length||proof.developmentLoaderInstalled!==false||proof.cliVersion!==manifest.version||proof.publicClient!==true||JSON.stringify(proof.providerImports)!==JSON.stringify(['openai','anthropic','xai']))throw Error('Missing distinct candidate production install proof');
 }
 if(receipt.lockedRoot.filesVerifiedBefore!==manifest.files.length||receipt.consumer.packagedLocksDoNotEstablishConsumerResolution!==true)throw Error('Candidate install qualification missing');
 return receipt;
}

export async function loadCandidatePackageAcceptance({root=process.cwd(),expected,manifestPath=CANDIDATE_MANIFEST_PATH,receiptPath=CANDIDATE_ACCEPTANCE_PATH,platform}={}){
 const manifestBytes=await readFile(resolve(root,manifestPath)),manifest=validateCandidateManifest(JSON.parse(manifestBytes),expected);
 const archivePath=join(dirname(manifestPath),manifest.package.name),archive=await readCandidateArchive(resolve(root,archivePath));
 await verifyCandidateArchive(archive,manifest,expected);await verifyCandidateCommittedLocks(manifest,root);
 const receiptBytes=await readFile(resolve(root,receiptPath)),receipt=validateCandidateAcceptance(JSON.parse(receiptBytes),manifest,{...expected,manifestSha256:hash(manifestBytes),packageSha256:hash(archive)},platform);
 return {receipt,manifest,artifacts:[{path:manifestPath,sha256:hash(manifestBytes)},{path:receiptPath,sha256:hash(receiptBytes)}]};
}
