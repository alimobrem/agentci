import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm,symlink,chmod,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
// @ts-expect-error operational ESM Python provenance
import {pythonEngineRequirements,pythonEngineProbe,validatePythonEngineProvenance,pythonEngineTestContext,retainPythonEngineProvenance} from '../scripts/lib/python-engine-provenance.mjs';

const components=JSON.parse(await readFile('deploy/security/python-engine-components.json','utf8'));
const requirements=await readFile('deploy/engines/deepeval/requirements.txt','utf8');
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
const clone=<T>(value:T):T=>structuredClone(value);
function receipt(arch:string){
 const aiohttp=components.packages.find((p:any)=>p.name==='aiohttp').selectedWheelStaticProof.find((w:any)=>w.platform==='linux/'+arch),certifi=components.packages.find((p:any)=>p.name==='certifi').selectedWheelStaticProof[0];
 const files=[...aiohttp.nativeExtensions,...aiohttp.licenses,...aiohttp.metadata,...certifi.licenses,...certifi.metadata,{path:'certifi/cacert.pem',bytes:238856,sha256:'50f79f98dac192b20dbf73f35c56f0b0c557ab267ff5199d1117cc1180b70785'}].map(({path,bytes,sha256,machine}:any)=>({path,bytes,sha256,machine:machine??null})).sort((a,b)=>a.path.localeCompare(b.path));
 return {schemaVersion:1,kind:'installed-optional-python-provenance',requirementsSha256:sha(requirements),pythonVersion:'3.14.8',implementation:'cpython',abi:'cp314',freeThreaded:false,platform:'linux/'+arch,uid:1001,packages:pythonEngineRequirements(requirements,components),dependencyClosure:{method:'installed-default-marker-requirements',checkedRequirements:100,unmet:0},files,importedExtensions:files.filter(f=>f.machine!==null).map(f=>({name:f.path.split('.cpython-314-')[0]!.replaceAll('/','.'),path:f.path})),defaultCParserSelected:true,certifiAnchors:120,removedAnchorsPresent:[]};
}

test('exact two-pin update retains61dependencies,59original lines and the complete official wheel hash sets',()=>{
 const parsed=pythonEngineRequirements(requirements,components);assert.equal(parsed.length,61);assert.deepEqual(parsed.filter((p:any)=>['aiohttp','certifi'].includes(p.name)),[{name:'aiohttp',version:'3.14.4'},{name:'certifi',version:'2026.10.19'}]);
 const aiohttp=components.packages.find((p:any)=>p.name==='aiohttp'),certifi=components.packages.find((p:any)=>p.name==='certifi');assert.equal(aiohttp.wheelHashes.length,160);assert.equal(certifi.wheelHashes.length,1);assert.equal(aiohttp.wheelHashesSha256,'f8451093d626740a91a483f150d878ddf1b7802072d91126642c61d146d04058');assert.equal(certifi.wheelHashes[0],'42d35340cc5b9ba78e818ddbff0c5b1c2b779de448a340fd1b989f5fa8670e1b');assert.equal(parsed.find((p:any)=>p.name==='yarl').version,'1.25.1');assert.deepEqual(components.requirements.installPolicy,['--require-hashes','--only-binary=:all:']);
});

test('hash-only parser rejects changed unrelated pins, old versions, absent/extra hashes and source/install directives',()=>{
 const changes=[requirements.replace('yarl==1.25.1','yarl==1.25.2'),requirements.replace('aiohttp==3.14.4','aiohttp==3.14.3'),requirements.replace(/ --hash=sha256:[a-f0-9]{64}/,''),requirements+'--extra-index-url https://invalid.example\n',requirements+'aiohttp @ https://invalid.example/archive.tar.gz\n',requirements.replace('certifi==2026.10.19','certifi==2026.10.19 --no-binary=:all:'),requirements+requirements.split('\n').find(l=>l.startsWith('certifi=='))+'\n'];
 for(const text of changes){const record=clone(components);record.requirements.sha256=sha(text);assert.throws(()=>pythonEngineRequirements(text,record));}
 for(const mutate of [(v:any)=>v.packages[0].wheelHashes.pop(),(v:any)=>v.packages[0].wheelHashes[0]='0'.repeat(64),(v:any)=>v.requirements.unchangedDependencyLinesSha256='0'.repeat(64),(v:any)=>v.packages[0].version=['3.14.4']]){const record=clone(components);mutate(record);assert.throws(()=>pythonEngineRequirements(requirements,record));}
});

test('static wheel/native/license and certifi trust records preserve exact authenticated scope without claiming an install',()=>{
 assert.equal(components.runtimeAcceptance,'not-performed');assert.equal(components.aggregateM3Acceptance,false);
 const aiohttp=components.packages.find((p:any)=>p.name==='aiohttp'),certifi=components.packages.find((p:any)=>p.name==='certifi');
 const hashes={'linux/amd64':'fb22c8e4b60385a9b414c70c6e8b2d0f4b23ff7fc4bb572ceb58297b228169f1','linux/arm64':'f8f61a9b5fa56c58e3441f9dc64137f786232d40fb89127190d0e0f84e1e5865'};
 for(const wheel of aiohttp.selectedWheelStaticProof){assert.equal(wheel.sha256,hashes[wheel.platform as keyof typeof hashes]);assert.equal(wheel.nativeExtensions.length,4);assert.ok(wheel.nativeExtensions.every((f:any)=>f.machine===(wheel.platform==='linux/amd64'?62:183)));assert.deepEqual(wheel.licenses.map((f:any)=>f.sha256),['2e4be5fc6c4c72a466fcb665d726e049a6891981fe536c4f04b6366749461d23','628168d68bb5a8a17e0bbefb3bd74e326e1edc20583d76f52f457c82c921867d']);}
 assert.equal(certifi.selectedWheelStaticProof[0].licenses[0].sha256,'e93716da6b9c0d5a4a1df60fe695b370f0695603d21f6f83f053e42cfc10caf7');assert.equal(components.certifiTrust.previous.certificates,121);assert.equal(components.certifiTrust.current.certificates,120);assert.equal(components.certifiTrust.current.bundleSha256,'50f79f98dac192b20dbf73f35c56f0b0c557ab267ff5199d1117cc1180b70785');assert.deepEqual(components.certifiTrust.added,[]);assert.deepEqual(components.certifiTrust.removed.map((v:any)=>v.derSha256),['86a1ecba089c4a8d3bbe2734c612ba341d813e043cf9e8a862cd5c57a36bbe6b']);
});

test('installed provenance requires both native platform identities, actual C parser, all61versions and authentic bundle/notices',()=>{
 for(const arch of ['amd64','arm64']){const valid=receipt(arch);validatePythonEngineProvenance(valid,components,requirements);for(const mutate of [(v:any)=>v.pythonVersion='3.14.9',(v:any)=>v.abi='cp314t',(v:any)=>v.freeThreaded=true,(v:any)=>v.uid=0,(v:any)=>v.platform='darwin/'+arch,(v:any)=>v.packages.find((p:any)=>p.name==='aiohttp').version='3.14.3',(v:any)=>v.files.find((f:any)=>f.machine!==null).machine=0,(v:any)=>v.files.find((f:any)=>f.path==='certifi/cacert.pem').sha256='0'.repeat(64),(v:any)=>v.files.find((f:any)=>f.path.endsWith('licenses/LICENSE')).bytes=0,(v:any)=>v.importedExtensions.pop(),(v:any)=>v.defaultCParserSelected=false,(v:any)=>v.certifiAnchors=121,(v:any)=>v.removedAnchorsPresent=['86a1ecba089c4a8d3bbe2734c612ba341d813e043cf9e8a862cd5c57a36bbe6b'],(v:any)=>v.dependencyClosure.unmet=1,(v:any)=>v.dependencyClosure.checkedRequirements=0,(v:any)=>v.private='PRIVATE-CANARY']){const bad=clone(valid);mutate(bad);assert.throws(()=>validatePythonEngineProvenance(bad,components,requirements));}}
 const swapped=receipt('amd64');swapped.platform='linux/arm64';assert.throws(()=>validatePythonEngineProvenance(swapped,components,requirements));
});

test('unchanged Docker/runtime/npm/Promptfoo inputs retain exact recorded hashes and both pip security flags',async()=>{
 for(const input of components.untouchedInputs){const bytes=await readFile(input.path);assert.equal(bytes.length,input.bytes,input.path);assert.equal(createHash('sha256').update(bytes).digest('hex'),input.sha256,input.path);}
 const dockerfile=await readFile('Dockerfile','utf8');assert.match(dockerfile,/pip install --require-hashes --only-binary=:all:/);assert.match(dockerfile,/COPY --from=eval-engines-build \/opt\/python \/opt\/python/);
 const program=pythonEngineProbe(components,requirements);assert.ok(program.includes('path.stat().st_size'));assert.ok(program.includes("pathlib.Path('python-provenance.json')"));assert.ok(!program.includes('os.environ'));assert.ok(!program.includes('CERT_NONE'));assert.ok(!program.includes('urlopen'));
});

test('optional native test identities validate the complete UUID pair and exact smoke owner before engine use',async()=>{
 const defaults=await pythonEngineTestContext({}),next=await pythonEngineTestContext({});assert.notEqual(defaults.ownership.unitId,next.ownership.unitId);assert.notEqual(defaults.ownership.leaseToken,next.ownership.leaseToken);assert.notEqual(defaults.smokeOwner,next.smokeOwner);assert.equal(defaults.artifactRoot,null);
 const unit='11111111-1111-4111-8111-111111111111',lease='22222222-2222-4222-8222-222222222222',owner='agentci-smoke-'+'a'.repeat(16),base={AGENTCI_TEST_ENGINES_UNIT_ID:unit,AGENTCI_TEST_ENGINES_LEASE_TOKEN:lease,AGENTCI_TEST_ENGINES_SMOKE_OWNER:owner};
 assert.deepEqual((await pythonEngineTestContext(base)).ownership,{unitId:unit,leaseToken:lease});
 for(const environment of [{AGENTCI_TEST_ENGINES_UNIT_ID:unit},{AGENTCI_TEST_ENGINES_LEASE_TOKEN:lease},{...base,AGENTCI_TEST_ENGINES_UNIT_ID:[unit]},{...base,AGENTCI_TEST_ENGINES_UNIT_ID:unit+'\n'},{...base,AGENTCI_TEST_ENGINES_LEASE_TOKEN:lease+'\n'},{...base,AGENTCI_TEST_ENGINES_LEASE_TOKEN:'not-uuid'},{...base,AGENTCI_TEST_ENGINES_SMOKE_OWNER:[owner]},{...base,AGENTCI_TEST_ENGINES_SMOKE_OWNER:owner+'\n'}])await assert.rejects(pythonEngineTestContext(environment));
});

test('strict installed receipt output is exclusive and confined to the existing owned artifact root',async()=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'python-engine-receipt-'))),artifactRoot=join(root,'.agentci/artifacts/eval-engines-native');
 try{await mkdir(artifactRoot,{recursive:true,mode:0o700});const context=await pythonEngineTestContext({AGENTCI_TEST_ENGINES_ARTIFACT_ROOT:artifactRoot},{root});const installed=receipt('amd64');assert.equal(await retainPythonEngineProvenance(installed,components,requirements,{artifactRoot:context.artifactRoot,root}),true);const text=await readFile(join(artifactRoot,'python-installed-provenance.json'),'utf8');assert.deepEqual(JSON.parse(text),installed);assert.ok(!text.includes(context.ownership.leaseToken));await assert.rejects(retainPythonEngineProvenance(installed,components,requirements,{artifactRoot,root}),{code:'EEXIST'});
  for(const path of [root,artifactRoot+'/../eval-engines-native','relative','/tmp/python-installed-provenance.json'])await assert.rejects(pythonEngineTestContext({AGENTCI_TEST_ENGINES_ARTIFACT_ROOT:path},{root}));
  await chmod(artifactRoot,0o777);await assert.rejects(pythonEngineTestContext({AGENTCI_TEST_ENGINES_ARTIFACT_ROOT:artifactRoot},{root}));await chmod(artifactRoot,0o700);await rm(artifactRoot,{recursive:true});const foreign=join(root,'foreign');await mkdir(foreign);await symlink(foreign,artifactRoot);await assert.rejects(pythonEngineTestContext({AGENTCI_TEST_ENGINES_ARTIFACT_ROOT:artifactRoot},{root}));assert.equal(await retainPythonEngineProvenance(installed,components,requirements,{artifactRoot:null,root}),false);
 }finally{await rm(root,{recursive:true,force:true});}
});
