import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,copyFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
// @ts-expect-error operational ESM helper
import {hash,normalizePackOutput} from '../scripts/lib/development-artifacts.mjs';
const version='0.4.0-m3-dev.3',roles=['api','worker','eval-worker','eval-runner','eval-engines','eval-agentci'];
async function fixture(workflowContents='write'){
 const root=await mkdtemp(join(tmpdir(),'agentci-release-execution-'));
 const put=async(path:string,value:string|Buffer)=>{await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),value);};
 const json=async(path:string,value:any)=>put(path,JSON.stringify(value,null,2)+'\n');
 for(const file of ['development-release.mjs','download-integration-reporter.mjs','image-publication.mjs','native-publication.mjs','lib/development-artifacts.mjs','lib/immutable-release-publication.mjs','lib/download-runtime-evidence.mjs','record-download-runtime.mjs']){await mkdir(dirname(join(root,'scripts',file)),{recursive:true});await copyFile(join('scripts',file),join(root,'scripts',file));}
 await symlink(resolve('node_modules'),join(root,'node_modules'),'dir');
 await put('.github/workflows/development-candidate.yaml',(await readFile('.github/workflows/development-candidate.yaml','utf8')).replaceAll('contents: write','contents: '+workflowContents));
 await json('package.json',{name:'agentci',version,type:'module',files:['dist','npm-shrinkwrap.json']});
 const lock={name:'agentci',version,lockfileVersion:3,packages:{'':{name:'agentci',version}}};
 await json('package-lock.json',lock);await json('npm-shrinkwrap.json',lock);
 await json('releases/m3-development-candidate.json',{schemaVersion:1,version,repository:'alimobrem/agentci',publication:'approved-development-candidate'});
 await put('dist/cmd/agentci/main.js',`console.log('${version}');\n`);await put('dist/packages/version.js',`export const VERSION='${version}';\n`);
 for(const file of ['deploy/security/native-components.json','deploy/engines/patches/forge-backport.json','deploy/engines/patches/verify-forge-backport.cjs','deploy/engines/patches/forge-nested-digest-fixture.json','deploy/licenses/docker-cli-LICENSE'])await put(file,await readFile(file));
 await put('tests/integration/probe.test.ts','export {};\n');
 execFileSync('git',['init','--quiet'],{cwd:root});execFileSync('git',['add','package.json','.github/workflows/development-candidate.yaml'],{cwd:root});execFileSync('git',['-c','user.name=Synthetic acceptance','-c','user.email=synthetic@example.invalid','commit','--quiet','-m','Synthetic source'],{cwd:root});
 const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),expected={version,sourceCommit,runId:'123',attempt:'1'};
 const env={PATH:process.env.PATH,HOME:root,GITHUB_ACTIONS:'true',GITHUB_WORKFLOW_REF:'alimobrem/agentci/.github/workflows/development-candidate.yaml@refs/heads/main',GITHUB_REPOSITORY:'alimobrem/agentci',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',GITHUB_SHA:sourceCommit,GITHUB_WORKFLOW_SHA:sourceCommit,GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',GITHUB_OUTPUT:join(root,'outputs'),GITHUB_TOKEN:'sentinel-no-real-credential'};
 await put('preload.mjs',`import {appendFileSync,existsSync,writeFileSync,readFileSync} from 'node:fs';import {createHash} from 'node:crypto';globalThis.fetch=async(url,options={})=>{const method=options.method??'GET',u=String(url),body=typeof options.body==='string'?JSON.parse(options.body):null;appendFileSync('rest.jsonl',JSON.stringify({method,url:u,body})+'\\n');const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});const exists=existsSync('mock-release-created'),release=exists?JSON.parse(readFileSync('mock-release-created')):{id:101,draft:false,prerelease:true,immutable:true};if(method==='GET'&&new URL(u).pathname==='/repos/alimobrem/agentci')return response({full_name:'alimobrem/agentci'});if(method==='GET'&&new URL(u).pathname.endsWith('/releases')&&new URL(u).searchParams.has('page'))return response(exists?[release]:[]);if(method==='GET'&&u.includes('/git/ref/')){const count=existsSync('mock-tag-reads')?Number(readFileSync('mock-tag-reads'))+1:1;writeFileSync('mock-tag-reads',String(count));if(process.env.MOCK_TAG_RACE==='before-publish'&&count>=4||process.env.MOCK_TAG_RACE==='after-publish'&&existsSync('mock-release-published'))return response({object:{type:'commit',sha:'f'.repeat(40)}});if(release.draft||!exists&&process.env.MOCK_RELEASE_MODE)return response({},404);return response({object:{type:'commit',sha:process.env.GITHUB_SHA}});}if(method==='GET'&&release.draft&&u.includes('/releases/tags/'))return response({},404);if(method==='GET'&&u.includes('/actions/artifacts/'))return response({id:303,name:'final-native-download-evidence-123-2',digest:'sha256:'+'a'.repeat(64),expired:false,size_in_bytes:100,expires_at:'2027-01-01T00:00:00Z',workflow_run:{id:123,head_sha:process.env.GITHUB_SHA}});if(method==='GET'&&u.endsWith('/assets?per_page=100'))return response(existsSync('mock-assets')?JSON.parse(readFileSync('mock-assets')):process.env.MOCK_RELEASE_MODE?[]:['agentci-0.4.0-m3-dev.3.tgz','package-manifest.json','images.json','publication-evidence.tgz','SHA256SUMS'].map(name=>{const bytes=readFileSync('development-assets/'+name);return {name,state:'uploaded',size:bytes.length,digest:'sha256:'+createHash('sha256').update(bytes).digest('hex')};}));if(method==='GET'&&!exists&&process.env.MOCK_RELEASE_MODE)return response({},404);if(method==='POST'&&u.endsWith('/releases')){const created={id:101,...body};writeFileSync('mock-release-created',JSON.stringify(created));if(process.env.MOCK_RELEASE_MODE==='lost-create')return response({message:'lost acknowledgement'},504);return response(created,201);}if(u.includes('uploads.github.com')){if(existsSync('mock-release-published'))return response({message:'Cannot upload assets to immutable release'},422);if(process.env.MOCK_RELEASE_MODE==='partial'&&u.includes('name=package-manifest.json'))return response({message:'sentinel-no-real-credential'},422);const assets=existsSync('mock-assets')?JSON.parse(readFileSync('mock-assets')):[],asset={id:201,name:new URL(u).searchParams.get('name'),state:'uploaded',size:options.body.length,digest:'sha256:'+createHash('sha256').update(options.body).digest('hex')};assets.push(asset);writeFileSync('mock-assets',JSON.stringify(assets));return response(asset,201);}if(method==='PATCH'){if(body.draft===false)writeFileSync('mock-release-published','published');const updated={...release,...body};writeFileSync('mock-release-created',JSON.stringify(updated));if(body.draft===false&&process.env.MOCK_RELEASE_MODE==='lost-publish')return response({message:'lost publish acknowledgement'},504);return response(updated);}return response(u.includes('/git/ref/')?{object:{type:'commit',sha:process.env.GITHUB_SHA}}:release);};\n`);
 const execute=(command:string,extra:any={})=>spawnSync(process.execPath,['--import',join(root,'preload.mjs'),'scripts/development-release.mjs',command],{cwd:root,env:{...env,GITHUB_JOB:command==='preflight'?'preflight':'release-candidate',...extra},encoding:'utf8',timeout:60000});
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
test('customer asset preparation crosses the real publication validator with all four pinned checksums',async()=>{
 // @ts-expect-error operational ESM helper
 const {customerPublicationAssets}=await import('../scripts/lib/customer-publication-assets.mjs');
 // @ts-expect-error operational ESM helper
 const {validateDevelopmentAssets}=await import('../scripts/lib/development-artifacts.mjs');
 const f=await fixture();try{
  assert.equal(f.execute('assemble').status,0);
  const original=join(f.root,'development-assets'),manifestBytes=await readFile(join(original,'package-manifest.json')),manifest=JSON.parse(manifestBytes.toString());
  const archive=await readFile(join(original,manifest.package.name)),images=await readFile(join(original,'images.json')),publication=await readFile(join(original,'publication-evidence.tgz'));
  // Reproduce the old live-demo integration failure, then exercise its actual replacement.
  await rm(join(original,'SHA256SUMS'));
  await assert.rejects(validateDevelopmentAssets(original,f.expected),{code:'ENOENT'});
  const input={releaseSource:f.expected.sourceCommit,packageManifestSha256:hash(manifestBytes),packageSha256:hash(archive),imagesManifestSha256:hash(images),publicationEvidenceSha256:hash(publication)};
  const temporaryRoot=join(f.root,'customer');await mkdir(temporaryRoot);
  const prepared={temporaryRoot,manifest,manifestBytes,archive};let requests=0;
  const request=async(url:string,options:any)=>{requests++;assert.deepEqual(options.headers,{accept:'application/octet-stream'});return new Response(url.endsWith('images.json')?images:publication);};
  const result=await customerPublicationAssets(prepared,input,request);
  assert.equal(requests,2);assert.equal(result.trusted.images.length,6);assert.equal(result.trusted.cohort.sourceCommit,f.expected.sourceCommit);
  const names=[manifest.package.name,'package-manifest.json','images.json','publication-evidence.tgz'];
  assert.equal(await readFile(join(temporaryRoot,'development-assets/SHA256SUMS'),'utf8'),(await Promise.all(names.map(async name=>`${hash(await readFile(join(temporaryRoot,'development-assets',name)))}  ${name}\n`))).join(''));
  await assert.rejects(customerPublicationAssets({...prepared,temporaryRoot:join(f.root,'bad-package')},{...input,packageSha256:'0'.repeat(64)},request),/checksum mismatch/);
  await assert.rejects(customerPublicationAssets({...prepared,temporaryRoot:join(f.root,'bad-publication')},{...input,publicationEvidenceSha256:'0'.repeat(64)},request),/checksum mismatch/);
 }finally{await rm(f.root,{recursive:true,force:true});}
});
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
   await f.json(`verified/${arch}/downloaded-identities.json`,{...f.expected,platform:'linux/'+arch,anonymous:true,images:images.images.map((i:any)=>({...i,...f.expected,localImageId:'sha256:'+'f'.repeat(64),platform:'linux/'+arch}))});
   await f.json(`verified/${arch}/downloaded-integration.json`,{...f.expected,acceptanceCommit:f.expected.sourceCommit,inputs:[{file,sha256:hash(await readFile(file))}],summaries:[{success:true,file,counts},{success:true,counts}]});
  }
  await addRuntimeProofs(f);
  // Exercise the actual trusted-harness producer envelope, not just handcrafted
  // finalizer fixtures, against complete real producer-shaped raw JSON.
  const identity=await readFile(join(f.root,'verified/amd64/downloaded-identities.json'));await f.put('downloaded-identities.json',identity);
  const proofNames=['downloaded-image-smoke.json','downloaded-eval-worker-smoke.json','downloaded-worker-native.json','downloaded-eval-worker-native.json','downloaded-forge-backport.json'];
  for(const name of proofNames){const {acceptance,...raw}=JSON.parse(await readFile(join(f.root,'verified/amd64',name),'utf8'));await f.json(name,raw);}
  const producer=spawnSync(process.execPath,['scripts/record-download-runtime.mjs'],{cwd:f.root,env:{PATH:process.env.PATH,RELEASE_SOURCE:f.expected.sourceCommit,RELEASE_VERSION:version,RELEASE_ARCH:'amd64',ACCEPTANCE_SOURCE:f.expected.sourceCommit,GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1'},encoding:'utf8'});assert.equal(producer.status,0,producer.stderr);
  for(const name of proofNames){const result=JSON.parse(await readFile(join(f.root,name),'utf8'));assert.equal(result.acceptance.file,name);assert.equal(result.acceptance.identitiesSha256,hash(identity));}
  const rejectBeforeREST=async(command='finalize')=>{await rm(join(f.root,'rest.jsonl'),{force:true});const result=f.execute(command);assert.equal(result.status,1,result.stderr);await assert.rejects(readFile(join(f.root,'rest.jsonl')),{code:'ENOENT'});};
  // Every mandatory proof is required on both native platforms. A rewritten
  // envelope checksum cannot hide wrong actual runtime identities or assertions.
  const runtimeFiles=['downloaded-image-smoke.json','downloaded-eval-worker-smoke.json','downloaded-worker-native.json','downloaded-eval-worker-native.json','downloaded-forge-backport.json'];
  for(const arch of ['amd64','arm64'])for(const name of runtimeFiles){const path=`verified/${arch}/${name}`,original=await readFile(join(f.root,path));await rm(join(f.root,path));await rejectBeforeREST();await f.put(path,original);
   const changed=JSON.parse(original.toString());if(name.includes('image-smoke'))changed.images.api='sha256:'+'0'.repeat(64);else if(name.includes('eval-worker-smoke'))changed.workerImage='sha256:'+'0'.repeat(64);else if(name.includes('native'))changed.files={...changed.files,'Cargo.lock':'0'.repeat(64)};else changed.malformedRegressionRejected=false;
   const {acceptance,...body}=changed;changed.acceptance={...acceptance,recordSha256:hash(JSON.stringify(body))};await f.json(path,changed);await rejectBeforeREST();await f.put(path,original);
   const wrongCohort=JSON.parse(original.toString());wrongCohort.acceptance.attempt='99';await f.json(path,wrongCohort);await rejectBeforeREST();await f.put(path,original);
  }
  for(const name of ['publication-evidence.tgz','SHA256SUMS']){const path=join(f.root,'development-assets',name),original=await readFile(path);await writeFile(path,'corrupt-only-uploaded-asset');await rejectBeforeREST('publish');await rejectBeforeREST();await writeFile(path,original);}
  // A valid gzip archive with a substituted regular member is also rejected,
  // even if its checksum file was rewritten to match that corrupted archive.
  const tarPath=join(f.root,'development-assets/publication-evidence.tgz'),tarBytes=await readFile(tarPath),sumsPath=join(f.root,'development-assets/SHA256SUMS'),sums=await readFile(sumsPath);
  const stage=join(f.root,'substituted/publication-evidence');await mkdir(stage,{recursive:true});const members=execFileSync('tar',['-tzf',tarPath],{encoding:'utf8'}).trim().split('\n');for(const member of members)await copyFile(join(f.root,'development-assets',member),join(f.root,'substituted',member));await writeFile(join(stage,'api-identity.json'),'{}');execFileSync('tar',['-czf',tarPath,'-C',join(f.root,'substituted'),'--',...members]);
  await writeFile(sumsPath,sums.toString().replace(hash(tarBytes),hash(await readFile(tarPath))));await rejectBeforeREST('publish');await rejectBeforeREST();await writeFile(tarPath,tarBytes);await writeFile(sumsPath,sums);
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
  const requests=(await readFile(join(f.root,'rest.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line));assert.equal(requests.filter(r=>r.method==='POST').length,0);assert.ok(requests.every(r=>r.method==='GET'));
  await rm(join(f.root,'rest.jsonl'),{force:true});const missingArtifact=f.execute('mark-verified',{GITHUB_RUN_ATTEMPT:'2'});assert.equal(missingArtifact.status,1);const missingRequests=(await readFile(join(f.root,'rest.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line));assert.ok(missingRequests.every(r=>r.method==='GET'));
  const marked=f.execute('mark-verified',{GITHUB_RUN_ATTEMPT:'2',NATIVE_EVIDENCE_ARTIFACT_ID:'303',NATIVE_EVIDENCE_ARTIFACT_DIGEST:'sha256:'+'a'.repeat(64)});assert.equal(marked.status,0,marked.stderr);const after=(await readFile(join(f.root,'rest.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line));assert.equal(after.at(-1).method,'PATCH');assert.equal(after.at(-1).body.draft,undefined);assert.ok(after.at(-1).body.body.includes('authenticated retrieval'));
  const retainedSums=await readFile(join(f.root,'native-download-SHA256SUMS'),'utf8');assert.ok(retainedSums.includes(hash(await readFile(join(f.root,'native-download-evidence.tgz')))));
  const stageRecord=JSON.parse(await readFile(join(f.root,'development-assets/publication-attempt.json'),'utf8'));assert.equal(stageRecord.uploadedAssets.length,0);assert.equal(stageRecord.retainedEvidence.length,3);
  const acceptance=JSON.parse(await readFile(join(f.root,'verified/native-download-acceptance.json'),'utf8'));assert.equal(acceptance.publicationAttempt,'1');assert.equal(acceptance.verificationAttempt,'2');assert.equal(acceptance.nativeRecords.length,2);
 }finally{await rm(f.root,{recursive:true,force:true});}
});

test('actual partial release upload retains successful asset hashes and refuses occupied retry',async()=>{
 const f=await fixture();try{
  assert.equal(f.execute('assemble').status,0);
  const partial=f.execute('publish',{MOCK_RELEASE_MODE:'partial'});assert.equal(partial.status,1);assert.ok(!partial.stderr.includes('sentinel-no-real-credential'));
  const record=JSON.parse(await readFile(join(f.root,'development-assets/publication-attempt.json'),'utf8'));
  assert.equal(record.result,'failed');assert.equal(record.publicationState,'draft');assert.equal(record.failure.status,422);assert.equal(record.failure.message,'[redacted]');assert.equal(record.releaseId,101);
  const failedRequests=(await readFile(join(f.root,'rest.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line));assert.ok(!failedRequests.some(r=>r.method==='PATCH'));assert.equal(record.uploadedAssets.length,1);assert.equal(record.uploadedAssets[0].name,`agentci-${version}.tgz`);
  assert.equal(record.uploadedAssets[0].sha256,hash(await readFile(join(f.root,'development-assets',record.uploadedAssets[0].name))));
  const publishedOnly=spawnSync(process.execPath,['--import',join(f.root,'preload.mjs'),'--input-type=module','-e',"const r=await fetch('https://api.github.com/repos/alimobrem/agentci/releases/tags/v0.4.0-m3-dev.3');if(r.status!==404)process.exit(1)"],{cwd:f.root,env:{PATH:process.env.PATH},encoding:'utf8'});assert.equal(publishedOnly.status,0,'Draft must be invisible to published-only tag endpoint');
  await rm(join(f.root,'rest.jsonl'),{force:true});assert.equal(f.execute('preflight').status,1);const preflightRequests=(await readFile(join(f.root,'rest.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line));assert.ok(preflightRequests.every(r=>r.method==='GET'));assert.ok(preflightRequests.some(r=>r.url.includes('/releases?per_page=100&page=1')));
  await rm(join(f.root,'rest.jsonl'),{force:true});assert.equal(f.execute('publish').status,1);
  const retry=(await readFile(join(f.root,'rest.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line));assert.ok(retry.every(r=>r.method==='GET'));
 }finally{await rm(f.root,{recursive:true,force:true});}
});
// Complete producer-shaped evidence, including source pins and independently
// retained runtime/native/forge receipts; no workflow-success shortcut.
async function addRuntimeProofs(f:any){
 const native=JSON.parse(await readFile('deploy/security/native-components.json','utf8')),forge=JSON.parse(await readFile('deploy/engines/patches/forge-backport.json','utf8'));
 // @ts-expect-error operational ESM helper
 const {RUNTIME_FILES,IMAGE_CHECKS,EVAL_CHECKS}=await import('../scripts/lib/download-runtime-evidence.mjs');
 for(const arch of ['amd64','arm64']){
  const identityBytes=await readFile(join(f.root,`verified/${arch}/downloaded-identities.json`)),identities=JSON.parse(identityBytes.toString()),image=(role:string)=>identities.images.find((i:any)=>i.role===role);
  const records:any={
   'downloaded-image-smoke.json':{result:'passed',version:'downloaded',platform:arch==='amd64'?'x64':arch,images:{api:image('api').localImageId,worker:image('worker').localImageId},checks:IMAGE_CHECKS},
   'downloaded-eval-worker-smoke.json':{result:'passed',deployment:'native-CLI',engine:'docker',platform:'linux/'+arch,workerImage:image('eval-worker').localImageId,runnerImage:image('eval-runner').localImageId,uid:1001,node:process.version,cli:`Docker version ${native.dockerCli.version}, build ${native.dockerCli.sourceCommit.slice(0,7)}`,license:hash(await readFile('deploy/licenses/docker-cli-LICENSE')),checks:EVAL_CHECKS},
   'downloaded-worker-native.json':{image:image('worker').image,engine:'docker',platform:'linux/'+arch,temporalNativeArtifacts:'matched official npm artifact',files:native.temporalBridge.files},
   'downloaded-eval-worker-native.json':{image:image('eval-worker').image,engine:'docker',platform:'linux/'+arch,temporalNativeArtifacts:'matched official npm artifact',files:native.temporalBridge.files,dockerCli:{Version:native.dockerCli.version,GitCommit:native.dockerCli.sourceCommit.slice(0,7),GoVersion:native.dockerCli.goVersion,sha256:native.dockerCli.binarySha256[arch],vendorManifestSha256:native.dockerCli.vendorManifest.sha256}},
   'downloaded-forge-backport.json':{image:image('eval-engines').localImageId,releaseImage:image('eval-engines').image,...f.expected,platform:'linux/'+arch,observed:{arch:arch==='amd64'?'x64':arch,rsaSha256:forge.afterSha256,metadata:forge,verifierSha256:hash(await readFile('deploy/engines/patches/verify-forge-backport.cjs')),fixtureSha256:hash(await readFile('deploy/engines/patches/forge-nested-digest-fixture.json'))},malformedRegressionRejected:true,validSignaturesAccepted:true,wrongMessagesRejected:true,scannerFindingRetained:true}
  };
  for(const name of RUNTIME_FILES){const body=records[name];await f.json(`verified/${arch}/${name}`,{...body,acceptance:{schemaVersion:1,...f.expected,acceptanceCommit:f.expected.sourceCommit,platform:'linux/'+arch,identitiesSha256:hash(identityBytes),file:name,recordSha256:hash(JSON.stringify(body))}});}
 }
}

 test('all five draft assets precede publication and immutable transport rejects later asset POST',async()=>{const f=await fixture();try{assert.equal(f.execute('assemble').status,0);const published=f.execute('publish',{MOCK_RELEASE_MODE:'happy'});assert.equal(published.status,0,published.stderr);const requests=(await readFile(join(f.root,'rest.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line));const creation=requests.findIndex(r=>r.method==='POST'&&r.url.endsWith('/releases')),transition=requests.findIndex(r=>r.method==='PATCH');assert.equal(requests[creation].body.draft,true);assert.equal(requests.filter(r=>r.url.includes('uploads.github.com')).length,5);assert.ok(requests.slice(transition+1).every(r=>r.method==='GET'));assert.ok(requests.slice(creation+1,transition).filter(r=>r.method==='POST').every(r=>r.url.includes('uploads.github.com')));assert.equal(requests[transition].body.draft,false);const probe=spawnSync(process.execPath,['--import',join(f.root,'preload.mjs'),'--input-type=module','-e',"const r=await fetch('https://uploads.github.com/repos/alimobrem/agentci/releases/101/assets?name=late',{method:'POST'});if(r.status!==422)process.exit(1)"],{cwd:f.root,env:{PATH:process.env.PATH},encoding:'utf8'});assert.equal(probe.status,0);const record=JSON.parse(await readFile(join(f.root,'development-assets/publication-attempt.json'),'utf8'));assert.equal(record.publicationState,'published');assert.equal(record.uploadedAssets.length,5);}finally{await rm(f.root,{recursive:true,force:true});}});

test('actual lost create acknowledgement recovers draft through authenticated listing despite by-tag404',async()=>{const f=await fixture();try{assert.equal(f.execute('assemble').status,0);const result=f.execute('publish',{MOCK_RELEASE_MODE:'lost-create'});assert.equal(result.status,0,result.stderr);const requests=(await readFile(join(f.root,'rest.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line));assert.equal(requests.filter(r=>r.method==='POST'&&r.url.endsWith('/releases')).length,1);const createIndex=requests.findIndex(r=>r.method==='POST'&&r.url.endsWith('/releases')),uploadIndex=requests.findIndex(r=>r.url.includes('uploads.github.com'));assert.ok(requests.slice(createIndex+1,uploadIndex).some(r=>r.method==='GET'&&r.url.includes('/releases?per_page=100&page=1')));assert.ok(!requests.slice(createIndex+1,uploadIndex).some(r=>r.url.includes('/releases/tags/')));}finally{await rm(f.root,{recursive:true,force:true});}});

test('actual publication tag race before PATCH and wrong ref after lost publication remain failures',async()=>{for(const phase of ['before-publish','after-publish']){const f=await fixture();try{assert.equal(f.execute('assemble').status,0);const result=f.execute('publish',{MOCK_RELEASE_MODE:phase==='after-publish'?'lost-publish':'happy',MOCK_TAG_RACE:phase});assert.equal(result.status,1);const requests=(await readFile(join(f.root,'rest.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line));assert.equal(requests.filter(r=>r.method==='PATCH').length,phase==='before-publish'?0:1);const record=JSON.parse(await readFile(join(f.root,'development-assets/publication-attempt.json'),'utf8'));assert.equal(record.result,'failed');assert.equal(record.publicationState,phase==='before-publish'?'draft':'published-unverified');assert.equal(record.tagChecks.length,phase==='before-publish'?2:3);}finally{await rm(f.root,{recursive:true,force:true});}}});

test('mutable workflow cannot upgrade the exact committed installation-token grant before REST',async()=>{
 const f=await fixture('read');try{
  await f.put('.github/workflows/development-candidate.yaml',await readFile('.github/workflows/development-candidate.yaml'));
  const result=f.execute('preflight');assert.equal(result.status,1);
  const attempt=JSON.parse(await readFile(join(f.root,'development-assets/publication-attempt.json'),'utf8'));
  assert.match(attempt.failure.message,/differs from exact committed source/);
  assert.equal(attempt.releaseId,null);assert.deepEqual(attempt.uploadedAssets,[]);
  await assert.rejects(readFile(join(f.root,'rest.jsonl')),/ENOENT/);
 }finally{await rm(f.root,{recursive:true,force:true});}
});
