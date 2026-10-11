import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import {parse} from 'yaml';

test('Compose API and consumer share pinned read-only authority while released deployment stays disabled',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'agentci-reproduction-compose-'));
 try{
  const envFile=join(dir,'fixture.env'),runtimeEnv=join(dir,'runtime.env'),catalog=join(dir,'catalog.json'),keyFile=join(dir,'app.pem'),reviewers=join(dir,'reviewers.json');
  const values={POSTGRES_PASSWORD:'fixture-only',GITHUB_PRIVATE_KEY_FILE:keyFile,AGENTCI_OPERATOR_TOKEN:'operator-fixture-only',AGENTCI_REVIEWER_CONFIG_FILE:reviewers,AGENTCI_REPRODUCTION_CATALOG_FILE:catalog,AGENTCI_REPRODUCTION_CATALOG_DIGEST:'sha256:'+'a'.repeat(64),AGENTCI_REPRODUCTION_CONFIG_REVISION:'1',AGENTCI_REPRODUCTION_CONFIG_DIGEST:'sha256:'+'b'.repeat(64),AGENTCI_CURSOR_KEY:'k'.repeat(40)};
  await writeFile(catalog,'{}');await writeFile(keyFile,'fixture-only');await writeFile(reviewers,'{}');await writeFile(runtimeEnv,'');
  const writeEnvironment=async(omit?:string,empty=false)=>writeFile(envFile,Object.entries(values).filter(([key])=>empty||key!==omit).map(([key,value])=>`${key}=${empty&&key===omit?'':value}\n`).join(''));
  await writeEnvironment();
  const packageRoot=process.env.AGENTCI_TEST_CLIENT_PACKAGE_ROOT??resolve('.');
  const overlay=parse(readFileSync(join(packageRoot,'deploy/reproduction.compose.yaml'),'utf8'));
  for(const role of ['api','worker']){const mount=overlay.services[role].volumes.find((v:any)=>v.target==='/run/agentci/reproduction-catalog.json');assert.equal(mount.bind.create_host_path,false);}
  const base=['compose','--env-file',envFile,'-f',join(packageRoot,'deploy/compose.yaml')];
  const environment={PATH:process.env.PATH,HOME:process.env.HOME,DOCKER_CONFIG:process.env.DOCKER_CONFIG,AGENTCI_ENV_FILE:runtimeEnv};
  const render=(overlay=false)=>JSON.parse(execFileSync('docker',[...base,...(overlay?['-f',join(packageRoot,'deploy/reproduction.compose.yaml')]:[]),'config','--format','json'],{env:environment,encoding:'utf8',stdio:'pipe'}));
  const plain=render();
  for(const role of ['api','worker']){
   assert.equal(plain.services[role].image,`agentci-${role}:0.3.1-m2`);
   assert.ok(!plain.services[role].volumes?.some((v:any)=>v.target==='/run/agentci/reproduction-catalog.json'));
   assert.equal(plain.services[role].environment.AGENTCI_REPRODUCTION_CATALOG_FILE,undefined);
  }
  const merged=render(true);
  for(const role of ['api','worker']){
   const service=merged.services[role];
   assert.equal(service.image,`agentci-${role}:0.4.0-m3-dev.1`);
   for(const key of ['AGENTCI_REPRODUCTION_CATALOG_DIGEST','AGENTCI_REPRODUCTION_CONFIG_REVISION','AGENTCI_REPRODUCTION_CONFIG_DIGEST','AGENTCI_CURSOR_KEY'])assert.equal(service.environment[key],values[key as keyof typeof values]);
   assert.equal(service.environment.AGENTCI_REPRODUCTION_CATALOG_FILE,'/run/agentci/reproduction-catalog.json');
   const mount=service.volumes.find((v:any)=>v.target==='/run/agentci/reproduction-catalog.json');
   assert.equal(mount.source,catalog);assert.equal(mount.read_only,true);assert.equal(mount.bind.create_host_path??false,false);
   assert.ok(!service.privileged);
   assert.ok(!service.volumes.some((v:any)=>/docker\.sock|podman\.sock/.test(v.source)));
  }
  const appMount=merged.services.api.volumes.find((v:any)=>v.target==='/run/secrets/github-app.pem');
  assert.equal(appMount.source,keyFile);assert.equal(appMount.read_only,true);assert.equal(appMount.bind.create_host_path??false,false);
  assert.equal(merged.services.api.environment.AGENTCI_OPERATOR_TOKEN,values.AGENTCI_OPERATOR_TOKEN);
  for(const key of ['OPENAI_API_KEY','ANTHROPIC_API_KEY','XAI_API_KEY'])assert.equal(merged.services.api.environment[key],'');
  const combined=JSON.parse(execFileSync('docker',[...base,'-f',join(packageRoot,'deploy/reviewer.compose.yaml'),'-f',join(packageRoot,'deploy/reproduction.compose.yaml'),'config','--format','json'],{env:environment,encoding:'utf8',stdio:'pipe'}));
  for(const role of ['api','worker']){
   assert.equal(combined.services[role].environment.AGENTCI_REVIEWER_CONFIG_FILE,'/run/agentci/reviewers.json');
   assert.deepEqual(combined.services[role].volumes.filter((v:any)=>v.target==='/run/agentci/reproduction-catalog.json'),merged.services[role].volumes.filter((v:any)=>v.target==='/run/agentci/reproduction-catalog.json'));
   for(const key of Object.keys(merged.services[role].environment).filter(key=>key.startsWith('AGENTCI_REPRODUCTION_')))assert.equal(combined.services[role].environment[key],merged.services[role].environment[key]);
  }
  assert.deepEqual(merged.services.postgres,plain.services.postgres);
  assert.deepEqual(merged.services.temporal,plain.services.temporal);
  for(const key of ['AGENTCI_REPRODUCTION_CATALOG_FILE','AGENTCI_REPRODUCTION_CATALOG_DIGEST','AGENTCI_REPRODUCTION_CONFIG_REVISION','AGENTCI_REPRODUCTION_CONFIG_DIGEST','AGENTCI_CURSOR_KEY','AGENTCI_OPERATOR_TOKEN','GITHUB_PRIVATE_KEY_FILE']){
   for(const empty of [false,true]){
    await writeEnvironment(key,empty);
    assert.throws(()=>render(true),(error:any)=>error.status!==0&&error.stderr.toString().includes(key),`${key} missing/empty must fail before startup`);
   }
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
