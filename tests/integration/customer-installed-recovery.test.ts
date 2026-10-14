import test from 'node:test';import assert from 'node:assert/strict';
import {randomUUID,generateKeyPairSync} from 'node:crypto';import {mkdtemp,writeFile,readFile,rm,realpath,access} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createServer} from 'node:net';import {once} from 'node:events';
import Long from 'long';import {Pool} from 'pg';import {Connection} from '@temporalio/client';import {Octokit} from '@octokit/rest';
// @ts-expect-error trusted operational ESM helper
import {createCustomerServiceSession} from '../../scripts/lib/customer-service-session.mjs';
// @ts-expect-error trusted operational ESM helper
import {customerFixtureFiles} from '../../scripts/lib/customer-approved-catalog.mjs';
// @ts-expect-error synthetic test-only transport
import {customerRecoveryTransport} from '../helpers/customer-recovery-transport.mjs';
const database=process.env.AGENTCI_TEST_DATABASE_URL,address=process.env.AGENTCI_TEST_TEMPORAL_ADDRESS;
if(!database||!address)throw Error('Installed customer recovery acceptance requires real PostgreSQL and Temporal; never silently skip');
const root=await realpath(process.env.AGENTCI_TEST_CLIENT_PACKAGE_ROOT??new URL('../../',import.meta.url).pathname);await readFile(join(root,'dist/apps/worker/main.js'));
async function fixture(){
 const privateRoot=await mkdtemp(join(tmpdir(),'agentci-installed-recovery-')),name='recovery_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:database});await admin.query(`CREATE DATABASE ${name}`);
 const db=new URL(database!);db.pathname='/'+name;db.search='';const pool=new Pool({connectionString:db.href}),connection=await Connection.connect({address}),namespace='installed-recovery-'+randomUUID();
 await connection.workflowService.registerNamespace({namespace,workflowExecutionRetentionPeriod:{seconds:Long.fromNumber(3600)}});
 const portProbe=createServer();portProbe.listen(0,'127.0.0.1');await once(portProbe,'listening');const port=(portProbe.address() as {port:number}).port;await new Promise<void>(resolve=>portProbe.close(()=>resolve()));
 const keyPath=join(privateRoot,'fixture-key.pem'),fixturePath=join(privateRoot,'transport.json'),events=join(privateRoot,'events.jsonl'),keys=generateKeyPairSync('rsa',{modulusLength:2048}),baseSha='a'.repeat(40),headSha='b'.repeat(40);
 await writeFile(keyPath,keys.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});await writeFile(fixturePath,JSON.stringify({publicKey:keys.publicKey.export({type:'spki',format:'pem'}).toString(),events,baseSha,headSha,snapshots:{[baseSha]:customerFixtureFiles('base'),[headSha]:customerFixtureFiles('seeded')}}),{mode:0o600});
 const preload=join(privateRoot,'preload.mjs'),wrapper=join(privateRoot,'node');await writeFile(preload,`import {customerRecoveryTransport} from ${JSON.stringify(new URL('../helpers/customer-recovery-transport.mjs',import.meta.url).href)};globalThis.fetch=customerRecoveryTransport(${JSON.stringify(fixturePath)});`,{mode:0o600});
 await writeFile(wrapper,`#!/bin/sh\nexec '${process.execPath.replaceAll("'","'\\''")}' --import '${preload.replaceAll("'","'\\''")}' "$@"\n`,{mode:0o700});
 const github=new Octokit({auth:'fixture-recovery-token',request:{fetch:customerRecoveryTransport(fixturePath)},log:{debug(){},info(){},warn(){},error(){}}}),session=await createCustomerServiceSession({root,privateRoot,keyPath,github,fixtures:{repository:'alimobrem/agentci-onboarding-demo',appId:42,installationId:12,subjects:[{kind:'seeded',pullRequest:4,baseSha,headSha}]},databaseUrl:db.href,temporalAddress:address,namespace,runnerImage:'ghcr.io/alimobrem/agentci-eval-runner@sha256:'+'1'.repeat(64),evaluatorImage:'ghcr.io/alimobrem/agentci-eval-worker@sha256:'+'2'.repeat(64),port});
 session.runtime.node=wrapper;
 const reserve=session.client.reserveReproduction.bind(session.client);session.client.reserveReproduction=async(...args:any[])=>{try{return await reserve(...args);}catch(error:any){console.log(JSON.stringify({diagnostic:'public-reservation-error',code:['service-unavailable','reproduction-denied','approval-conflict','version-conflict','invalid-request','identity-mismatch','unauthorized','invalid-response'].includes(error.code)?error.code:'unclassified',status:Number.isSafeInteger(error.status)?error.status:null,blocked:JSON.parse('['+(await readFile(events,'utf8').catch(()=>'' )).trim().split('\n').filter(Boolean).join(',')+']').filter((event:any)=>event.type==='blocked-route').map((event:any)=>({method:event.method,path:event.path}))}));throw error;}};
 return {session,pool,privateRoot,keyPath,async cleanup(){await session.quiesce();await pool.end();await connection.close();await admin.query(`DROP DATABASE ${name}`);await admin.end();await rm(privateRoot,{recursive:true,force:true});}};
}

test('installed customer session repairs evaluator-start failure after actual reservation with never-staged settlement',{timeout:120000},async()=>{
 const f=await fixture(),{session}=f;let finalStatus:any;
 try{
  await session.initialize();const review=await session.review('seeded'),approval=await session.approve(review),reference=await session.reserve(review,approval);
  assert.equal(session.reservations.length,1);assert.equal(session.reservations[0].acknowledged,true);assert.equal((await f.pool.query('SELECT count(*) FROM agentci_reproduction_operations')).rows[0].count,'1');assert.equal(session.runtime.isAlive('worker'),false);
  const status=session.client.reproductionStatus.bind(session.client);session.client.reproductionStatus=async(...args:any[])=>{const value=await status(...args);if(value.dispatch.state==='settled')finalStatus=value;return value;};
  session.evaluator.start=async()=>{throw Error('Synthetic evaluator startup failure');};await assert.rejects(session.startConsumer(),/Customer phase failed: consumer/);
  const cleanup=await session.close({signal:AbortSignal.timeout(30000)});
  assert.equal(finalStatus.dispatch.state,'settled');assert.equal(finalStatus.settlement.kind,'never-staged');assert.equal(finalStatus.receipt,null);assert.ok(finalStatus.nonExecution);assert.equal(cleanup.controllerProcesses.ownedProcessesRemaining,0);assert.equal(cleanup.assertionContainers.ownedAssertionContainers,0);assert.equal(cleanup.evaluator.ownedEvaluatorContainers,0);
  assert.ok(cleanup.controllerProcesses.events.filter((event:any)=>event.role==='worker'&&event.event==='started').length>=2,'cleanup must restore actual installed worker after approval drained it');
  assert.equal((await f.pool.query('SELECT count(*) FROM agentci_eval_units')).rows[0].count,'0','never-staged cancellation must not fabricate a unit or receipt');assert.ok(reference.operationId);await access(f.keyPath);
 }finally{await f.cleanup();}
});

test('installed cancellation recovers a worker killed at the settlement boundary',{timeout:120000},async()=>{
 const f=await fixture(),{session}=f;let killed=false,finalStatus:any;
 try{
  await session.initialize();const review=await session.review('seeded'),approval=await session.approve(review);await session.reserve(review,approval);
  const settled=session.settled.bind(session);session.settled=async(...args:any[])=>{if(!killed){assert.equal(session.runtime.isAlive('worker'),true);await session.runtime.stop('worker','SIGKILL');killed=true;}return settled(...args);};
  const status=session.client.reproductionStatus.bind(session.client);session.client.reproductionStatus=async(...args:any[])=>{const value=await status(...args);if(value.dispatch.state==='settled')finalStatus=value;return value;};
  const cleanup=await session.close({signal:AbortSignal.timeout(30000)});assert.equal(killed,true);assert.equal(finalStatus.settlement.kind,'never-staged');assert.equal(finalStatus.receipt,null);assert.equal(cleanup.controllerProcesses.ownedProcessesRemaining,0);assert.ok(cleanup.controllerProcesses.events.some((event:any)=>event.role==='worker'&&event.signal==='SIGKILL'));assert.ok(cleanup.controllerProcesses.events.filter((event:any)=>event.role==='worker'&&event.event==='started').length>=3);
 }finally{await f.cleanup();}
});

test('stalled installed settlement aborts without cleanup success or private credential deletion',{timeout:120000},async()=>{
 const f=await fixture(),{session}=f;let reads=0;
 try{
  await session.initialize();const review=await session.review('seeded'),approval=await session.approve(review);await session.reserve(review,approval);
  const status=session.client.reproductionStatus.bind(session.client),stale=await status(session.reservations[0].review.admission,session.reservations[0].reference);session.client.reproductionStatus=async(...args:any[])=>{await status(...args);reads++;return structuredClone(stale);};
  const abort=new AbortController(),settled=session.settled.bind(session);let abortedAt=0;session.settled=async(...args:any[])=>{const timer=setTimeout(()=>{abortedAt=Date.now();abort.abort();},500);try{return await settled(...args);}finally{clearTimeout(timer);}};
  const outer=setTimeout(()=>{abortedAt=Date.now();abort.abort();},30000);try{await assert.rejects(session.close({signal:abort.signal}),(error:any)=>error.customerRecoveryRequired===true);}finally{clearTimeout(outer);}assert.ok(abortedAt>0,'must reach an actual abort');assert.ok(Date.now()-abortedAt<5000,'abort must bound settlement polling after the signal');assert.ok(reads>=3,'settlement polls must observe the retained stale status before abort');await access(f.keyPath);assert.equal((await f.pool.query('SELECT count(*) FROM agentci_reproduction_operations')).rows[0].count,'1');
  await session.quiesce();assert.equal(session.runtime.isAlive('api'),false);assert.equal(session.runtime.isAlive('worker'),false);await assert.rejects(session.close(),(error:any)=>error.customerRecoveryRequired===true);await access(f.keyPath);
 }finally{await f.cleanup();}
});

test('foreign evaluator identity and unverifiable engine state retain failure and never authorize deletion',{timeout:30000},async()=>{
 const f=await fixture(),{session}=f;let created=false;
 // @ts-expect-error trusted test infrastructure helper
 const {databaseCommand,CUSTOMER_POSTGRES_IMAGE}=await import('../../scripts/lib/customer-ci-database.mjs');
 const owner='installed-recovery-'+randomUUID(),name=session.evaluator.name;
 try{
  databaseCommand(['create','--name',name,'--label','agentci.test.owner='+owner,'--label','agentci.customer.owner='+session.evaluator.owner,CUSTOMER_POSTGRES_IMAGE]);created=true;session.evaluator.creationAttempted=true;
  await assert.rejects(session.close({signal:AbortSignal.timeout(10000)}),(error:any)=>error.customerRecoveryRequired===true);await access(f.keyPath);
  assert.ok(databaseCommand(['ps','--all','--quiet','--filter','name=^/'+name+'$']),'cleanup cannot delete a mismatched evaluator image');
  const label=databaseCommand(['inspect','--format','{{index .Config.Labels "agentci.test.owner"}}',name]);assert.equal(label,owner);databaseCommand(['rm','--force','--volumes',name]);created=false;
  const command=session.evaluator.command.bind(session.evaluator);try{session.evaluator.command=async()=>{throw Error('Synthetic engine unavailable');};await assert.rejects(session.close(),(error:any)=>error.customerRecoveryRequired===true);await access(f.keyPath);}finally{session.evaluator.command=command;}
  const cleanup=await session.close();assert.equal(cleanup.evaluator.ownedEvaluatorContainers,0);assert.equal(cleanup.controllerProcesses.ownedProcessesRemaining,0);
 }finally{if(created){assert.equal(databaseCommand(['inspect','--format','{{index .Config.Labels "agentci.test.owner"}}',name]),owner);databaseCommand(['rm','--force','--volumes',name]);}await f.cleanup();}
});
