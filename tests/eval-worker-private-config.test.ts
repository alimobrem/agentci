import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import privateFs,{mkdtemp,mkdir,readFile,writeFile,lstat,chmod,symlink,link,rm,unlink} from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Client} from 'pg';
import {parse} from 'yaml';
import {evalWorkerConfig} from '../apps/eval-worker/config.ts';
// @ts-expect-error Fixture-only JavaScript helper is exercised directly, without Docker.
import {createEvalWorkerPrivateConfig,EVAL_FIXTURE_SCOPE,evalFixtureDatabaseUrl,evalFixtureRestrictedRoleSql,serializePrivateEnvironment,writePrivateFixtureFile} from '../scripts/lib/eval-worker-private-config.mjs';
// @ts-expect-error Existing private-state cleanup is exercised with a data-only engine transport.
import {cleanupImageSmokeState} from '../scripts/lib/image-smoke-state.mjs';

const runnerImage='sha256:'+'a'.repeat(64),workerImage='sha256:'+'b'.repeat(64),owner='agentci-smoke-0123456789abcdef';
const parseEnvironment=(content:string)=>new Map(content.trimEnd().split('\n').map(line=>{const at=line.indexOf('=');return [line.slice(0,at),line.slice(at+1)];}));
type ConnectionIdentity={host:string;port:number;user:string;database:string;password:string};
// pg's runtime parser result is not exposed in its declaration; no socket is opened.
const parameters=(url:string)=>(new Client({connectionString:url})as Client&{connectionParameters:ConnectionIdentity}).connectionParameters;
const composeInputs=()=>({environment:{PATH:'/usr/bin',DOCKER_CONTEXT:'inherited-context'},endpoint:'unix:///run/user/1000/podman/podman.sock',socket:'/run/user/1000/podman/podman.sock',socketGid:'1000',workerImage,runnerImage,remoteShared:'/private/shared',owner});
const invalid=(operation:()=>unknown)=>assert.throws(operation,(error:unknown)=>error instanceof Error&&error.message==='Invalid private evaluator fixture configuration');
// A failed equality assertion must never disclose either private operand in TAP output.
const samePrivate=(actual:unknown,expected:unknown)=>assert.ok(Object.is(actual,expected),'Private fixture values differ');

test('fresh fixture credentials remain independent across roles and attempts and never serialize publicly',()=>{
 const seen=new Set<string>();
 for(let i=0;i<12;i++){
  const config=createEvalWorkerPrivateConfig(),bootstrap=config.postgresEnvironment().get('POSTGRES_PASSWORD'),admin=parameters(config.administratorUrl(54321));
  const worker=parameters(config.workerEnvironment({engine:'docker',runnerImage}).get('AGENTCI_EVAL_DATABASE_URL'));
  for(const value of [bootstrap,worker.password]){assert.ok(typeof value==='string'&&/^[a-f0-9]{64}$/.test(value));assert.ok(!seen.has(value));seen.add(value);assert.ok(!JSON.stringify(config).includes(value));}
  samePrivate(admin.password,bootstrap);assert.ok(admin.password!==worker.password);assert.equal(admin.user,'postgres');assert.equal(admin.host,'127.0.0.1');assert.equal(admin.port,54321);assert.equal(admin.database,'agentci');
  assert.equal(worker.user,'eval_image');assert.equal(worker.host,'postgres');assert.equal(worker.port,5432);assert.equal(worker.database,'agentci');
  assert.ok(Object.isFrozen(config)&&Object.isFrozen(config.scope));
 }
 assert.equal(seen.size,24);
});

test('standard PG query URL setters roundtrip delimiters and Unicode with the installed real client parser',()=>{
 const authentication=randomBytes(32).toString('hex')+':/@?&=#% +\'\\$é雪';
 for(const [host,port,user]of [['127.0.0.1',49152,'postgres'],['postgres',5432,'eval_image']]as const){
  const url=evalFixtureDatabaseUrl({host,port,user,credential:authentication}),parsed=parameters(url),transport=new URL(url);
  samePrivate(parsed.password,authentication);assert.equal(parsed.user,user);assert.equal(parsed.host,host);assert.equal(parsed.port,port);assert.equal(parsed.database,'agentci');
  assert.equal(transport.username,'');assert.equal(transport.password,'');assert.equal(transport.hash,'');assert.deepEqual([...transport.searchParams.keys()],['user','password']);assert.ok(!url.includes(authentication));
  // These are the former userinfo transport's complete parsed connection semantics.
  // The real client resolves query authentication to the same identity without a connection.
 }
});

test('role construction preserves exact restricted privileges and escapes SQL literal boundaries',()=>{
 const config=createEvalWorkerPrivateConfig(),worker=parameters(config.workerEnvironment({engine:'docker',runnerImage}).get('AGENTCI_EVAL_DATABASE_URL'));
 const prefix='CREATE ROLE eval_image LOGIN PASSWORD ',suffix=' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS IN ROLE agentci_eval_executor';
 const statement=config.restrictedRoleSql();assert.ok(statement.startsWith(prefix)&&statement.endsWith(suffix));assert.ok(statement.slice(prefix.length,-suffix.length)==="'"+worker.password+"'");
 const authentication=randomBytes(32).toString('hex')+"'\\; ALTER ROLE eval_image SUPERUSER; --";
 const escaped=evalFixtureRestrictedRoleSql(authentication).slice(prefix.length,-suffix.length);
 assert.ok(escaped.startsWith(" E'")&&escaped.endsWith("'"));
 const decoded=escaped.slice(3,-1).replace(/''|\\\\/g,(pair:string)=>pair==="''"?"'":'\\');assert.ok(decoded===authentication);
 assert.ok(!config.restrictedRoleSql().includes(parameters(config.administratorUrl(54321)).password));
});

test('native environment roundtrips literal values and the actual worker config admits only restricted scope',async()=>{
 const config=createEvalWorkerPrivateConfig();
 for(const engine of ['docker','podman']){
  const values=config.workerEnvironment({engine,runnerImage}),decoded=parseEnvironment(serializePrivateEnvironment(values));assert.ok(JSON.stringify([...values])===JSON.stringify([...decoded]));
  assert.deepEqual([...values.keys()],['AGENTCI_CONTAINER_ENGINE','CONTAINER_HOST','DOCKER_HOST','AGENTCI_REPOSITORY','AGENTCI_ORGANIZATION_ID','AGENTCI_EVAL_DATABASE_URL','TEMPORAL_ADDRESS','AGENTCI_EVAL_RUNNER_IMAGE']);
  const actual=await evalWorkerConfig(Object.fromEntries(decoded));assert.equal(actual.repository,EVAL_FIXTURE_SCOPE.repository);assert.equal(actual.organizationId,EVAL_FIXTURE_SCOPE.organization);assert.equal(actual.temporalAddress,'temporal:7233');assert.equal(actual.policyFor('command').engine,engine);
  assert.equal(values.get('CONTAINER_HOST'),'unix:///run/agentci/engine.sock');assert.equal(values.get('DOCKER_HOST'),'unix:///run/agentci/engine.sock');
  assert.ok(!serializePrivateEnvironment(values).includes(config.postgresEnvironment().get('POSTGRES_PASSWORD')));
 }
 const literal=randomBytes(32).toString('hex')+'= #$\\"\'雪';
 assert.ok(parseEnvironment(serializePrivateEnvironment(new Map([['PGPASSWORD',literal]]))).get('PGPASSWORD')===literal);
});

test('Compose and native configuration share the same restricted identity, Temporal and fixed topology',async()=>{
 const config=createEvalWorkerPrivateConfig(),inputs=composeInputs(),env=config.composeEnvironment(inputs),native=config.workerEnvironment({engine:'podman',runnerImage});
 const actual=parse(await readFile('deploy/eval-worker.compose.yaml','utf8')).services['eval-worker'].environment;
 const interpolate=(value:string)=>value.replace(/\$\{([A-Z0-9_]+)(?::\?[^}]*|:-([^}]*))?\}/g,(_whole,key,fallback)=>env[key]??fallback??'');
 const service=Object.fromEntries(Object.entries(actual).map(([key,value])=>[key,interpolate(String(value))]));
 assert.equal(service.AGENTCI_EVAL_PROVIDERS_FILE,'/run/secrets/eval-providers.json');
 const mount=await mkdtemp(join(tmpdir(),'agentci-private-config-mount-'));
 try{
  // Materialize the declared read-only bind source locally instead of touching /run/secrets.
  const provider=await writePrivateFixtureFile(mount,owner+'-providers.json','[]\n');
  const scoped=await evalWorkerConfig({...service,AGENTCI_EVAL_PROVIDERS_FILE:provider});assert.equal(scoped.policyFor('command').engine,'podman');assert.equal(scoped.temporalAddress,'temporal:7233');samePrivate(scoped.databaseUrl,native.get('AGENTCI_EVAL_DATABASE_URL'));
  const parsed=parameters(scoped.databaseUrl);samePrivate(parsed.password,env.AGENTCI_EVAL_PGPASSWORD);assert.equal(parsed.user,env.AGENTCI_EVAL_PGUSER);assert.equal(parsed.user,'eval_image');
 }finally{await rm(mount,{recursive:true,force:true});}
 assert.equal(env.DOCKER_CONTEXT,'');assert.equal(env.AGENTCI_EVAL_ENGINES_IMAGE,'');assert.equal(env.DOCKER_HOST,inputs.endpoint);assert.equal(env.PATH,inputs.environment.PATH);assert.equal(env.AGENTCI_CONTROLLER_NETWORK,owner);assert.equal(env.AGENTCI_EVAL_PROVIDERS_FILE,join(inputs.remoteShared,owner+'-providers.json'));
 assert.equal(env.AGENTCI_CONTAINER_SOCKET_PATH,inputs.socket);assert.equal(env.AGENTCI_CONTAINER_SOCKET_GID,'1000');assert.equal(env.AGENTCI_EVAL_WORKER_IMAGE,workerImage);assert.equal(env.AGENTCI_EVAL_RUNNER_IMAGE,runnerImage);
 assert.ok(!JSON.stringify(env).includes(config.postgresEnvironment().get('POSTGRES_PASSWORD')));
});

test('invalid URL, credential and environment inputs fail with fixed non-disclosing errors',()=>{
 const authentication=randomBytes(32).toString('hex');
 for(const credential of ['',null,0,{},[],authentication+'\nINJECT=value',authentication+'\r',authentication+'\0',authentication+'\u007f','x'.repeat(1025),'\ud800']){
  invalid(()=>evalFixtureDatabaseUrl({host:'postgres',port:5432,user:'eval_image',credential}));invalid(()=>evalFixtureRestrictedRoleSql(credential));
 }
 for(const change of [{host:'elsewhere'},{host:['postgres']},{user:'postgres; DROP ROLE eval_image'},{user:'agentci_eval_executor'},{port:'5432'},{port:0},{port:65536},{port:NaN}])invalid(()=>evalFixtureDatabaseUrl({host:'postgres',port:5432,user:'eval_image',credential:authentication,...change}));
 for(const values of [{},[],new Map(),new Map([['PGPASSWORD\n',authentication]]),new Map([['bad-key',authentication]]),new Map([['PGPASSWORD',authentication+'\nINJECT=value']]),new Map([['PGPASSWORD',null]]),new Map([['PGPASSWORD',['synthetic']]]),new Map([['PGPASSWORD','\ud800']]),new Map(Array.from({length:65},(_,i)=>['FIELD_'+i,'x'])),new Map(Array.from({length:10},(_,i)=>['FIELD_'+i,'x'.repeat(8192)]))])invalid(()=>serializePrivateEnvironment(values));
 try{serializePrivateEnvironment(new Map([['PGPASSWORD',authentication+'\n']]));assert.fail('unsafe value admitted');}catch(error){assert.ok(error instanceof Error&&!error.message.includes(authentication)&&!String(error.stack).includes(authentication));}
});

test('unsafe Compose/engine inputs are rejected before any private file or process operation',()=>{
 const config=createEvalWorkerPrivateConfig();
 for(const engine of ['',null,['docker'],'docker --privileged'])invalid(()=>config.workerEnvironment({engine,runnerImage}));
 for(const value of ['runner:latest','sha256:'+'a'.repeat(64)+'\n',null,{},['sha256:'+'a'.repeat(64)]])invalid(()=>config.workerEnvironment({engine:'docker',runnerImage:value}));
 for(const change of [{environment:null},{endpoint:'tcp://public.example:2375'},{endpoint:'unix:///run/../socket'},{socket:'/tmp/socket\n'},{socketGid:['1000']},{socketGid:'1000\n'},{socketGid:'-1'},{remoteShared:'relative'},{remoteShared:'/private/../shared'},{owner:owner+'\n'},{workerImage:'image:latest'},{runnerImage:'runner:latest'}])invalid(()=>config.composeEnvironment({...composeInputs(),...change}));
});

test('private fixture files are exclusive0600 in owned0700 directories and existing cleanup removes the entire fixture',async()=>{
 const root=await mkdtemp(join(tmpdir(),'agentci-image-smoke-')),config=createEvalWorkerPrivateConfig();
 try{
  await chmod(root,0o700);const path=await writePrivateFixtureFile(root,'postgres.env',serializePrivateEnvironment(config.postgresEnvironment()));
  const info=await lstat(path);assert.equal(info.mode&0o777,0o600);assert.equal(info.nlink,1);assert.ok(info.isFile());assert.ok(parseEnvironment(await readFile(path,'utf8')).get('POSTGRES_PASSWORD')===parameters(config.administratorUrl(54321)).password);
  const worker=await writePrivateFixtureFile(root,'worker.env',serializePrivateEnvironment(config.workerEnvironment({engine:'docker',runnerImage})));assert.equal((await lstat(worker)).mode&0o777,0o600);
  const state=await writePrivateFixtureFile(root,'ownership.json',JSON.stringify({schemaVersion:1,owner}));
  const receipt=await cleanupImageSmokeState(state,{command:()=>''});assert.equal(receipt.result,'passed');assert.equal(receipt.privateFilesRemoved,true);assert.equal(receipt.ownedContainers,0);assert.equal(receipt.ownedNetworks,0);assert.equal(receipt.ownedVolumes,0);await assert.rejects(lstat(root),{code:'ENOENT'});
 }finally{await rm(root,{recursive:true,force:true});await rm(root+'.cleanup.json',{force:true});}
});

test('private file isolation rejects unsafe paths, links, unsafe directories, oversized writes and overwrites without disclosure',async()=>{
 const root=await mkdtemp(join(tmpdir(),'agentci-private-config-test-')),privateRoot=join(root,'private'),outside=join(root,'outside.env'),authentication=randomBytes(32).toString('hex');
 const reject=(directory:unknown,name:unknown,content:unknown)=>assert.rejects(writePrivateFixtureFile(directory,name,content),(error:unknown)=>error instanceof Error&&error.message==='Private evaluator fixture file operation failed'&&!String(error.stack).includes(authentication));
 try{
  await mkdir(privateRoot,{mode:0o700});await writeFile(outside,'unchanged',{mode:0o600});
  for(const name of ['../outside.env','/outside.env','unsafe.env\n','nested/file.env','.env','credential.txt'])await reject(privateRoot,name,authentication);
  await reject('relative','worker.env',authentication);await reject(privateRoot,'worker.env','x'.repeat(65537));await reject(privateRoot,'worker.env','\ud800');
  await symlink(outside,join(privateRoot,'linked.env'));await reject(privateRoot,'linked.env',authentication);
  await link(outside,join(privateRoot,'hardlink.env'));await reject(privateRoot,'hardlink.env',authentication);
  await symlink(privateRoot,join(root,'linked-directory'));await reject(join(root,'linked-directory'),'worker.env',authentication);
  const original=await writePrivateFixtureFile(privateRoot,'existing.env','unchanged');await reject(privateRoot,'existing.env',authentication);assert.equal(await readFile(original,'utf8'),'unchanged');
  await chmod(privateRoot,0o755);await reject(privateRoot,'worker.env',authentication);await chmod(privateRoot,0o700);
  assert.equal(await readFile(outside,'utf8'),'unchanged');
 }finally{await rm(root,{recursive:true,force:true});}
 await assert.rejects(lstat(root),{code:'ENOENT'});
});

test('failed private writes remove only their own created inode and redact underlying errors',async()=>{
 const root=await mkdtemp(join(tmpdir(),'agentci-private-config-failure-')),original=privateFs.open,authentication=randomBytes(32).toString('hex');
 try{
  for(const replacement of [false,true]){
   const path=join(root,'failure.env');
   privateFs.open=(async(...args:Parameters<typeof original>)=>{
    const handle=await original(...args);
    return new Proxy(handle,{get(target,key){
     if(key==='writeFile')return async(content:string)=>{await target.writeFile(content);if(replacement){await unlink(path);await writeFile(path,'unrelated-replacement',{mode:0o600});}throw Error(authentication);};
     const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
    }});
   })as typeof original;
   syncBuiltinESMExports();
   await assert.rejects(writePrivateFixtureFile(root,'failure.env',authentication),(error:unknown)=>error instanceof Error&&error.message==='Private evaluator fixture file operation failed'&&!String(error.stack).includes(authentication));
   if(replacement){assert.equal(await readFile(path,'utf8'),'unrelated-replacement');await unlink(path);}else await assert.rejects(lstat(path),{code:'ENOENT'});
  }
 }finally{privateFs.open=original;syncBuiltinESMExports();await rm(root,{recursive:true,force:true});}
});
