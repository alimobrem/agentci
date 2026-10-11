import {readFile,writeFile,mkdir,copyFile,readdir,mkdtemp,rm,stat,chmod} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {Octokit} from '@octokit/rest';
import {tmpdir} from 'node:os';
import {resolve,join,dirname} from 'node:path';
import {validateCoverage} from './download-integration-reporter.mjs';
import {IMAGE_ROLES,assertUnusedImageTag} from './image-publication.mjs';
import {DEVELOPMENT_VERSION,SERVICE_REPOSITORY,candidateIdentity,hash,requireAvailableResponse,validatePackageManifest,readDevelopmentImages,validateDevelopmentAssets,validatePackageReceipt,normalizePackOutput} from './lib/development-artifacts.mjs';

let stageRecord;
async function retainStage(){if(stageRecord){await mkdir('development-assets',{recursive:true});await writeFile('development-assets/publication-attempt.json',JSON.stringify(stageRecord,null,2)+'\n');}}
try {
const command=process.argv[2],sourceCommit=process.env.GITHUB_SHA,version=DEVELOPMENT_VERSION;
candidateIdentity(version,sourceCommit);
if(process.env.GITHUB_REPOSITORY!==SERVICE_REPOSITORY||process.env.GITHUB_REF!=='refs/heads/main'||!['push','workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME)||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()!==sourceCommit||JSON.parse(await readFile('package.json')).version!==version)throw Error('Reviewed main and exact candidate source/version required');
const descriptor=JSON.parse(await readFile('releases/m3-development-candidate.json'));
if(descriptor.schemaVersion!==1||descriptor.version!==version||descriptor.repository!==SERVICE_REPOSITORY||descriptor.publication!=='approved-development-candidate')throw Error('Explicit candidate activation required');
const expected={version,sourceCommit,runId:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT};
stageRecord={schemaVersion:1,...expected,command,result:'in-progress',releaseId:null,uploadedAssets:[]};await retainStage();
const github=new Octokit({auth:process.env.GITHUB_TOKEN,request:{timeout:30000}}),repository={owner:'alimobrem',repo:'agentci'},tag='v'+version;
async function absent(read){try{await read();requireAvailableResponse(200);}catch(error){if(error.status===404)return;throw Error('Candidate occupied or availability inconclusive');}}
const emit=async(key,value)=>{if(!process.env.GITHUB_OUTPUT||/[\r\n]/.test(value))throw Error('Invalid workflow output');await writeFile(process.env.GITHUB_OUTPUT,`${key}=${value}\n`,{flag:'a'});};
if(command==='preflight'){
 await absent(()=>github.rest.git.getRef({...repository,ref:'tags/'+tag}));
 await absent(()=>github.rest.repos.getReleaseByTag({...repository,tag}));
 for(const role of IMAGE_ROLES)await assertUnusedImageTag(role,version,{actor:process.env.GITHUB_ACTOR,token:process.env.GITHUB_TOKEN});
 console.log('All candidate destinations absent; no publication performed');
}else if(command==='assemble'){
 const names=await readdir('published');
 if(names.filter(n=>n.endsWith('-identity.json')).length!==6||names.filter(n=>n.endsWith('-native-acceptance.json')).length!==6)throw Error('Incomplete or duplicate role publication evidence');
 const images=await readDevelopmentImages('published',expected);
 await mkdir('development-assets',{recursive:true});
 // This package-only provenance asset binds the build to the frozen reviewed SHA.
 await writeFile('dist/release-source.json',JSON.stringify({schemaVersion:1,version,sourceCommit})+'\n');
 const pack=normalizePackOutput(JSON.parse(execFileSync('npm',['pack','--ignore-scripts','--json','--pack-destination','development-assets'],{encoding:'utf8'})),version);
 // npm12 excludes root shrinkwrap. Restore both equal source locks explicitly,
 // retaining the ordinary npm tarball layout and a locked-root install route.
 if(!Buffer.from(await readFile('package-lock.json')).equals(await readFile('npm-shrinkwrap.json')))throw Error('Source production locks differ');
 const paths=[...new Set([...pack.files.map(file=>file.path),'npm-shrinkwrap.json','package-lock.json'])].sort();
 const staging=await mkdtemp(join(tmpdir(),'agentci-source-pack-'));
 try{
  for(const path of paths){const destination=join(staging,'package',path);await mkdir(dirname(destination),{recursive:true});await copyFile(path,destination);await chmod(destination,(await stat(path)).mode&0o777);}
  // Explicit regular-file list: no directory entries or accidental local files.
  execFileSync('tar',['-czf',resolve('development-assets',pack.filename),'-C',staging,'--',...paths.map(path=>'package/'+path)]);
 }finally{await rm(staging,{recursive:true,force:true});}
 const archive=await readFile('development-assets/'+pack.filename);
 const files=await Promise.all(paths.map(async path=>({path,sha256:hash(await readFile(path))})));
 const manifest=validatePackageManifest({schemaVersion:1,...expected,package:{name:pack.filename,sha256:hash(archive)},files},expected);
 const manifestBytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');
 await writeFile('development-assets/package-manifest.json',manifestBytes);
 await writeFile('development-assets/images.json',JSON.stringify({schemaVersion:1,...expected,images},null,2)+'\n');
 const evidenceFiles=names.filter(n=>/\.json$/.test(n));
 await mkdir('development-assets/publication-evidence',{recursive:true});
 for(const name of evidenceFiles)await copyFile('published/'+name,'development-assets/publication-evidence/'+name);
 execFileSync('tar',['-czf','development-assets/publication-evidence.tgz','-C','development-assets','publication-evidence']);
 const assets=[pack.filename,'package-manifest.json','images.json','publication-evidence.tgz'];
 await writeFile('development-assets/SHA256SUMS',(await Promise.all(assets.map(async name=>`${hash(await readFile('development-assets/'+name))}  ${name}\n`))).join(''));
 for(const image of images)await emit(image.role.replaceAll('-','_')+'_image',image.image);
 await emit('package_sha256',hash(archive));await emit('manifest_sha256',hash(manifestBytes));
}else if(command==='publish'){
 const assets=await validateDevelopmentAssets('development-assets',expected);if(assets.cohort.attempt!==expected.attempt)throw Error('Publish must use the current build attempt');
 await absent(()=>github.rest.git.getRef({...repository,ref:'tags/'+tag}));
 await absent(()=>github.rest.repos.getReleaseByTag({...repository,tag}));
 const response=await github.rest.repos.createRelease({...repository,tag_name:tag,target_commitish:sourceCommit,name:`AgentCI ${version} — download validation pending`,prerelease:true,draft:false,make_latest:'false',body:`Development candidate from ${sourceCommit}. All six native image roles published; package/image download validation is pending. This is not M3 milestone completion. Partial failures and attempt evidence remain retained.`});
 stageRecord.releaseId=response.data.id;await retainStage();
 const assetNames=[`agentci-${version}.tgz`,'package-manifest.json','images.json','publication-evidence.tgz','SHA256SUMS'];
 for(const name of assetNames){const bytes=await readFile('development-assets/'+name);await github.rest.repos.uploadReleaseAsset({...repository,release_id:response.data.id,name,headers:{'content-type':'application/octet-stream','content-length':bytes.length},data:bytes});stageRecord.uploadedAssets.push({name,sha256:hash(bytes)});await retainStage();}
 await emit('release_id',String(response.data.id));
 console.log('Development assets published; validation still pending');
}else if(command==='finalize'){
 // Only the orchestration job depending on both native downloads and package jobs
 // may call this; validate retained outputs as well as the job dependency guards.
 const assets=await validateDevelopmentAssets('development-assets',expected);
 const receipts=await Promise.all(['amd64','arm64'].map(async arch=>JSON.parse(await readFile(`verified/package-${arch}.json`))));
 for(const [index,arch] of ['amd64','arm64'].entries())validatePackageReceipt(receipts[index],arch,assets,expected);
 const publishedImages={images:assets.images};
 const nativeRecords=[];
 const suites=(await readdir('tests/integration')).filter(name=>name.endsWith('.test.ts')).sort().map(name=>resolve('tests/integration',name));
 for(const arch of ['amd64','arm64']){
  const identities=JSON.parse(await readFile(`verified/${arch}/downloaded-identities.json`)),integration=JSON.parse(await readFile(`verified/${arch}/downloaded-integration.json`));
  if(identities.sourceCommit!==sourceCommit||identities.version!==version||identities.platform!=='linux/'+arch||identities.anonymous!==true||identities.images?.length!==6||new Set(identities.images.map(v=>v.role)).size!==6||integration.sourceCommit!==sourceCommit||integration.acceptanceCommit!==process.env.GITHUB_WORKFLOW_SHA)throw Error('Incomplete native image/download acceptance');
  for(const record of [identities,integration])if(record.runId!==expected.runId||!(/^[1-9]\d*$/.test(record.attempt??''))||BigInt(record.attempt)>BigInt(expected.attempt))throw Error('Native download verification cohort mismatch');
  for(const image of identities.images)if(image.image!==publishedImages.images.find(v=>v.role===image.role)?.image||image.sourceCommit!==sourceCommit||image.version!==version||image.platform!=='linux/'+arch)throw Error('Downloaded role differs from published manifest');
  nativeRecords.push({arch,identities,integration});
  validateCoverage(suites,integration.summaries);
  if(integration.inputs?.length!==suites.length)throw Error('Incomplete source suite manifest');
  for(const file of suites)if(integration.inputs.find(v=>v.file===file)?.sha256!==hash(await readFile(file)))throw Error('Downloaded test source mismatch');
 }
 const release=await github.rest.repos.getReleaseByTag({...repository,tag});
 stageRecord.releaseId=release.data.id;await retainStage();
 const tagCommit=await github.rest.git.getRef({...repository,ref:'tags/'+tag});
 if(tagCommit.data.object.type!=='commit'||tagCommit.data.object.sha!==sourceCommit||release.data.draft||!release.data.prerelease)throw Error('Development release source mismatch');
 const record={schemaVersion:1,...expected,result:'passed',scope:'development image and package native downloads only; customer/M3 gates remain pending',publicationRunId:assets.cohort.runId,publicationAttempt:assets.cohort.attempt,verificationAttempt:expected.attempt,packageReceipts:receipts,nativeRecords};
 await writeFile('verified/native-download-acceptance.json',JSON.stringify(record,null,2)+'\n');
 execFileSync('tar',['-czf','native-download-evidence.tgz','-C','verified','.']);
 const nativeEvidence=await readFile('native-download-evidence.tgz');
 const bytes=Buffer.from(JSON.stringify(record,null,2)+'\n');
 await github.rest.repos.uploadReleaseAsset({...repository,release_id:release.data.id,name:'native-download-acceptance.json',headers:{'content-type':'application/json','content-length':bytes.length},data:bytes});
 stageRecord.uploadedAssets.push({name:'native-download-acceptance.json',sha256:hash(bytes)});await retainStage();
 await github.rest.repos.uploadReleaseAsset({...repository,release_id:release.data.id,name:'native-download-evidence.tgz',headers:{'content-type':'application/octet-stream','content-length':nativeEvidence.length},data:nativeEvidence});
 stageRecord.uploadedAssets.push({name:'native-download-evidence.tgz',sha256:hash(nativeEvidence)});await retainStage();
 const checksums=Buffer.from(`${hash(bytes)}  native-download-acceptance.json\n${hash(nativeEvidence)}  native-download-evidence.tgz\n`);
 await github.rest.repos.uploadReleaseAsset({...repository,release_id:release.data.id,name:'native-download-SHA256SUMS',headers:{'content-type':'text/plain','content-length':checksums.length},data:checksums});
 stageRecord.uploadedAssets.push({name:'native-download-SHA256SUMS',sha256:hash(checksums)});await retainStage();
 await github.rest.repos.updateRelease({...repository,release_id:release.data.id,name:`AgentCI ${version} — native downloads verified`,body:`Development candidate ${sourceCommit}: all six roles and package passed anonymous native AMD64/ARM64 download/runtime checks. Source-bound evidence is attached. Actual customer scenarios, UI and all M3 milestone gates remain separate; this is not M3 completion.`});
}else throw Error('Use preflight, assemble, publish or finalize');
stageRecord.result='passed';await retainStage();
}catch{
 if(stageRecord){stageRecord.result='failed';try{await retainStage();}catch{}}
 console.error('Development publication failed; preserve attempt evidence and occupied identities. No candidate completion is claimed.');
 process.exitCode=1;
}
