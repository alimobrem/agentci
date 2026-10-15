import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,symlink} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';
// @ts-ignore Native CI publication boundary uses only Node builtins.
import {publishDashboardArtifacts} from '../scripts/lib/dashboard-public-artifacts.mjs';
// @ts-ignore Source-bound fixture identity only; no listener is executed.
import {AUTH_HELPER_SOURCE} from '../scripts/lib/dashboard-native-auth-helper.mjs';
async function fixture(){const root=await mkdtemp(join(tmpdir(),'dashboard-public-test-')),staging=join(root,'staging'),destination=join(root,'public');await mkdir(staging);return {root,staging,destination};}
test('public publication preserves exact member bytes/hashes and counts the manifest inside the cap',async()=>{
 const f=await fixture(),bytes=Buffer.from('{"source":"exact"}\n');await writeFile(join(f.staging,'source.json'),bytes);
 const result=await publishDashboardArtifacts(f.staging,f.destination,{maxBytes:1024});assert.equal(result.result,'published');
 const manifest=JSON.parse(await readFile(join(f.destination,'artifact-manifest.json'),'utf8'));assert.deepEqual(manifest.files,[{path:'source.json',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}]);assert.deepEqual(await readFile(join(f.destination,'source.json')),bytes);assert.ok(result.bytes<=1024);
});
test('authenticated progress publication preserves validated bytes and refuses nested private fields before upload',async()=>{
 const source={sourceCommit:'b'.repeat(40),sourceTree:'d'.repeat(40),candidateCommit:'b'.repeat(40),arch:'amd64',rootLockSha256:'a'.repeat(64),dashboardLockSha256:'a'.repeat(64),dashboardVersion:'0.0.0-local-m3',rootVersion:'0.4.0-m3-dev.4',runId:'12345',attempt:'1',imageId:'sha256:'+'a'.repeat(64)};
 const progress={schemaVersion:1,stage:'characterization',result:'partial-observations-not-qualification',source,fixtureSourceSha256:createHash('sha256').update(AUTH_HELPER_SOURCE).digest('hex'),checkpoints:[{caseId:null,trustCase:null,step:'prepare',boundary:null}]};
 const good=await fixture(),bytes=JSON.stringify(progress)+'\n';await writeFile(join(good.staging,'authenticated-drain-progress.json'),bytes);assert.equal((await publishDashboardArtifacts(good.staging,good.destination)).result,'published');assert.equal(await readFile(join(good.destination,'authenticated-drain-progress.json'),'utf8'),bytes);
 for(const name of ['authenticated-drain-progress.json','authenticated-drain.json']){
  const f=await fixture(),privateValue={...progress,checkpoints:[{...progress.checkpoints[0],stderr:'PRIVATE-CANARY'}]};await writeFile(join(f.staging,name),JSON.stringify(privateValue));assert.equal((await publishDashboardArtifacts(f.staging,f.destination)).result,'withheld');assert.deepEqual(await readdir(f.destination),['publication-failure.json']);assert.equal((await readFile(join(f.destination,'publication-failure.json'),'utf8')).includes('PRIVATE-CANARY'),false);
 }
 for(const duplicate of [bytes.replace('"result":','"result":"PRIVATE-CANARY","result":'),bytes.replace('"step":','"step":"PRIVATE-CANARY","step":')]){
  const f=await fixture();await writeFile(join(f.staging,'authenticated-drain-progress.json'),duplicate);assert.equal((await publishDashboardArtifacts(f.staging,f.destination)).result,'withheld');assert.deepEqual(await readdir(f.destination),['publication-failure.json']);assert.equal((await readFile(join(f.destination,'publication-failure.json'),'utf8')).includes('PRIVATE-CANARY'),false);
 }
});
for(const failure of ['oversized','aggregate','manifest','file-count','symlink','unallowlisted','missing'])test('failed '+failure+' cannot expose partial files through always upload',async()=>{
 const f=await fixture();await writeFile(join(f.staging,'source.json'),'source bytes that must not upload after failure');const options:any={maxBytes:1024};
 if(failure==='oversized')await writeFile(join(f.staging,'scan.json'),'X'.repeat(1025));
 if(failure==='aggregate'){options.maxBytes=1024;await writeFile(join(f.staging,'scan.json'),'X'.repeat(1000));}
 if(failure==='manifest')options.maxBytes=100;
 if(failure==='file-count')options.maxFiles=0;
 if(failure==='symlink'){await writeFile(join(f.root,'private'),'PRIVATE-CANARY');await symlink(join(f.root,'private'),join(f.staging,'scan.json'));}
 if(failure==='unallowlisted')await writeFile(join(f.staging,'private.env'),'PRIVATE-CANARY');
 const result=await publishDashboardArtifacts(failure==='missing'?join(f.root,'absent'):f.staging,f.destination,options);assert.equal(result.result,'withheld');assert.deepEqual(await readdir(f.destination),['publication-failure.json']);const receipt=await readFile(join(f.destination,'publication-failure.json'),'utf8');assert.ok(receipt.length<256);assert.ok(!receipt.includes('PRIVATE-CANARY'));assert.ok(!receipt.includes('source bytes'));assert.equal(JSON.parse(receipt).qualification,'unverified');
});
