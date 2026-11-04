import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,copyFile,rm,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';

// Exercise the actual verifier against an isolated copy of its inputs and a
// synthetic engine transport. No Docker socket or candidate binary is used.
test('Docker provenance binds authentic inputs and actual image license/NOTICE without weakening identity or worker checks',async t=>{
 const root=await mkdtemp(join(tmpdir(),'agentci-docker-provenance-'));
 const paths=['scripts/verify-native-provenance.mjs','Dockerfile','package-lock.json','deploy/security/native-components.json','deploy/security/docker-cli-vendor.mod','deploy/licenses/docker-cli-LICENSE','deploy/licenses/docker-cli-NOTICE','deploy/security/podman-client-go.mod','deploy/security/podman-client-amd64.json','deploy/security/podman-client-arm64.json','deploy/licenses/podman-LICENSE'];
 const before={PATH:process.env.PATH,AGENTCI_CONTAINER_ENGINE:process.env.AGENTCI_CONTAINER_ENGINE,AGENTCI_NATIVE_PROBE_OBSERVATION:process.env.AGENTCI_NATIVE_PROBE_OBSERVATION,AGENTCI_NATIVE_PROBE_CAPTURE:process.env.AGENTCI_NATIVE_PROBE_CAPTURE};
 try{
  for(const file of paths){await mkdir(dirname(join(root,file)),{recursive:true});await copyFile(file,join(root,file));}
  const expected=JSON.parse(await readFile(join(root,'deploy/security/native-components.json'),'utf8'));
  const {verifyNativeInputs,verifyNativeProvenance}=await import(pathToFileURL(join(root,'scripts/verify-native-provenance.mjs')).href);
  const bin=join(root,'bin');await mkdir(bin);
  const engine=join(bin,'docker');
  await writeFile(engine,`#!${process.execPath}\nconst fs=require('node:fs');fs.writeFileSync(process.env.AGENTCI_NATIVE_PROBE_CAPTURE,JSON.stringify(process.argv.slice(2)));process.stdout.write(fs.readFileSync(process.env.AGENTCI_NATIVE_PROBE_OBSERVATION));\n`);await chmod(engine,0o755);
  process.env.PATH=bin+':'+before.PATH;process.env.AGENTCI_CONTAINER_ENGINE='docker';process.env.AGENTCI_NATIVE_PROBE_OBSERVATION=join(root,'observed.json');process.env.AGENTCI_NATIVE_PROBE_CAPTURE=join(root,'probe.json');
  const observed=()=>({arch:'x64',files:expected.temporalBridge.files,dockerCli:{Version:expected.dockerCli.version,GitCommit:expected.dockerCli.sourceCommit.slice(0,7),GoVersion:expected.dockerCli.goVersion,sha256:expected.dockerCli.binarySha256.amd64,vendorManifestSha256:expected.dockerCli.vendorManifest.sha256,licenseSha256:expected.dockerCli.licenseSha256,noticeSha256:expected.dockerCli.notice.sha256}});
  const verify=async(value:any,options?:{owner?:unknown})=>{await writeFile(process.env.AGENTCI_NATIVE_PROBE_OBSERVATION!,JSON.stringify(value));return verifyNativeProvenance('sha256:'+'a'.repeat(64),options);};
  await t.test('current authenticated inputs and complete Docker proof pass',async()=>{
   await verifyNativeInputs();const result=await verify(observed());assert.equal(result.dockerCli.noticeSha256,expected.dockerCli.notice.sha256);assert.equal(result.dockerCli.licenseSha256,expected.dockerCli.licenseSha256);
   const args=JSON.parse(await readFile(process.env.AGENTCI_NATIVE_PROBE_CAPTURE!,'utf8'));assert.deepEqual(args.slice(0,6),['run','--rm','--network','none','--read-only','--entrypoint']);const probe=args.at(-1);assert.match(probe,/readFileSync\('\/licenses\/docker-cli-LICENSE'\)/);assert.match(probe,/readFileSync\('\/licenses\/docker-cli-NOTICE'\)/);
  });
  await t.test('optional owner names and labels the same sandboxed probe',async()=>{
   const owner='agentci-smoke-0123456789abcdef';await verify(observed(),{owner});const args=JSON.parse(await readFile(process.env.AGENTCI_NATIVE_PROBE_CAPTURE!,'utf8'));
   assert.deepEqual(args.slice(0,10),['run','--rm','--name',owner+'-provenance','--label','agentci.image-smoke.owner='+owner,'--network','none','--read-only','--entrypoint']);assert.equal(args[10],'node');assert.equal(args[11],'sha256:'+'a'.repeat(64));assert.equal(args[12],'-e');
   const worker:any=observed();delete worker.dockerCli;const result=await verify(worker,{owner});assert.equal(result.dockerCli,undefined);
  });
  await t.test('malformed owners fail before any engine invocation',async()=>{
   for(const owner of [null,0,{},[],['agentci-smoke-0123456789abcdef'],'','agentci-smoke-0123456789abcdef\n','agentci-smoke-0123456789ABCDEF','agentci-smoke-0123456789abcde','agentci-smoke-0123456789abcdef0','other-smoke-0123456789abcdef','agentci-smoke-0123456789abcdef --privileged']){
    await rm(process.env.AGENTCI_NATIVE_PROBE_CAPTURE!,{force:true});await assert.rejects(verify(observed(),{owner}),/Invalid native provenance owner/);await assert.rejects(readFile(process.env.AGENTCI_NATIVE_PROBE_CAPTURE!),{code:'ENOENT'});
   }
  });
  await t.test('worker without Docker remains valid; Temporal mismatch still rejects',async()=>{
   const worker:any=observed();delete worker.dockerCli;const result=await verify(worker);assert.equal(result.dockerCli,undefined);await assert.rejects(verify({...worker,files:{...worker.files,'Cargo.lock':'0'.repeat(64)}}),/Temporal native artifact provenance mismatch/);
  });
  for(const field of ['Version','GitCommit','GoVersion','sha256','vendorManifestSha256','licenseSha256','noticeSha256'])await t.test('tampered image '+field+' is rejected',async()=>{
   const value:any=observed();value.dockerCli[field]='wrong';await assert.rejects(verify(value),/Docker native artifact\/source inventory provenance mismatch/);
  });
  for(const field of ['licenseSha256','noticeSha256'])await t.test('missing image '+field+' is rejected',async()=>{
   const value:any=observed();delete value.dockerCli[field];await assert.rejects(verify(value),/Docker native artifact\/source inventory provenance mismatch/);
  });
  for(const file of ['deploy/licenses/docker-cli-LICENSE','deploy/licenses/docker-cli-NOTICE'])await t.test('tampered and missing source '+file+' is rejected',async()=>{
   const path=join(root,file),bytes=await readFile(path);try{await writeFile(path,'tampered');await assert.rejects(verifyNativeInputs(),/Docker license\/NOTICE provenance mismatch/);await rm(path);await assert.rejects(verifyNativeInputs(),{code:'ENOENT'});}finally{await writeFile(path,bytes);}
  });
 }finally{
  for(const [key,value] of Object.entries(before)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  await rm(root,{recursive:true,force:true});
 }
});
