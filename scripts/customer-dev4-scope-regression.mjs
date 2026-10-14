/** Mandatory real PostgreSQL/Temporal regression, using installed immutable dev.4.
 * GitHub is a generated-key synthetic transport; it has no network fallback. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';import {tmpdir} from 'node:os';import {pathToFileURL} from 'node:url';
import {randomUUID,generateKeyPairSync,createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {createServer} from 'node:net';import {once} from 'node:events';import {Pool} from 'pg';
import {Connection} from '@temporalio/client';import Long from 'long';import {Octokit} from '@octokit/rest';
import {preparePublishedPackage} from './published-package-smoke.mjs';import {customerPublicationAssets} from './lib/customer-publication-assets.mjs';
import {ownedCustomerDatabase} from './lib/customer-isolated-database.mjs';import {customerSessionOwner} from './lib/customer-session-owner.mjs';
import {createCustomerServiceSession} from './lib/customer-service-session.mjs';import {withCustomerServiceLifetime} from './lib/customer-runtime-processes.mjs';
import {customerFixtureFiles} from './lib/customer-approved-catalog.mjs';import {customerDiagnosticError} from './lib/customer-diagnostics.mjs';
import {customerRecoveryTransport} from '../tests/helpers/customer-recovery-transport.mjs';
const candidate={releaseSource:'6caeb54767e56b9b2375a256bab127014d99d41a',packageManifestSha256:'09e25cbfa25f349e7e2a1756d3b4c87b66bffd3b4be51199f293cf69880f33cf',packageSha256:'e68608ea8539fe686791c37e51c5754b43a5c78bca31ad1b1b4cd22d70cfdbff',imagesManifestSha256:'d2dc4f7360b743306916415dfd2250b1e6a73c68f380a3008d33cc062570355e',publicationEvidenceSha256:'0aeaa8b2f99f6884f2b787baba2b0adffe636606bd0f55e6baabe734bd9ce4a7'};
const databaseUrl=process.env.AGENTCI_TEST_DATABASE_URL,address=process.env.AGENTCI_TEST_TEMPORAL_ADDRESS;
if(process.platform!=='linux'||!databaseUrl||!address)throw Error('Real Linux PostgreSQL/Temporal installed-dev.4 regression required; never skip');
const harnessSource=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',env:{PATH:process.env.PATH}}).trim(),arch=process.arch==='x64'?'amd64':process.arch;
const owner=customerSessionOwner(),primaryDatabase=ownedCustomerDatabase(databaseUrl);
let prepared,privateRoot,pool,cleanup,proof={schemaVersion:1,result:'failed-or-unverified',harnessSource,candidate,qualification:'GitHub and App signatures use an owned synthetic transport; PostgreSQL, Temporal, installed production services and the isolated assertion container are real.'};
const sessionEvidence=()=>owner.snapshot().map(({label,scope,namespace,operations,diagnostics,cleanup})=>({label,scope,namespace,operations,diagnostics,cleanup}));
try{
 prepared=await preparePublishedPackage({version:'0.4.0-m3-dev.4',sourceCommit:candidate.releaseSource,arch,manifestSha256:candidate.packageManifestSha256,packageSha256:candidate.packageSha256});
 const publication=await customerPublicationAssets(prepared,candidate),role=kind=>{const value=publication.trusted.images.find(i=>i.role===kind);if(!value?.platforms.includes('linux/'+arch))throw Error('Verified native role required');return value.image;};
 privateRoot=await mkdtemp(join(tmpdir(),'agentci-dev4-scope-regression-'));await primaryDatabase.initialize();pool=new Pool({connectionString:primaryDatabase.url,max:1,statement_timeout:10000,query_timeout:10000});
 const baseSha='04f11298c020e853fd0098fb5d92c7529630f300',headSha='3c12571ec6f4578d19876ce27cf56c842c3abf97',keys=generateKeyPairSync('rsa',{modulusLength:2048}),keyPath=join(privateRoot,'synthetic-key.pem'),fixturePath=join(privateRoot,'transport.json');
 await writeFile(keyPath,keys.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});await writeFile(fixturePath,JSON.stringify({publicKey:keys.publicKey.export({type:'spki',format:'pem'}).toString(),events:join(privateRoot,'transport-events.jsonl'),pullRequest:5,baseSha,headSha,snapshots:{[baseSha]:customerFixtureFiles('base'),[headSha]:customerFixtureFiles('fixed')}}),{mode:0o600});
 const preload=join(privateRoot,'preload.mjs'),wrapper=join(privateRoot,'node'),reservationErrors=join(privateRoot,'reservation-errors.jsonl');
 const errorCapture=`import {appendFileSync} from 'node:fs';import {ReproductionReservations} from ${JSON.stringify(pathToFileURL(join(prepared.installedRoot,'dist/packages/storage/reproduction-reservations.js')).href)};const reserve=ReproductionReservations.prototype.reserveInTransaction;ReproductionReservations.prototype.reserveInTransaction=async function(c,id,value){try{return await reserve.call(this,c,id,value);}catch(error){if(error.code==='attempt-limit'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value.operationId))appendFileSync(${JSON.stringify(reservationErrors)},JSON.stringify({code:'attempt-limit',operationId:value.operationId})+'\\n',{mode:0o600});throw error;}};`;
 await writeFile(preload,`${errorCapture}import {customerRecoveryTransport} from ${JSON.stringify(new URL('../tests/helpers/customer-recovery-transport.mjs',import.meta.url).href)};globalThis.fetch=customerRecoveryTransport(${JSON.stringify(fixturePath)});`,{mode:0o600});
 const quote=value=>"'"+value.replaceAll("'","'\\''")+"'";
 await writeFile(wrapper,'#!/bin/sh\nexec '+quote(process.execPath)+' --import '+quote(preload)+' "$@"\n',{mode:0o700});
 const github=new Octokit({auth:'fixture-recovery-token',request:{fetch:customerRecoveryTransport(fixturePath)},log:{debug(){},info(){},warn(){},error(){}}}),fixtures={repository:'alimobrem/agentci-onboarding-demo',appId:42,installationId:12,subjects:[{kind:'fixed',pullRequest:5,baseSha,headSha}]};
 async function create(label,db){
  const namespace='customer-scope-regression-'+randomUUID(),connection=await Connection.connect({address});try{await connection.workflowService.registerNamespace({namespace,workflowExecutionRetentionPeriod:{seconds:Long.fromNumber(86400)}});}finally{await connection.close();}
  const portProbe=createServer();portProbe.listen(0,'127.0.0.1');await once(portProbe,'listening');const port=portProbe.address().port;await new Promise(resolve=>portProbe.close(resolve));
  const sessionRoot=await mkdtemp(join(privateRoot,label+'-')),session=owner.register(label,await createCustomerServiceSession({root:prepared.installedRoot,privateRoot:sessionRoot,keyPath,github,fixtures,databaseUrl:db.url,temporalAddress:address,namespace,port,runnerImage:role('eval-runner'),evaluatorImage:role('eval-worker')}));
  session.runtime.node=wrapper;return session;
 }
 const primary=await create('primary',primaryDatabase);
 const counts=async()=>{const values=[];for(const table of ['agentci_finding_events','agentci_reproduction_plans','agentci_reproduction_operations','agentci_reproduction_dispatch_intents'])values.push(Number((await pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count));return values;};
 const retained=async()=>JSON.stringify((await pool.query('SELECT finding_id,version,digest,event FROM agentci_finding_events ORDER BY finding_id,version')).rows);
 await withCustomerServiceLifetime(owner,async()=>{
  await primary.initialize();
  // All three cancelled plans count across separate admissions for one finding.
  for(let i=0;i<3;i++){const review=await primary.review('fixed'),approval=await primary.approve(review);assert.equal(approval.plan.limits.maxAttempts,3);const reference=await primary.reserve(review,approval);await primary.client.cancelReproduction(review.admission,reference);const status=await primary.settled(review,reference);assert.equal(status.settlement.kind,'never-staged');assert.equal(status.receipt,null);assert.ok(status.nonExecution);}
  const review=await primary.review('fixed'),approval=await primary.approve(review),before=await counts();assert.equal(review.current.version,10);assert.deepEqual(before,[10,3,3,3]);
  await assert.rejects(primary.reserve(review,approval),/Customer phase failed: reservation/);assert.deepEqual(await counts(),before);
  const failed=primary.diagnosticsSnapshot().events.findLast(e=>e.phase==='reservation'&&e.outcome==='failed');assert.equal(failed.error.code,'approval-conflict');assert.equal(failed.error.status,409);assert.equal(failed.operationId,primary.reservations.at(-1).request.operationId);
  const storageErrors=(await readFile(reservationErrors,'utf8')).trim().split('\n').map(line=>JSON.parse(line));assert.ok(storageErrors.some(e=>e.code==='attempt-limit'&&e.operationId===failed.operationId));
  proof.sameScope={expectedVersion:10,priorPlans:3,maxAttempts:3,rejection:'attempt-limit',publicError:failed.error,countsBefore:before,countsAfter:await counts()};
  const original=await retained(),database=owner.registerDatabase(ownedCustomerDatabase(databaseUrl));await database.initialize();const isolated=await create('staged-cancellation',database);assert.notEqual(isolated.scope.organizationId,primary.scope.organizationId);assert.notEqual(isolated.namespace,primary.namespace);
  await isolated.initialize();const activeReview=await isolated.review('fixed');assert.deepEqual({...activeReview.admission.subject,organizationId:primary.scope.organizationId},review.admission.subject);const activeApproval=await isolated.approve(activeReview,{recovery:true});assert.equal(activeApproval.plan.limits.maxAttempts,3);const reference=await isolated.reserve(activeReview,activeApproval);assert.equal(reference.finding.queuedVersion,2);
  await isolated.startConsumer();const active=await isolated.active(reference);assert.ok(active.runner);await isolated.client.cancelReproduction(activeReview.admission,reference);const status=await isolated.settled(activeReview,reference);assert.equal(status.settlement.kind,'receipt-retained');assert.ok(status.receipt);assert.equal(status.nonExecution,null);const physical=await isolated.physical(activeApproval,reference,status);assert.equal(physical.ownedContainers,0);assert.equal(physical.cleanupStatus,'COMPLETED');assert.ok(physical.cleanupRunId);
  proof.isolated={scope:isolated.scope,namespace:isolated.namespace,expectedVersion:1,maxAttempts:3,active,physical,ownedContainers:0,settlement:status.settlement};assert.equal(await retained(),original);assert.deepEqual(await counts(),before);proof.primaryHistoryImmutable=true;proof.primaryHistorySha256=createHash('sha256').update(original).digest('hex');proof.package=prepared.receipt;
 },async value=>{cleanup=value;});
 proof.result='passed';
}catch(error){proof.error=customerDiagnosticError(error);process.exitCode=1;
}finally{
 if(!cleanup)try{await withCustomerServiceLifetime(owner,async()=>{},async value=>{cleanup=value;});}catch{process.exitCode=1;}
 proof.sessions=sessionEvidence();proof.ownedDatabases=owner.databaseSnapshot();proof.cleanup=[];
 try{await pool?.end();if(!cleanup)throw Error('Owned sessions require recovery');proof.cleanup.push(...cleanup.isolatedDatabases,await primaryDatabase.close());proof.ownedCleanup=cleanup;await prepared?.cleanup();if(privateRoot)await rm(privateRoot,{recursive:true,force:true});}catch{proof.result='failed-or-unverified';process.exitCode=1;}
 await mkdir('.agentci/artifacts',{recursive:true});await writeFile('.agentci/artifacts/customer-dev4-scope-regression.json',JSON.stringify(proof,null,2)+'\n');
}
