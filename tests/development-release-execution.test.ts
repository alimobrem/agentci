import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,copyFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
// @ts-expect-error operational ESM helper
import {hash,normalizePackOutput} from '../scripts/lib/development-artifacts.mjs';
const version='0.4.0-m3-dev.2',roles=['api','worker','eval-worker','eval-runner','eval-engines','eval-agentci'];
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'agentci-release-execution-'));
 const put=async(path:string,value:string|Buffer)=>{await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),value);};
 const json=async(path:string,value:any)=>put(path,JSON.stringify(value,null,2)+'\n');
 for(const file of ['development-release.mjs','download-integration-reporter.mjs','image-publication.mjs','native-publication.mjs','lib/development-artifacts.mjs']){await mkdir(dirname(join(root,'scripts',file)),{recursive:true});await copyFile(join('scripts',file),join(root,'scripts',file));}
 await symlink(resolve('node_modules'),join(root,'node_modules'),'dir');
 await json('package.json',{name:'agentci',version,type:'module',files:['dist','npm-shrinkwrap.json']});
 const lock={name:'agentci',version,lockfileVersion:3,packages:{'':{name:'agentci',version}}};
 await json('package-lock.json',lock);await json('npm-shrinkwrap.json',lock);
 await json('releases/m3-development-candidate.json',{schemaVersion:1,version,repository:'alimobrem/agentci',publication:'approved-development-candidate'});
 await put('dist/cmd/agentci/main.js',`console.log('${version}');\n`);await put('dist/packages/version.js',`export const VERSION='${version}';\n`);
 await put('tests/integration/probe.test.ts','export {};\n');
 execFileSync('git',['init','--quiet'],{cwd:root});execFileSync('git',['add','package.json'],{cwd:root});execFileSync('git',['-c','user.name=Synthetic acceptance','-c','user.email=synthetic@example.invalid','commit','--quiet','-m','Synthetic source'],{cwd:root});
 const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),expected={version,sourceCommit,runId:'123',attempt:'1'};
 const env={PATH:process.env.PATH,HOME:root,GITHUB_REPOSITORY:'alimobrem/agentci',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',GITHUB_SHA:sourceCommit,GITHUB_WORKFLOW_SHA:sourceCommit,GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',GITHUB_OUTPUT:join(root,'outputs'),GITHUB_TOKEN:'sentinel-no-real-credential'};
 await put('preload.mjs',`import {appendFileSync} from 'node:fs';globalThis.fetch=async(url,options={})=>{appendFileSync('rest.jsonl',JSON.stringify({method:options.method??'GET',url:String(url)})+'\\n');if(process.env.MOCK_RELEASE_MODE==='partial'){const method=options.method??'GET';if(method==='GET')return new Response('{}',{status:404,headers:{'content-type':'application/json'}});if(String(url).includes('uploads.github.com')&&String(url).includes('name=package-manifest.json'))return new Response(JSON.stringify({message:'sentinel-no-real-credential'}),{status:400,headers:{'content-type':'application/json'}});return new Response(JSON.stringify({id:101,draft:false,prerelease:true}),{status:201,headers:{'content-type':'application/json'}});}return new Response(JSON.stringify(String(url).includes('/git/ref/')?{object:{type:'commit',sha:process.env.GITHUB_SHA}}:{id:101,draft:false,prerelease:true}),{status:200,headers:{'content-type':'application/json'}});};\n`);
 const execute=(command:string,extra:any={})=>spawnSync(process.execPath,['--import',join(root,'preload.mjs'),'scripts/development-release.mjs',command],{cwd:root,env:{...env,...extra},encoding:'utf8',timeout:60000});
 for(const role of roles){
  const receipts=[];
  for(const [index,arch] of ['amd64','arm64'].entries()){
   const receipt:any={...expected,role,arch,result:'passed',buildDigest:'sha256:'+(index?'b':'c').repeat(64),manifestDigest:'sha256:'+(index?'d':'e').repeat(64),configDigest:'sha256:'+'f'.repeat(64)};
   const inspect=[{Os:'linux',Architecture:arch,Id:receipt.configDigest,Config:{Labels:{'org.opencontainers.image.revision':sourceCommit,'org.opencontainers.image.version':version,'org.opencontainers.image.source':'https://github.com/alimobrem/agentci'}}}];
   const reference=`ghcr.io/alimobrem/agentci-${role}@${receipt.manifestDigest}`;
   const scan={ArtifactType:'container_image',ArtifactName:reference,Metadata:{ImageID:receipt.configDigest,ImageConfig:{architecture:arch,os:'linux'},RepoDigests:[reference]},Results:[{Vulnerabilities:[]}]};
   for(const [suffix,value] of [['inspect',inspect],['scan',scan]] as const){const bytes=JSON.stringify(value,null,2)+'\n';await put(`published/${role}-${arch}-${suffix}.json`,bytes);receipt[suffix+'Sha256']=hash(bytes);}
   receipt.nativeSha256=null;
   if(['worker','eval-worker'].includes(role)){const bytes=JSON.stringify({platform:'linux/'+arch,image:receipt.configDigest,temporalNativeArtifacts:true,files:{'native.node':'bound'}})+'\n';await put(`published/${role}-${arch}-native.json`,bytes);receipt.nativeSha256=hash(bytes);}
   await json(`published/${role}-${arch}-receipt.json`,receipt);receipts.push(receipt);
  }
  const index=JSON.stringify({schemaVersion:2,mediaType:'application/vnd.oci.image.index.v1+json',manifests:receipts.map(r=>({mediaType:'application/vnd.oci.image.manifest.v1+json',digest:r.manifestDigest,size:100,platform:{os:'linux',architecture:r.arch}}))});
  await put(`published/${role}-index.json`,index);
  await json(`published/${role}-identity.json`,{...expected,role,image:`ghcr.io/alimobrem/agentci-${role}@sha256:${hash(index)}`,platforms:['linux/amd64','linux/arm64']});
  await json(`published/${role}-native-acceptance.json`,{...expected,role,result:'passed',receipts});
 }
 return {root,put,json,execute,expected};
}
test('actual pinned npm pack assembly restores both locks and binds final archive bytes',async()=>{
 const f=await fixture();try{
  const result=f.execute('assemble');assert.equal(result.status,0,result.stderr);
  const manifest=JSON.parse(await readFile(join(f.root,'development-assets/package-manifest.json'),'utf8'));
  const archive=await readFile(join(f.root,'development-assets',manifest.package.name));assert.equal(hash(archive),manifest.package.sha256);
  const names=execFileSync('tar',['-tzf',join(f.root,'development-assets',manifest.package.name)],{encoding:'utf8'}).trim().split('\n');
  assert.equal(names.length,manifest.files.length);for(const path of ['package-lock.json','npm-shrinkwrap.json','dist/release-source.json'])assert.ok(names.includes('package/'+path));
  assert.equal(manifest.runId,'123');assert.equal(manifest.attempt,'1');
  const legacy={name:'agentci',version,filename:`agentci-${version}.tgz`,files:[{path:'package.json'}]};
  assert.deepEqual(normalizePackOutput([legacy],version),legacy);assert.deepEqual(normalizePackOutput({agentci:legacy},version),legacy);
  assert.throws(()=>normalizePackOutput({one:legacy,two:legacy},version));assert.throws(()=>normalizePackOutput({agentci:{...legacy,files:[{path:'../escape'}]}},version));
 }finally{await rm(f.root,{recursive:true,force:true});}
});
test('actual finalizer rejects corrupt package/native cohorts before REST writes and retains valid evidence',async()=>{
 const f=await fixture();try{
  assert.equal(f.execute('assemble').status,0);
  const manifestBytes=await readFile(join(f.root,'development-assets/package-manifest.json')),manifest=JSON.parse(manifestBytes.toString());
  const images=JSON.parse(await readFile(join(f.root,'development-assets/images.json'),'utf8'));
  const counts={tests:1,passed:1,failed:0,skipped:0,cancelled:0,todo:0},file=join(f.root,'tests/integration/probe.test.ts');
  for(const arch of ['amd64','arm64']){
   await f.json(`verified/package-${arch}.json`,{result:'passed',...f.expected,platform:'linux/'+arch,anonymous:true,productionOnly:true,lockedRootInstall:true,consumerInstall:true,packageSha256:manifest.package.sha256,manifestSha256:hash(manifestBytes),publicationRunId:'123',publicationAttempt:'1',verificationRunId:'123',verificationAttempt:'1',filesVerified:manifest.files.length});
   await f.json(`verified/${arch}/downloaded-identities.json`,{...f.expected,platform:'linux/'+arch,anonymous:true,images:images.images.map((i:any)=>({...i,...f.expected,platform:'linux/'+arch}))});
   await f.json(`verified/${arch}/downloaded-integration.json`,{...f.expected,acceptanceCommit:f.expected.sourceCommit,inputs:[{file,sha256:hash(await readFile(file))}],summaries:[{success:true,file,counts},{success:true,counts}]});
  }
  const paths=['verified/package-amd64.json','development-assets/package-manifest.json','development-assets/images.json','development-assets/publication-evidence/api-amd64-scan.json','verified/arm64/downloaded-integration.json'];
  for(const path of paths){
   const original=await readFile(join(f.root,path)),changed=JSON.parse(original.toString());
   if(path.includes('package-amd64'))changed.packageSha256='0'.repeat(64);
   else if(path.includes('package-manifest'))changed.runId='999';
   else if(path.endsWith('images.json'))changed.attempt='99';
   else if(path.includes('scan'))changed.Results=[{Vulnerabilities:[{Severity:'CRITICAL',FixedVersion:'1'}]}];
   else changed.attempt='99';
   await f.json(path,changed);await rm(join(f.root,'rest.jsonl'),{force:true});
   const result=f.execute('finalize');assert.equal(result.status,1,path);assert.ok(!result.stderr.includes('sentinel-no-real-credential'));
   await assert.rejects(readFile(join(f.root,'rest.jsonl')),{code:'ENOENT'});
   await f.put(path,original);
  }
  const archive=join(f.root,'development-assets',manifest.package.name),originalArchive=await readFile(archive);await writeFile(archive,'corrupt');assert.equal(f.execute('finalize').status,1);await writeFile(archive,originalArchive);
  const passed=f.execute('finalize',{GITHUB_RUN_ATTEMPT:'2'});assert.equal(passed.status,0,passed.stderr);
  const requests=(await readFile(join(f.root,'rest.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line));assert.equal(requests.filter(r=>r.method==='POST').length,3);assert.equal(requests.at(-1).method,'PATCH');
  const acceptance=JSON.parse(await readFile(join(f.root,'verified/native-download-acceptance.json'),'utf8'));assert.equal(acceptance.publicationAttempt,'1');assert.equal(acceptance.verificationAttempt,'2');assert.equal(acceptance.nativeRecords.length,2);
 }finally{await rm(f.root,{recursive:true,force:true});}
});

test('actual partial release upload retains successful asset hashes and refuses occupied retry',async()=>{
 const f=await fixture();try{
  assert.equal(f.execute('assemble').status,0);
  const partial=f.execute('publish',{MOCK_RELEASE_MODE:'partial'});assert.equal(partial.status,1);assert.ok(!partial.stderr.includes('sentinel-no-real-credential'));
  const record=JSON.parse(await readFile(join(f.root,'development-assets/publication-attempt.json'),'utf8'));
  assert.equal(record.result,'failed');assert.equal(record.releaseId,101);assert.equal(record.uploadedAssets.length,1);assert.equal(record.uploadedAssets[0].name,`agentci-${version}.tgz`);
  assert.equal(record.uploadedAssets[0].sha256,hash(await readFile(join(f.root,'development-assets',record.uploadedAssets[0].name))));
  await rm(join(f.root,'rest.jsonl'),{force:true});assert.equal(f.execute('publish').status,1);
  const retry=(await readFile(join(f.root,'rest.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line));assert.ok(retry.every(r=>r.method==='GET'));
 }finally{await rm(f.root,{recursive:true,force:true});}
});
