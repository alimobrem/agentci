import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,lstat,access,symlink} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {Writable,Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {spawnSync,spawn} from 'node:child_process';
import {parse} from 'yaml';
// @ts-expect-error operational ESM
import {startCustomerDatabase,stopCustomerDatabase,CUSTOMER_POSTGRES_IMAGE} from '../scripts/lib/customer-ci-database.mjs';
// @ts-expect-error operational ESM
import {credentialOutput} from '../scripts/lib/credential-output.mjs';
// @ts-expect-error operational ESM
import {runWithDatabase,redactIntegrationArtifact,requireDatabaseCommandsStopped} from '../scripts/lib/ci-database-command.mjs';
// @ts-expect-error operational ESM
import {cleanupSmokeResources,SMOKE_OWNER_LABEL,smokeEngine} from '../scripts/lib/smoke-resources.mjs';

const identity={runId:'1234567',attempt:'2',source:'b'.repeat(40)};
function privateEngine(){let state:any,alive=false;const calls:string[][]=[];return {calls,get state(){return state},command(args:string[]){calls.push(args);if(args[0]==='run'){state=JSON.parse(readFileSync(join(dirname(args[args.indexOf('--env-file')+1]!), 'state.json'),'utf8'));alive=true;return 'c'.repeat(64);}if(args[0]==='ps')return alive?'c'.repeat(64):'';if(args[0]==='inspect')return JSON.stringify({name:'/'+state.name,image:CUSTOMER_POSTGRES_IMAGE,labels:{'agentci.customer.ci-db.owner':state.owner},running:true,status:'running',ports:{'5432/tcp':[{HostIp:'127.0.0.1',HostPort:'55321'}]}});if(args[0]==='rm'){alive=false;return '';}throw Error('Unexpected test engine operation');}};}
function capture(){let value='';return {stream:new Writable({write(chunk,encoding,done){value+=chunk.toString();done();}}),get value(){return value}};}

test('redaction survives every byte split, overlapping URL/password and UTF8 output',async()=>{
 const secret='synthetic-'+String(987654321),connection=new URL('postgresql://127.0.0.1/db');connection.username='fixture';connection.password=secret;const url=connection.href,text='α '+url+' '+secret+' ω';
 const output=capture();await pipeline(Readable.from([...Buffer.from(text)].map(byte=>Buffer.from([byte]))),credentialOutput([secret,url]),output.stream);
 assert.equal(output.value,'α [REDACTED] [REDACTED] ω');
});
test('actual trusted child gets ephemeral DB environment without credential argv and both output channels are redacted',async()=>{
 const root=await mkdtemp(join(tmpdir(),'hardening-child-')),api=privateEngine();let path:string|undefined;
 try{const started=await startCustomerDatabase({base:root,...identity,mask:()=>{},command:api.command,health:async()=>{}});path=started.path;const out=capture(),err=capture(),calls:any[]=[];
  const args=[process.execPath,'-e',`const k=process.env['PGPASSWORD'];process.stdout.write(process.env.DATABASE_URL);process.stderr.write(k.slice(0,5));setTimeout(()=>{process.stderr.write(k.slice(5));process.exit(7)},10);`];
  const result=await runWithDatabase(path,args,{environment:{PATH:process.env.PATH,APP_BOUNDARY:'preserved'},stdout:out.stream,stderr:err.stream,launch:(command:string,argv:string[],options:any)=>{calls.push({command,argv});assert.equal(options.env.APP_BOUNDARY,'preserved');assert.equal(options.env.AGENTCI_TEST_DATABASE_URL,options.env.DATABASE_URL);return spawn(command,argv,options);}});
  assert.equal(result,1);assert.equal(out.value,'[REDACTED]');assert.equal(err.value,'[REDACTED]');assert.ok(!JSON.stringify(calls).includes(api.state.password));assert.ok(!JSON.stringify(api.calls).includes(api.state.password));
 }finally{if(path)await stopCustomerDatabase(path,{command:api.command});await rm(root,{recursive:true,force:true});}
});
test('separate invocations have fresh private passwords and narrowed loopback ports',async()=>{
 const root=await mkdtemp(join(tmpdir(),'hardening-fresh-')),values:string[]=[];
 try{for(let i=0;i<2;i++){const api=privateEngine(),started=await startCustomerDatabase({base:root,...identity,mask:()=>{},command:api.command,health:async()=>{}});values.push(api.state.password);assert.equal((await lstat(started.path)).mode&0o777,0o600);assert.equal((await lstat(dirname(started.path))).mode&0o777,0o700);assert.ok(api.calls[0]!.includes('127.0.0.1::5432'));await stopCustomerDatabase(started.path,{command:api.command});}assert.notEqual(values[0],values[1]);}finally{await rm(root,{recursive:true,force:true});}
});
test('signal cancellation forwards to the trusted child and withholds unfinished credential output before owned cleanup',async()=>{
 const root=await mkdtemp(join(tmpdir(),'hardening-signal-')),api=privateEngine();let path:string|undefined,child:any;
 try{path=(await startCustomerDatabase({base:root,...identity,mask:()=>{},command:api.command,health:async()=>{}})).path;const out=capture(),err=capture();let ready:()=>void=()=>{};const started=new Promise<void>(resolve=>{ready=resolve});
  const operation=runWithDatabase(path,[process.execPath,'-e',`process.stdout.write(process.env['PGPASSWORD'].slice(0,17));setInterval(()=>{},1000)`],{environment:{PATH:process.env.PATH},stdout:out.stream,stderr:err.stream,launch:(command:string,argv:string[],options:any)=>{child=spawn(command,argv,options);child.stdout.once('data',ready);return child;}});
  await started;process.emit('SIGTERM');assert.equal(await operation,1);assert.equal(out.value,'[REDACTED]');assert.ok(child.signalCode==='SIGTERM');const receipt=await stopCustomerDatabase(path,{command:api.command});assert.equal(receipt.ownedContainers,0);await assert.rejects(access(dirname(path!)));path=undefined;
 }finally{child?.kill();if(path)await stopCustomerDatabase(path,{command:api.command});await rm(root,{recursive:true,force:true});}
});
test('retained integration JSON is scrubbed without changing counts, and symlink/missing successful artifact fail closed',async()=>{
 const root=await mkdtemp(join(tmpdir(),'hardening-artifact-')),cwd=process.cwd();process.chdir(root);
 try{const key='synthetic-private-artifact';await writeFile('downloaded-integration.json',JSON.stringify({tests:4,passed:4,diagnostic:key}));await redactIntegrationArtifact([key]);assert.deepEqual(JSON.parse(await readFile('downloaded-integration.json','utf8')),{tests:4,passed:4,diagnostic:'[REDACTED]'});assert.equal((await lstat('downloaded-integration.json')).mode&0o777,0o600);await rm('downloaded-integration.json');await assert.rejects(redactIntegrationArtifact([key]));await redactIntegrationArtifact([key],{required:false});await writeFile('private.json',key);await symlink('private.json','downloaded-integration.json');await assert.rejects(redactIntegrationArtifact([key]));assert.equal(await readFile('private.json','utf8'),key);}finally{process.chdir(cwd);await rm(root,{recursive:true,force:true});}
});
test('malformed and symlink artifact failures remove unsafe upload paths while preserving bounded failure evidence',async()=>{
 const root=await mkdtemp(join(tmpdir(),'hardening-unsafe-artifact-')),cwd=process.cwd();process.chdir(root);
 try{const secret='synthetic-private-artifact';let safe=0;await writeFile('downloaded-integration.json','{"failure":"'+secret);await assert.rejects(redactIntegrationArtifact([secret],{onSafe:()=>{safe++}}));await assert.rejects(access('downloaded-integration.json'));assert.equal(safe,1);assert.equal(JSON.parse(await readFile('downloaded-integration-redaction.json','utf8')).result,'unsafe-artifact-removed');await writeFile('private.json',secret);await symlink('private.json','downloaded-integration.json');await assert.rejects(redactIntegrationArtifact([secret],{onSafe:()=>{safe++}}));await assert.rejects(access('downloaded-integration.json'));assert.equal(await readFile('private.json','utf8'),secret);assert.equal(safe,2);}finally{process.chdir(cwd);await rm(root,{recursive:true,force:true});}
});
test('fast exit and missing executable remain observed while running-journal write is delayed',async()=>{
 const root=await mkdtemp(join(tmpdir(),'hardening-fast-child-')),api=privateEngine();let path:string|undefined;
 try{path=(await startCustomerDatabase({base:root,...identity,mask:()=>{},command:api.command,health:async()=>{}})).path;for(const args of [[process.execPath,'-e','process.exit(0)'],[process.execPath,'-e','process.exit(4)'],['/nonexistent/agentci-fixture-executable']]){const out=capture(),err=capture(),operation=runWithDatabase(path,args,{environment:{PATH:process.env.PATH},stdout:out.stream,stderr:err.stream,journal:async(file:string,text:string,options:any)=>{await new Promise(resolve=>setTimeout(resolve,150));await writeFile(file,text,options);}});const observed=await Promise.race([operation.then((value:number)=>value,()=>1),new Promise(resolve=>setTimeout(()=>resolve('timeout'),2000))]);assert.equal(observed,args[2]==='process.exit(0)'?0:1);await requireDatabaseCommandsStopped(path);}}finally{if(path)await stopCustomerDatabase(path,{command:api.command});await rm(root,{recursive:true,force:true});}
});
test('actual stop entry refuses broken journals and incomplete state without any engine deletion',async()=>{
 for(const failure of ['broken-journal','running-journal','missing-state']){const root=await mkdtemp(join(tmpdir(),'hardening-stop-')),api=privateEngine();let path:string|undefined;
  try{path=(await startCustomerDatabase({base:root,...identity,mask:()=>{},command:api.command,health:async()=>{}})).path;assert.ok(path);const original=await readFile(path);if(failure==='broken-journal')await symlink('missing.json',join(dirname(path),'command-broken.json'));else if(failure==='running-journal')await writeFile(join(dirname(path),'command-running.json'),JSON.stringify({schemaVersion:1,owner:api.state.owner,result:'running',pid:process.pid}),{mode:0o600});else await rm(path);
   const marker=join(root,'engine-called');await writeFile(join(root,'docker'),'#!'+process.execPath+'\nrequire("node:fs").writeFileSync('+JSON.stringify(marker)+',"unexpected engine operation");\n',{mode:0o700});
   const actual=spawnSync(process.execPath,[resolve('scripts/ci-database.mjs'),'stop'],{cwd:root,env:{PATH:root+':'+process.env.PATH,GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'alimobrem/agentci',AGENTCI_CI_DATABASE_CONFIG_FILE:path},encoding:'utf8'});assert.equal(actual.status,1);assert.ok(actual.stderr.includes('credentials withheld'));await assert.rejects(access(marker));assert.equal(JSON.parse(await readFile(join(root,'ci-database-cleanup.json'),'utf8')).result,'recovery-required-or-unverified');if(failure==='missing-state')await writeFile(path,original,{mode:0o600});
  }finally{if(path)await stopCustomerDatabase(path,{command:api.command});await rm(root,{recursive:true,force:true});}
 }
});
test('ignored cancellation and output failure kill the owned child and grandchild before allowing DB cleanup',async()=>{
 for(const failure of ['signal','output']){const root=await mkdtemp(join(tmpdir(),'hardening-group-')),api=privateEngine();let path:string|undefined,child:any;try{path=(await startCustomerDatabase({base:root,...identity,mask:()=>{},command:api.command,health:async()=>{}})).path;let ready:()=>void=()=>{};const started=new Promise<void>(resolve=>{ready=resolve}),out=failure==='output'?new Writable({write(chunk,encoding,done){done(Error('synthetic output failure'));}}):capture().stream,err=capture().stream;
  const code=`const {spawn}=require('node:child_process');process.on('SIGTERM',()=>{});const grandchild=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'inherit'});process.stdout.write('owned-ready'.repeat(20));setInterval(()=>{},1000);`;
  const operation=runWithDatabase(path,[process.execPath,'-e',code],{environment:{PATH:process.env.PATH},stdout:out,stderr:err,launch:(command:string,argv:string[],options:any)=>{child=spawn(command,argv,options);child.stdout.once('data',ready);return child;}});const checked=operation.then((value:number)=>value,()=>1);await started;if(failure==='signal')process.emit('SIGTERM');assert.equal(await Promise.race([checked,new Promise(resolve=>setTimeout(()=>resolve('timeout'),3000))]),1);await requireDatabaseCommandsStopped(path);const receipt=await stopCustomerDatabase(path,{command:api.command});assert.equal(receipt.ownedContainers,0);path=undefined;
 }finally{if(child?.pid)try{process.kill(-child.pid,'SIGKILL');}catch{}if(path)await stopCustomerDatabase(path,{command:api.command});await rm(root,{recursive:true,force:true});}}
});
function resources({lost=false,remain=false,foreign=false,inventoryError=false}={}){
 const owner='agentci-smoke-'+'a'.repeat(16),alive=new Set(['container','network','volume']),calls:string[][]=[];
 const command=(args:string[])=>{calls.push(args);const kind=args[0]==='ps'||args[0]==='inspect'||args[0]==='rm'?'container':args[0]!;
  if(args[0]==='ps'||args[1]==='ls'){if(inventoryError)throw Error('inventory unavailable');return alive.has(kind)?owner+'-'+kind:'';}
  if(args[0]==='inspect'||args[1]==='inspect')return JSON.stringify({name:(kind==='container'?'/':'')+owner+'-'+kind,labels:{[SMOKE_OWNER_LABEL]:foreign?'foreign':owner}});
  if(args[0]==='rm'||args[1]==='rm'){if(!remain)alive.delete(kind);if(lost||remain)throw Error('synthetic engine acknowledgement unavailable');return '';}
  throw Error('Unexpected smoke fixture operation');
 };return {owner,command,calls,alive};
}
test('owned cleanup reconciles lost removal acknowledgements and verifies all three inventories zero',()=>{const api=resources({lost:true}),receipt=cleanupSmokeResources(api.owner,{command:api.command});assert.equal(receipt.result,'passed');assert.equal(api.alive.size,0);assert.equal(receipt.ownedContainers+receipt.ownedNetworks+receipt.ownedVolumes,0);});
test('remaining, foreign and unknown resources cannot produce successful teardown',()=>{for(const options of [{remain:true},{foreign:true},{inventoryError:true}]){const api=resources(options);assert.throws(()=>cleanupSmokeResources(api.owner,{command:api.command}));assert.equal(api.alive.size,3);if(options.foreign)assert.ok(!api.calls.some(args=>args[0]==='rm'));}});
test('actual Docker transport strips controller tokens and suppresses raw daemon error diagnostics',async()=>{
 const root=await mkdtemp(join(tmpdir(),'hardening-engine-')),old=process.env.PATH,token=process.env.GITHUB_TOKEN;
 try{await writeFile(join(root,'docker'),'#!/usr/bin/env node\nif(process.env.GITHUB_TOKEN)process.exit(9);console.error("synthetic-private-daemon-diagnostic");process.exit(3);\n',{mode:0o700});process.env.PATH=root+':'+old;process.env.GITHUB_TOKEN='synthetic-controller-only';assert.throws(()=>smokeEngine(['inspect','fixture']),(error:any)=>!String(error).includes('synthetic-private')&&String(error).includes('withheld'));}finally{process.env.PATH=old;if(token===undefined)delete process.env.GITHUB_TOKEN;else process.env.GITHUB_TOKEN=token;await rm(root,{recursive:true,force:true});}
});
test('three workflows retain commands, trusted sources and always cleanup without credential service env or public PostgreSQL mapping',()=>{
 for(const file of ['verify','dogfood','download-smoke']){const text=readFileSync('.github/workflows/'+file+'.yaml','utf8'),workflow=parse(text),job=Object.values(workflow.jobs).find((value:any)=>value.steps.some((step:any)=>step.id==='ci_database')) as any;
  assert.ok(job);assert.equal(job.services,undefined);assert.ok(!/POSTGRES_PASSWORD|PGPASSWORD|5432:5432|postgres(?:ql)?:\/\/[^\s/]*:[^\s@]+@/.test(text));
  const start=job.steps.findIndex((step:any)=>step.id==='ci_database'),stop=job.steps.findIndex((step:any)=>step.run?.endsWith('scripts/ci-database.mjs stop'));assert.ok(start>=0&&stop>start);assert.equal(job.steps[stop].if,'always()');assert.ok(job.steps[stop].env.AGENTCI_CI_DATABASE_START_OUTCOME.includes('steps.ci_database.outcome'));
  assert.ok(job.steps.some((step:any)=>step.uses?.includes('upload-artifact')&&step.with.path.includes('ci-database-cleanup.json')));
  if(file==='dogfood'){assert.equal(job.steps[0].with.ref,'${{ github.workflow_sha }}');assert.ok(start<job.steps.findIndex((step:any)=>step.name==='Load repository-scoped App key'));assert.ok(job.steps.find((step:any)=>step.id==='prepare').run.includes('ci-database.mjs run node dist/cmd/dogfood/main.js prepare'));assert.equal(job.steps.find((step:any)=>step.name==='Publish advisory Checks with retained evidence').run,'node dist/cmd/dogfood/main.js publish');}
  if(file==='verify'){assert.ok(text.includes('ci-database.mjs run npm run test:integration'));assert.ok(text.includes('ci-database.mjs run node scripts/package-smoke.mjs --postgres-readers'));}
  if(file==='download-smoke'){const harness=job.steps.find((step:any)=>step.with?.path==='.acceptance-harness');for(const path of ['scripts/ci-database.mjs','scripts/lib/customer-ci-database.mjs','scripts/lib/credential-output.mjs','scripts/lib/smoke-resources.mjs','scripts/image-smoke.mjs'])assert.ok(harness.with['sparse-checkout'].includes(path));assert.ok(text.includes('.acceptance-harness/scripts/ci-database.mjs run --redact-integration-artifact'));assert.ok(text.includes('node .acceptance-harness/scripts/image-smoke.mjs downloaded'));assert.equal(harness.with.ref,'${{ github.workflow_sha }}');}
 }
});
test('CI entry refuses unknown context without emitting caller credentials',()=>{const result=spawnSync(process.execPath,['scripts/ci-database.mjs','start'],{env:{PATH:process.env.PATH,GITHUB_TOKEN:'synthetic-never-log'},encoding:'utf8'});assert.equal(result.status,1);assert.ok(!result.stdout.includes('synthetic-never-log'));assert.ok(!result.stderr.includes('synthetic-never-log'));});
test('actual image smoke entry protects argv/output and defers PASS until owned cleanup, including lost create and teardown failures',async()=>{
 const successes:string[][]=[];
 for(const failure of ['', '', 'lost-create','service-start','teardown','artifact-directory']){
  const root=await mkdtemp(join(tmpdir(),'hardening-smoke-entry-')),script=resolve('scripts/image-smoke.mjs');
  try{
   const {mkdir}=await import('node:fs/promises');await mkdir(join(root,'deploy/migrations'),{recursive:true});
   await writeFile(join(root,'agentci.yaml'),readFileSync('agentci.yaml'));for(const file of ['001_m1.sql','002_m2.sql','003_m2_review_recovery.sql'])await writeFile(join(root,'deploy/migrations',file),readFileSync('deploy/migrations/'+file));
   await writeFile(join(root,'docker'),'#!'+process.execPath+'\n'+readFileSync('tests/helpers/image-smoke-engine-fixture.cjs','utf8'),{mode:0o700});
   await writeFile(join(root,'engine-state.json'),JSON.stringify({failure,container:{},network:{},volume:{},calls:[],secrets:[],envModes:[]}),{mode:0o600});
   if(failure==='artifact-directory')await writeFile(join(root,'.agentci'),'deliberate metadata directory failure');
   const result=spawnSync(process.execPath,[script,'fixture'],{cwd:root,env:{PATH:root+':'+process.env.PATH,GITHUB_TOKEN:'synthetic-controller-only'},encoding:'utf8',timeout:20000});
   assert.equal(result.error,undefined);const state=JSON.parse(await readFile(join(root,'engine-state.json'),'utf8'));
   if(failure==='artifact-directory'){assert.equal(result.status,1);assert.equal(Object.keys(state.container).length+Object.keys(state.network).length+Object.keys(state.volume).length,0);assert.ok(!result.stdout.includes('"passed"'));continue;}
   const receipt=JSON.parse(await readFile(join(root,'.agentci/artifacts/image-smoke-cleanup.json'),'utf8'));
   assert.equal(state.inheritedControllerToken,false);assert.ok(state.envModes.every((mode:number)=>mode===0o600));assert.ok(state.secrets.length>=1);
   for(const secret of state.secrets){assert.ok(!JSON.stringify(state.calls).includes(secret));assert.ok(!(result.stdout+result.stderr).includes(secret));}
   assert.ok(!state.calls.some((args:string[])=>args.includes('--publish')||args.includes('-p')),'Database stays in the private smoke network');
   if(!failure){assert.equal(result.status,0);assert.equal(JSON.parse(result.stdout).result,'passed');assert.equal(receipt.result,'passed');assert.equal(receipt.privateFilesRemoved,true);assert.equal(Object.keys(state.container).length+Object.keys(state.network).length+Object.keys(state.volume).length,0);successes.push(state.secrets);}
   else{assert.equal(result.status,1);assert.ok(!result.stdout.includes('"passed"'));if(failure==='teardown'){assert.equal(receipt.result,'recovery-required-or-unverified');await access(join(receipt.privateDirectory,'fixture.pem'));await access(join(receipt.privateDirectory,'services.env'));await rm(receipt.privateDirectory,{recursive:true,force:true});}else{assert.equal(receipt.result,'passed');assert.equal(Object.keys(state.container).length+Object.keys(state.network).length+Object.keys(state.volume).length,0);}}
  }finally{await rm(root,{recursive:true,force:true});}
 }
 assert.ok(!successes[0]!.some(secret=>successes[1]!.includes(secret)),'All actual smoke credentials are fresh between invocations');
});
test('image state is registered before daemon writes and always cleanup recovers SIGTERM and SIGKILL interruptions',async()=>{
 for(const signal of ['SIGTERM','SIGKILL'] as const){const root=await mkdtemp(join(tmpdir(),'hardening-smoke-cancel-')),script=resolve('scripts/image-smoke.mjs'),cleanup=resolve('scripts/image-smoke-cleanup.mjs'),envFile=join(root,'github-env');let child:any;
  try{await writeFile(envFile,'',{mode:0o600});await writeFile(join(root,'docker'),'#!'+process.execPath+'\n'+readFileSync('tests/helpers/image-smoke-engine-fixture.cjs','utf8'),{mode:0o700});await writeFile(join(root,'engine-state.json'),JSON.stringify({failure:'',container:{},network:{},volume:{},calls:[],secrets:[],envModes:[]}),{mode:0o600});const env={PATH:root+':'+process.env.PATH,GITHUB_ENV:envFile};child=spawn(process.execPath,[script,'fixture'],{cwd:root,env,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',(value:Buffer)=>{output+=value.toString()});child.stderr.on('data',()=>{});const closed=new Promise(resolve=>child.once('close',resolve));
   let observed=false;for(let index=0;index<150;index++){const state=JSON.parse(await readFile(join(root,'engine-state.json'),'utf8'));if(Object.keys(state.container).some(name=>name.endsWith('-db'))){observed=true;break;}await new Promise(resolve=>setTimeout(resolve,10));}assert.ok(observed);const entry=(await readFile(envFile,'utf8')).trim();assert.ok(entry.startsWith('AGENTCI_IMAGE_SMOKE_STATE_FILE='));const path=entry.slice(entry.indexOf('=')+1);child.kill(signal);await closed;assert.ok(!output.includes('"passed"'));
   const result=spawnSync(process.execPath,[cleanup],{cwd:root,env:{...env,GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'alimobrem/agentci',AGENTCI_IMAGE_SMOKE_STATE_FILE:path,AGENTCI_IMAGE_SMOKE_OUTCOME:'cancelled'},encoding:'utf8',timeout:10000});assert.equal(result.status,0);const state=JSON.parse(await readFile(join(root,'engine-state.json'),'utf8'));assert.equal(Object.keys(state.container).length+Object.keys(state.network).length+Object.keys(state.volume).length,0);await assert.rejects(access(dirname(path)));const receipt=JSON.parse(await readFile(join(root,'.agentci/artifacts/image-smoke-cleanup.json'),'utf8'));assert.equal(receipt.result,'passed');assert.equal(receipt.privateFilesRemoved,true);for(const secret of state.secrets)assert.ok(!(result.stdout+result.stderr).includes(secret));
  }finally{child?.kill('SIGKILL');await rm(root,{recursive:true,force:true});}
 }
});
