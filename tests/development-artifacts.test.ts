import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {parse} from 'yaml';
// @ts-expect-error operational ESM helper
import {candidateIdentity,bindDevelopmentImages,hash,requireAvailableResponse,validatePackageManifest,sanitizedPackageEnvironment} from '../scripts/lib/development-artifacts.mjs';
// @ts-expect-error operational ESM helper
import {anonymousDownload,verifyPackageFiles} from '../scripts/published-package-smoke.mjs';
const expected={version:'0.4.0-m3-dev.2',sourceCommit:'a'.repeat(40),runId:'123',attempt:'1'};
const roles=['api','worker','eval-worker','eval-runner','eval-engines','eval-agentci'];
function cohort(){
 const indexes:any={},identities:any[]=[],acceptances:any[]=[];
 for(const role of roles){
  const receipts=['amd64','arm64'].map((arch,index)=>({...expected,role,arch,result:'passed',buildDigest:'sha256:'+(index?'b':'c').repeat(64),manifestDigest:'sha256:'+(index?'d':'e').repeat(64),configDigest:'sha256:'+'f'.repeat(64),scanSha256:'1'.repeat(64),inspectSha256:'2'.repeat(64),nativeSha256:['worker','eval-worker'].includes(role)?'3'.repeat(64):null}));
  indexes[role]=Buffer.from(JSON.stringify({schemaVersion:2,mediaType:'application/vnd.oci.image.index.v1+json',manifests:receipts.map(r=>({mediaType:'application/vnd.oci.image.manifest.v1+json',digest:r.manifestDigest,size:100,platform:{os:'linux',architecture:r.arch}}))}));
  identities.push({...expected,role,image:`ghcr.io/alimobrem/agentci-${role}@sha256:${hash(indexes[role])}`,platforms:['linux/amd64','linux/arm64']});
  acceptances.push({...expected,role,result:'passed',receipts});
 }
 return {identities,acceptances,indexes};
}
test('candidate assembly requires all six unique exact-attempt roles and digest-bound native indexes',()=>{
 const c=cohort();assert.equal(bindDevelopmentImages(c.identities,c.acceptances,c.indexes,expected).length,6);
 assert.throws(()=>bindDevelopmentImages(c.identities.slice(1),c.acceptances,c.indexes,expected));
 assert.throws(()=>bindDevelopmentImages([c.identities[0],...c.identities.slice(0,5)],c.acceptances,c.indexes,expected));
 for(const key of ['sourceCommit','version','runId','attempt','image']){const changed=structuredClone(c.identities);changed[0][key]='wrong';assert.throws(()=>bindDevelopmentImages(changed,c.acceptances,c.indexes,expected));}
 const partial=structuredClone(c.acceptances);partial[0].receipts.pop();assert.throws(()=>bindDevelopmentImages(c.identities,partial,c.indexes,expected));
 const duplicate=structuredClone(c.acceptances);duplicate[0].receipts[1]=duplicate[0].receipts[0];assert.throws(()=>bindDevelopmentImages(c.identities,duplicate,c.indexes,expected));
 const corrupt={...c.indexes,api:Buffer.from('{}')};assert.throws(()=>bindDevelopmentImages(c.identities,c.acceptances,corrupt,expected));
 assert.throws(()=>candidateIdentity('0.4.0-m3-dev.1',expected.sourceCommit));
 requireAvailableResponse(404);for(const status of [200,401,403,429,500])assert.throws(()=>requireAvailableResponse(status));
});
test('anonymous download sends no auth and rejects missing, oversized or wrong public bytes',async()=>{
 const bytes=Buffer.from('public package'),checksum=hash(bytes);let options:any;
 const request=async(_url:any,input:any)=>{options=input;return new Response(bytes);};
 assert.deepEqual(await anonymousDownload('https://github.com/example',checksum,100,request),bytes);
 assert.deepEqual(options.headers,{accept:'application/octet-stream'});
 await assert.rejects(anonymousDownload('https://github.com/example','0'.repeat(64),100,request));
 await assert.rejects(anonymousDownload('https://github.com/example',checksum,1,request));
 await assert.rejects(anonymousDownload('https://github.com/example',checksum,100,async()=>new Response('',{status:404})));
});
test('package content source and hash are checked before installation and child env excludes sentinel credentials',async()=>{
 const root=await mkdtemp(join(tmpdir(),'agentci-package-binding-'));
 try{
  const contents:any={'package.json':JSON.stringify({name:'agentci',version:expected.version}),'npm-shrinkwrap.json':'{}','package-lock.json':'{}','dist/release-source.json':JSON.stringify({schemaVersion:1,version:expected.version,sourceCommit:expected.sourceCommit}),'dist/cmd/agentci/main.js':'export {};','dist/packages/version.js':`export const VERSION='${expected.version}';`};
  for(const [path,bytes] of Object.entries(contents)){await mkdir(join(root,path,'..'),{recursive:true});await writeFile(join(root,path),bytes as string);}
  const manifest={schemaVersion:1,...expected,package:{name:`agentci-${expected.version}.tgz`,sha256:'b'.repeat(64)},files:Object.entries(contents).map(([path,bytes])=>({path,sha256:hash(bytes)}))};
  validatePackageManifest(manifest,expected);await verifyPackageFiles(root,manifest);
  for(const path of ['../escape','/absolute','a/../escape'])assert.throws(()=>validatePackageManifest({...manifest,files:[...manifest.files,{path,sha256:'b'.repeat(64)}]},expected));
  assert.throws(()=>validatePackageManifest({...manifest,files:[...manifest.files,manifest.files[0]]},expected));
  await writeFile(join(root,'dist/release-source.json'),JSON.stringify({version:expected.version,sourceCommit:'c'.repeat(40)}));await assert.rejects(verifyPackageFiles(root,manifest));
  const env=sanitizedPackageEnvironment(root,process.env.PATH);assert.deepEqual(Object.keys(env).sort(),['HOME','PATH','npm_config_cache','npm_config_globalconfig','npm_config_registry','npm_config_userconfig'].sort());
  const output=execFileSync(process.execPath,['scripts/development-release.mjs','preflight'],{encoding:'utf8',stdio:'pipe',env:{PATH:process.env.PATH,GITHUB_TOKEN:'sentinel-private-token-do-not-print',GITHUB_SHA:expected.sourceCommit}});
  assert.fail(output);
 }catch(error:any){if(error.status!==undefined){assert.equal(error.status,1);assert.ok(!String(error.stderr).includes('sentinel-private-token'));assert.match(String(error.stderr),/Development publication failed/);}else throw error;}
 finally{await rm(root,{recursive:true,force:true});}
});
test('publication is main-only, activation-bound, least privilege and gated on both native download types',()=>{
 const workflow=parse(readFileSync('.github/workflows/development-candidate.yaml','utf8'));
 assert.deepEqual(workflow.on.push.branches,['main']);assert.deepEqual(workflow.on.push.paths,['releases/m3-development-candidate.json']);assert.equal(workflow.on.pull_request,undefined);assert.equal(workflow.on.pull_request_target,undefined);
 assert.match(workflow.jobs.preflight.if,/github\.repository == 'alimobrem\/agentci'/);assert.match(workflow.jobs.preflight.if,/refs\/heads\/main/);
 assert.deepEqual(workflow.jobs.preflight.permissions,{contents:'write',packages:'read'});assert.ok(workflow.jobs.preflight.if.includes("github.ref == 'refs/heads/main'"));assert.ok(workflow.jobs.preflight.if.includes("github.repository == 'alimobrem/agentci'"));
 assert.deepEqual(workflow.jobs.images.permissions,{contents:'read',packages:'write'});
 assert.deepEqual(workflow.jobs['release-candidate'].permissions,{contents:'write',packages:'read'});
 assert.equal(workflow.jobs['native-image-downloads'].uses,'./.github/workflows/download-smoke.yaml');
 assert.deepEqual(workflow.jobs.finalize.needs,['release-candidate','native-image-downloads','native-package-downloads']);
 assert.equal(workflow.jobs.finalize.if,undefined);assert.deepEqual(workflow.jobs.finalize.permissions,{contents:'write',actions:'read'});const finalSteps=workflow.jobs.finalize.steps;const retainIndex=finalSteps.findIndex((step:any)=>step.id==='final_evidence'),markIndex=finalSteps.findIndex((step:any)=>step.run==='node scripts/development-release.mjs mark-verified');assert.ok(markIndex>retainIndex);assert.equal(finalSteps[markIndex].if,'success()');assert.equal(finalSteps[retainIndex].with['retention-days'],90);
 const finalUpload=workflow.jobs.finalize.steps.find((step:any)=>step.id==='final_evidence');assert.equal(finalUpload.if,'always()');assert.ok(finalUpload.with.path.split('\n').includes('development-assets/publication-attempt.json'));assert.ok(finalUpload.with.path.split('\n').includes('native-download-SHA256SUMS'));
 assert.deepEqual(workflow.jobs['native-package-downloads'].strategy.matrix.include.map((v:any)=>v.arch),['amd64','arm64']);
 for(const job of Object.values(workflow.jobs) as any[])for(const step of job.steps??[])if(step.uses?.includes('checkout')){assert.equal(step.with.ref,'${{ github.sha }}');assert.equal(step.with['persist-credentials'],false);}
 for(const file of ['images.yaml','download-smoke.yaml'])assert.ok(parse(readFileSync('.github/workflows/'+file,'utf8')).on.workflow_call);
});
