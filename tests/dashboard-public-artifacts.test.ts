import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,symlink} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';
// @ts-ignore Native CI publication boundary uses only Node builtins.
import {publishDashboardArtifacts} from '../scripts/lib/dashboard-public-artifacts.mjs';
async function fixture(){const root=await mkdtemp(join(tmpdir(),'dashboard-public-test-')),staging=join(root,'staging'),destination=join(root,'public');await mkdir(staging);return {root,staging,destination};}
test('public publication preserves exact member bytes/hashes and counts the manifest inside the cap',async()=>{
 const f=await fixture(),bytes=Buffer.from('{"source":"exact"}\n');await writeFile(join(f.staging,'source.json'),bytes);
 const result=await publishDashboardArtifacts(f.staging,f.destination,{maxBytes:1024});assert.equal(result.result,'published');
 const manifest=JSON.parse(await readFile(join(f.destination,'artifact-manifest.json'),'utf8'));assert.deepEqual(manifest.files,[{path:'source.json',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}]);assert.deepEqual(await readFile(join(f.destination,'source.json')),bytes);assert.ok(result.bytes<=1024);
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
