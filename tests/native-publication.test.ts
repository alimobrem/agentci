import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'yaml';
// @ts-expect-error operational ESM helper
import {validateNativeReceipts,verifyAssembledIndex,bindNativeImage,bindNativeScan} from '../scripts/native-publication.mjs';
const expected={role:'worker',version:'0.4.0-m3',sourceCommit:'a'.repeat(40),runId:'123',attempt:'1'};
const receipts=()=>['amd64','arm64'].map((arch,i)=>({...expected,arch,result:'passed',buildDigest:'sha256:'+(i?'b':'a').repeat(64),manifestDigest:'sha256:'+(i?'d':'c').repeat(64),configDigest:'sha256:'+'e'.repeat(64),scanSha256:'f'.repeat(64),inspectSha256:'1'.repeat(64),nativeSha256:'2'.repeat(64)}));
test('native assembly refuses partial, stale, failed, duplicate and unbound platform receipts',()=>{
 assert.equal(validateNativeReceipts(receipts(),expected).length,2);
 assert.throws(()=>validateNativeReceipts(receipts().slice(0,1),expected),/Both/);
 assert.throws(()=>validateNativeReceipts([receipts()[0],receipts()[0]],expected),/Duplicate/);
 for(const patch of [{sourceCommit:'b'.repeat(40)},{version:'0.3.1-m2'},{runId:'124'},{attempt:'2'},{role:'api'},{result:'failed'},{buildDigest:'latest'},{manifestDigest:''},{configDigest:''},{scanSha256:''},{inspectSha256:''},{nativeSha256:null}]){
  const values=receipts();Object.assign(values[1]!,patch);assert.throws(()=>validateNativeReceipts(values,expected));
 }
});
test('assembled index binds both exact native manifests and rejects unexpected runtime platforms',()=>{
 const values=receipts();
 const index={schemaVersion:2,mediaType:'application/vnd.oci.image.index.v1+json',manifests:values.map(r=>({mediaType:'application/vnd.oci.image.manifest.v1+json',size:123,digest:r.manifestDigest,platform:{os:'linux',architecture:r.arch}}))};
 verifyAssembledIndex('worker',index,values);
 const changed=structuredClone(index);changed.manifests[1]!.digest='sha256:'+'9'.repeat(64);assert.throws(()=>verifyAssembledIndex('worker',changed,values),/digest mismatch/);
 assert.throws(()=>verifyAssembledIndex('worker',{...index,manifests:[...index.manifests,{...index.manifests[0],platform:{os:'linux',architecture:'s390x'}}]},values),/Unexpected platform/);
 assert.throws(()=>verifyAssembledIndex('worker',{...index,manifests:[index.manifests[0]]},values),/exactly one/);
});
test('native image identity rejects wrong architecture, source, version and repository',()=>{
 const image={Os:'linux',Architecture:'arm64',Id:'sha256:'+'a'.repeat(64),Config:{Labels:{'org.opencontainers.image.revision':expected.sourceCommit,'org.opencontainers.image.version':expected.version,'org.opencontainers.image.source':'https://github.com/alimobrem/agentci'}}};
 assert.equal(bindNativeImage(image,{...expected,arch:'arm64'}),image.Id);
 for(const patch of [{Os:'windows'},{Architecture:'amd64'},{Id:'tag'},{Config:{Labels:{}}}])assert.throws(()=>bindNativeImage({...image,...patch},{...expected,arch:'arm64'}),/mismatch/);
 for(const key of Object.keys(image.Config.Labels))assert.throws(()=>bindNativeImage({...image,Config:{Labels:{...image.Config.Labels,[key]:'wrong'}}},{...expected,arch:'arm64'}),/mismatch/);
});
test('publication reserves evidence and cleanup time and gates tag assembly on native jobs',()=>{
 const workflow=parse(readFileSync('.github/workflows/images.yaml','utf8')),build=workflow.jobs['build-native'],publish=workflow.jobs.publish;
 assert.equal(publish.needs,'build-native');assert.equal(build.strategy['fail-fast'],false);
 assert.deepEqual(build.strategy.matrix.platform.map((p:any)=>p.arch).sort(),['amd64','arm64']);
 assert.ok(build.strategy.matrix.platform.every((p:any)=>p.runner.endsWith('-arm')===(p.arch==='arm64')));
 assert.ok(!build.steps.some((s:any)=>s.uses?.includes('qemu')));
 const compile=build.steps.find((s:any)=>s.id==='image'),scan=build.steps.find((s:any)=>s.name==='Scan and bind native publication evidence'),upload=build.steps.find((s:any)=>s.uses?.includes('upload-artifact')),cleanup=build.steps.at(-1);
 assert.ok(build['timeout-minutes']>=compile['timeout-minutes']+scan['timeout-minutes']+upload['timeout-minutes']+cleanup['timeout-minutes']+10);
 assert.equal(upload.if,'always()');assert.ok(cleanup['timeout-minutes']<=2);
 assert.match(compile.with.outputs,/push-by-digest=true/);assert.equal(compile.with.tags,undefined);
 const assemble=publish.steps.find((s:any)=>s.name==='Assemble only fully accepted native platforms').run;
 assert.ok(assemble.indexOf('native-publication.mjs verify')<assemble.indexOf('imagetools create -t'));
});

test('scan evidence must name the accepted manifest, configuration and native platform',()=>{
 const expectedScan={...expected,arch:'arm64',manifestDigest:'sha256:'+'d'.repeat(64),configDigest:'sha256:'+'e'.repeat(64)};
 const ref=`ghcr.io/alimobrem/agentci-worker@${expectedScan.manifestDigest}`;
 const scan={ArtifactType:'container_image',ArtifactName:ref,Metadata:{ImageID:expectedScan.configDigest,ImageConfig:{architecture:'arm64',os:'linux'},RepoDigests:[ref]}};
 bindNativeScan(scan,expectedScan);
 for(const patch of [{ArtifactName:'another-image'},{ArtifactType:'filesystem'},{Metadata:{...scan.Metadata,ImageID:'sha256:'+'f'.repeat(64)}},{Metadata:{...scan.Metadata,RepoDigests:[]}},{Metadata:{...scan.Metadata,ImageConfig:{architecture:'amd64',os:'linux'}}}])assert.throws(()=>bindNativeScan({...scan,...patch},expectedScan),/Scan does not bind/);
});
