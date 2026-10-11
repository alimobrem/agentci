import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {candidateIdentity,hash,validatePackageManifest,sanitizedPackageEnvironment} from './lib/development-artifacts.mjs';

export async function verifyPackageFiles(root,manifest){
 for(const file of manifest.files)if(hash(await readFile(join(root,file.path)))!==file.sha256)throw Error('Downloaded package file differs from source manifest');
 const package_ = JSON.parse(await readFile(join(root,'package.json'))),source=JSON.parse(await readFile(join(root,'dist/release-source.json')));
 if(package_.name!=='agentci'||package_.version!==manifest.version||source.sourceCommit!==manifest.sourceCommit||source.version!==manifest.version||source.schemaVersion!==1)throw Error('Downloaded package source/version mismatch');
}
export async function anonymousDownload(url,sha256,limit,request=fetch){
 if(!/^[a-f0-9]{64}$/.test(sha256))throw Error('Pinned download checksum required');
 const response=await request(url,{headers:{accept:'application/octet-stream'},redirect:'follow',signal:AbortSignal.timeout(60000)});
 if(!response.ok||!response.body||Number(response.headers.get('content-length')??0)>limit)throw Error('Public asset unavailable or oversized');
 const chunks=[];let length=0;
 for await(const chunk of response.body){length+=chunk.length;if(length>limit)throw Error('Public asset oversized');chunks.push(chunk);}
 const bytes=Buffer.concat(chunks);if(hash(bytes)!==sha256)throw Error('Public asset checksum mismatch');return bytes;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 let root;
 try{
  const version=process.env.RELEASE_VERSION,sourceCommit=process.env.RELEASE_SOURCE,arch=process.env.RELEASE_ARCH;
  candidateIdentity(version,sourceCommit);
  if(process.platform!=='linux'||arch!==(process.arch==='x64'?'amd64':process.arch))throw Error('Actual native Linux package host required');
  const base=`https://github.com/alimobrem/agentci/releases/download/v${version}/`;
  const manifestBytes=await anonymousDownload(base+'package-manifest.json',process.env.PACKAGE_MANIFEST_SHA256,8*1024*1024);
  const manifest=validatePackageManifest(JSON.parse(manifestBytes),{version,sourceCommit});
  if(manifest.package.sha256!==process.env.PACKAGE_SHA256)throw Error('Manifest/package checksum binding mismatch');
  const archive=await anonymousDownload(base+manifest.package.name,manifest.package.sha256,64*1024*1024);
  root=await mkdtemp(join(tmpdir(),'agentci-anonymous-package-'));
  const env=sanitizedPackageEnvironment(root,process.env.PATH);
  await writeFile(join(root,'empty.npmrc'),'');await writeFile(join(root,'empty-global.npmrc'),'');
  const archivePath=join(root,manifest.package.name);await writeFile(archivePath,archive);
  const run=(command,args,options={})=>execFileSync(command,args,{env,encoding:'utf8',timeout:300000,maxBuffer:8*1024*1024,stdio:'pipe',...options});
  const paths=run('tar',['-tzf',archivePath]).trim().split('\n');
  if(paths.length!==manifest.files.length||new Set(paths).size!==paths.length||paths.some(path=>!manifest.files.some(file=>'package/'+file.path===path)))throw Error('Archive paths differ from source-bound file manifest');
  if(run('tar',['-tvzf',archivePath]).trim().split('\n').some(line=>line[0]!=='-'))throw Error('Package archive contains nonregular entries');
  const extracted=join(root,'extracted');await mkdir(extracted);
  run('tar',['-xzf',archivePath,'--no-same-owner','--no-same-permissions','-C',extracted]);
  await verifyPackageFiles(join(extracted,'package'),manifest);
  // Only after public bytes, source, version and files match may npm execute.
  // npm12 ignores packaged shrinkwrap in consumer installs; prove a separate
  // production root install from the verified equivalent package-lock first.
  const locked=join(extracted,'package');
  run('npm',['ci','--omit=dev','--no-audit','--no-fund'],{cwd:locked});
  await verifyPackageFiles(locked,manifest);
  await writeFile(join(locked,'probe.mjs'),"import {ModelReviewClient,AgentCIError} from 'agentci/client';if(typeof ModelReviewClient!=='function'||typeof AgentCIError!=='function')throw Error('Locked client missing');\n");
  run(process.execPath,[join(locked,'probe.mjs')]);
  for(const name of ['openai','anthropic','xai'])run(process.execPath,['--input-type=module','-e','await import('+JSON.stringify(pathToFileURL(join(locked,'dist/packages/providers/'+name+'.js')).href)+');']);
  if(run(process.execPath,[join(locked,'dist/cmd/agentci/main.js'),'--version']).trim()!==version)throw Error('Locked production CLI version mismatch');
  try{await readFile(join(locked,'node_modules/tsx/package.json'));throw Error('Development loader entered locked production install');}catch(error){if(error.code!=='ENOENT')throw error;}

  const install=join(root,'install');run('npm',['install','--omit=dev','--no-audit','--no-fund','--prefix',install,archivePath]);
  const installed=join(install,'node_modules/agentci');await verifyPackageFiles(installed,manifest);
  try{await readFile(join(install,'node_modules/tsx/package.json'));throw Error('Development loader entered production install');}catch(error){if(error.code!=='ENOENT')throw error;}
  if(run(join(install,'node_modules/.bin/agentci'),['--version']).trim()!==version)throw Error('Installed CLI version mismatch');
  const probe=join(install,'probe.mjs');await writeFile(probe,"import {ModelReviewClient,AgentCIError} from 'agentci/client';if(typeof ModelReviewClient!=='function'||typeof AgentCIError!=='function')throw Error('Public client missing');\n");
  run(process.execPath,[probe]);
  for(const name of ['openai','anthropic','xai']){
   const module=join(installed,'dist/packages/providers/'+name+'.js');
   run(process.execPath,['--input-type=module','-e','await import('+JSON.stringify(pathToFileURL(module).href)+');']);
  }
  const receipt={publicationRunId:manifest.runId,publicationAttempt:manifest.attempt,verificationRunId:process.env.GITHUB_RUN_ID,verificationAttempt:process.env.GITHUB_RUN_ATTEMPT,result:'passed',version,sourceCommit,platform:'linux/'+arch,anonymous:true,productionOnly:true,lockedRootInstall:true,consumerInstall:true,packageSha256:hash(archive),manifestSha256:hash(manifestBytes),filesVerified:manifest.files.length,node:process.version};
  await writeFile('package-'+arch+'.json',JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify(receipt));
 }catch{
  console.error('Anonymous package validation failed; no install/download acceptance claimed.');process.exitCode=1;
 }finally{if(root)await rm(root,{recursive:true,force:true});}
}
