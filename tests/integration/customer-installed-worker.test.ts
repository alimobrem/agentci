import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,generateKeyPairSync} from 'node:crypto';
import {mkdtemp,readFile,readdir,writeFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {Pool} from 'pg';
// @ts-expect-error operational ESM helper
import {CustomerRuntimeProcesses} from '../../scripts/lib/customer-runtime-processes.mjs';
// @ts-expect-error operational ESM helper
import {createCustomerServiceSession} from '../../scripts/lib/customer-service-session.mjs';
import {ReviewerProfileStore} from '../../packages/storage/reviewer-profiles.ts';
import {ReviewDispatchStore} from '../../packages/storage/review-dispatch.ts';
import {ReviewAdmissionStore} from '../../packages/storage/review-admissions.ts';
import {canonical,digest} from '../../packages/review/engine.ts';

const database=process.env.AGENTCI_TEST_DATABASE_URL,temporal=process.env.AGENTCI_TEST_TEMPORAL_ADDRESS;
if(!database||!temporal)throw Error('Installed customer worker acceptance requires real PostgreSQL and Temporal; never silently skip');
const packageRoot=await realpath(process.env.AGENTCI_TEST_CLIENT_PACKAGE_ROOT??new URL('../../',import.meta.url).pathname);
const worker=join(packageRoot,'dist/apps/worker/main.js');
await readFile(worker); // There is no TypeScript/source-entry fallback.
async function until(read:()=>Promise<boolean>,label:string,timeout=30000){const end=Date.now()+timeout;while(Date.now()<end){if(await read())return;await delay(100);}throw Error('Installed worker regression deadline: '+label);}

test('compiled/production-installed customer worker starts and publishes exact scoped advisory Checks only with explicit enablement',{timeout:120000},async()=>{
 const privateRoot=await mkdtemp(join(tmpdir(),'agentci-installed-worker-test-')),schema='installed_worker_'+randomUUID().replaceAll('-','');
 const admin=new Pool({connectionString:database});await admin.query(`CREATE SCHEMA ${schema}`);
 const db=new URL(database!);db.searchParams.set('options',`-c search_path=${schema}`);const pool=new Pool({connectionString:db.href});
 const keys=generateKeyPairSync('rsa',{modulusLength:2048}),keyPath=join(privateRoot,'fixture-key.pem');
 await writeFile(keyPath,keys.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
 const runnerImage='ghcr.io/fixture/runner@sha256:'+'1'.repeat(64);
 const session=await createCustomerServiceSession({root:packageRoot,privateRoot,keyPath,github:{},fixtures:{repository:'fixture/customer',appId:42,installationId:12},databaseUrl:database,temporalAddress:temporal,runnerImage,evaluatorImage:'ghcr.io/alimobrem/agentci-eval-worker@sha256:'+'2'.repeat(64),port:33999});
 assert.equal(session.env.AGENTCI_EVAL_RUNNER_IMAGE,runnerImage);assert.equal(session.env.AGENTCI_MODEL_REVIEW_CHECKS,'true');
 const scope=session.scope,subject={...scope,pullRequest:4,baseSha:'a'.repeat(40),headSha:'b'.repeat(40)};
 const fixturePath=join(privateRoot,'transport.json'),eventsPath=join(privateRoot,'events.jsonl'),readyPath=join(privateRoot,'ready'),preload=join(privateRoot,'preload.mjs'),wrapper=join(privateRoot,'node');
 // The wrapper is test-only. Production environment filtering remains unchanged;
 // no NODE_OPTIONS, network endpoint override, or fixture key enters production.
 await writeFile(wrapper,`#!/bin/sh\nexec '${process.execPath.replaceAll("'","'\\''")}' --import '${preload.replaceAll("'","'\\''")}' "$@"\n`,{mode:0o700});
 await writeFile(preload,`
import {readFileSync,appendFileSync,writeFileSync} from 'node:fs';import {createPublicKey,verify} from 'node:crypto';import {createRequire} from 'node:module';
const fixturePath=${JSON.stringify(fixturePath)},eventsPath=${JSON.stringify(eventsPath)};
const f=()=>JSON.parse(readFileSync(fixturePath,'utf8'));const record=value=>appendFileSync(eventsPath,JSON.stringify(value)+'\\n');
globalThis.fetch=async(input,init={})=>{
 const request=new Request(input,init),url=new URL(request.url),state=f(),method=request.method;
 if(url.origin!=='https://api.github.com')throw Error('Unexpected fixture network origin');
 const headers={'content-type':'application/json'};let result;
 if(method==='POST'&&url.pathname==='/app/installations/12/access_tokens'){
  const jwt=request.headers.get('authorization')?.replace(/^bearer /i,'').split('.')??[];
  if(jwt.length!==3||JSON.parse(Buffer.from(jwt[1],'base64url')).iss!==42||!verify('RSA-SHA256',Buffer.from(jwt[0]+'.'+jwt[1]),createPublicKey(state.publicKey),Buffer.from(jwt[2],'base64url')))throw Error('Fixture App JWT mismatch');
  result={token:'fixture-installation-token',expires_at:new Date(Date.now()+3600000).toISOString(),permissions:{checks:'write',contents:'read',pull_requests:'read',metadata:'read'}};record({kind:'authenticated',appId:42,installationId:12});
 }else{
  if(request.headers.get('authorization')!=='token fixture-installation-token')throw Error('Fixture installation authorization mismatch');
  const prefix='/repos/fixture/customer';
  if(method==='GET'&&url.pathname===prefix+'/pulls/4'){result={state:'open',base:{sha:state.subject.baseSha},head:{sha:state.changedHead?'c'.repeat(40):state.subject.headSha}};record({kind:'subject-read'});}
  else if(method==='GET'&&url.pathname===prefix+'/commits/'+state.subject.headSha+'/check-runs'){
   let own;try{own=readFileSync(eventsPath,'utf8').trim().split('\\n').map(line=>JSON.parse(line)).filter(event=>event.kind==='check-created'||event.kind==='check-updated').at(-1);}catch{}
   const runs=[{...state.decoy,id:901,app:{id:999}},{...state.decoy,id:902,app:{id:42},head_sha:'d'.repeat(40)},...(own?[{...own.body,id:903,app:{id:42}}]:[])];result={total_count:runs.length,check_runs:runs};record({kind:'inventory-read'});
  }else if(method==='POST'&&url.pathname===prefix+'/check-runs'){
   const body=await request.json();record({kind:'check-created',path:url.pathname,body,appId:42,installationId:12});result={...body,id:903,app:{id:42}};
  }else if(method==='PATCH'&&url.pathname===prefix+'/check-runs/903'){const body=await request.json();record({kind:'check-updated',path:url.pathname,body,appId:42,installationId:12});result={...body,id:903,app:{id:42}};}else throw Error('Unexpected fixture network route');
 }
 return new Response(JSON.stringify(result),{status:200,headers});
};
const require=createRequire(${JSON.stringify(join(packageRoot,'package.json'))});const {Worker}=await import(require.resolve('@temporalio/worker'));
const create=Worker.create.bind(Worker);Worker.create=async(...args)=>{const result=await create(...args);writeFileSync(${JSON.stringify(readyPath)},'created');return result;};
`,{mode:0o600});
 const runtime=new CustomerRuntimeProcesses(packageRoot,wrapper),env={...session.env,DATABASE_URL:db.href};let api:any;
 // Reviewer execution is a separate customer-scenario gate. This regression
 // seeds real admissions directly and isolates startup/Check publication.
 delete env.AGENTCI_REVIEWER_CONFIG_FILE;
 const events=async()=>{try{return (await readFile(eventsPath,'utf8')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));}catch(error:any){if(error.code==='ENOENT')return [];throw error;}};
 const start=async(flag:undefined|string)=>{await rm(readyPath,{force:true});const values={...env};if(flag===undefined)delete values.AGENTCI_MODEL_REVIEW_CHECKS;else values.AGENTCI_MODEL_REVIEW_CHECKS=flag;await runtime.start('worker',values);};
 const ready=()=>until(async()=>{const owned=runtime.children.get('worker')!;if(owned.child.exitCode!==null)throw Error('Actual installed worker exited before readiness');try{await readFile(readyPath);return true;}catch{return false;}},'actual native Worker.create');
 try{
  for(const file of (await readdir(join(packageRoot,'deploy/migrations'))).filter(file=>file.endsWith('.sql')).sort())await pool.query(await readFile(join(packageRoot,'deploy/migrations',file),'utf8'));
  const example=JSON.parse(await readFile(join(packageRoot,'deploy/reviewers.synthetic.example.json'),'utf8')),profile=await new ReviewerProfileStore(pool,scope).put(example.profiles[0]);
  const request={schemaVersion:'v1alpha1' as const,id:randomUUID(),subject,profile:{id:profile.profile.id,revision:profile.revision},mode:'synthetic' as const};
  const admissions=new ReviewAdmissionStore(pool,scope,{approve:async value=>({requestDigest:digest(canonical(value)),policyDigest:digest('policy'),profileRevision:value.profile.revision,mode:value.mode})});await admissions.admit(request);
  const externalId=`agentci:model-review:4:${subject.baseSha}:${subject.headSha}:${request.id}`;
  const fixture={subject,publicKey:keys.publicKey.export({type:'spki',format:'pem'}).toString(),decoy:{name:'agentci/model-review',head_sha:subject.headSha,external_id:externalId,status:'in_progress'},changedHead:false};
  await writeFile(fixturePath,JSON.stringify(fixture),{mode:0o600});
  for(const flag of [undefined,'false']){
   await start(flag);await ready();await delay(1600);assert.equal(runtime.children.get('worker')!.child.exitCode,null);await runtime.stop('worker');
   assert.equal((await events()).length,0,'disabled worker must not authenticate or publish');
   assert.equal((await pool.query('SELECT acknowledged_generation FROM agentci_model_review_publications WHERE id=$1',[request.id])).rows[0].acknowledged_generation,'0');
  }
  for(const image of [undefined,'ghcr.io/fixture/runner:latest']){await runtime.start('worker',{...env,AGENTCI_EVAL_RUNNER_IMAGE:image});await until(async()=>runtime.children.get('worker')!.child.exitCode!==null,'missing/mutable-pin rejection');assert.equal((await runtime.children.get('worker')!.exited).code,1);await runtime.stop('worker');assert.equal((await events()).length,0);}
  for(const flag of ['null','1']){
   await start(flag);await until(async()=>runtime.children.get('worker')!.child.exitCode!==null,'invalid-flag rejection');const exit=await runtime.children.get('worker')!.exited;assert.equal(exit.code,1);await runtime.stop('worker');assert.equal((await events()).length,0,'invalid configuration never contacts GitHub');
  }
  await start('true');await ready();await until(async()=> (await events()).some(event=>event.kind==='check-created'),'scoped Check');await runtime.stop('worker');
  const created=(await events()).filter(event=>event.kind==='check-created');assert.equal(created.length,1,'wrong-App and wrong-head decoys cannot be patched/reused');
  const check=created[0];assert.equal(check.path,'/repos/fixture/customer/check-runs');assert.equal(check.appId,42);assert.equal(check.installationId,12);assert.equal(check.body.name,'agentci/model-review');assert.equal(check.body.head_sha,subject.headSha);assert.equal(check.body.external_id,externalId);assert.equal(check.body.details_url,env.AGENTCI_PUBLIC_URL+'/v1/model-reviews/'+request.id);assert.match(check.body.output.summary,/Advisory model review: synthetic/);assert.ok(check.body.output.summary.includes(subject.baseSha));assert.ok(check.body.output.summary.includes(subject.headSha));assert.ok(check.body.output.summary.includes(digest(canonical(request))));assert.match(check.body.output.summary,/does not certify merge readiness/);assert.equal(check.body.status,'in_progress');assert.equal(check.body.conclusion,undefined);
  const dispatch=new ReviewDispatchStore(pool,scope),entry=(await dispatch.get(request.id))!,runId=randomUUID();await dispatch.bindRun(request.id,entry.workflowId,runId);await dispatch.finish(request.id,runId,'failed',digest('fixture terminal failure'));
  await start('true');await ready();await until(async()=> (await events()).some(event=>event.kind==='check-updated'&&event.body.status==='completed'),'terminal advisory Check');await runtime.stop('worker');
  const terminal=(await events()).find(event=>event.kind==='check-updated'&&event.body.status==='completed');assert.equal(terminal.body.external_id,externalId);assert.equal(terminal.body.head_sha,subject.headSha);assert.equal(terminal.body.conclusion,'action_required');assert.match(terminal.body.output.summary,/execution failed/);
  // These are the observer's exact completed-Check identity predicates. This
  // regression deliberately makes no physical reproduction/settlement claim.
  const inventory=[{...fixture.decoy,id:901,app:{id:999}},{...fixture.decoy,id:902,app:{id:42},head_sha:'d'.repeat(40)},{...terminal.body,id:903,app:{id:42}}];
  const matches=inventory.filter(run=>run.name==='agentci/model-review'&&run.external_id===externalId&&run.head_sha===subject.headSha&&run.app?.id===42);assert.equal(matches.length,1);assert.equal(matches[0].status,'completed');assert.ok(['neutral','action_required'].includes(matches[0].conclusion));
  const load=(path:string)=>import(pathToFileURL(join(packageRoot,'dist',path)).href),{createControlApi}=await load('apps/control/server.js'),{createModelReviewControl}=await load('apps/control/model-reviews.js'),{ModelReviewClient}=await load('packages/client/model-review.js');
  const auth={...scope,installationId:12,secret:env.GITHUB_WEBHOOK_SECRET,evidenceToken:env.AGENTCI_EVIDENCE_TOKEN,cursorKey:env.AGENTCI_CURSOR_KEY};
  api=createControlApi(auth,{ready:async()=>{},recordDelivery:async()=>{throw Error('Unexpected webhook');},evidence:async()=>undefined},undefined,await createModelReviewControl(pool,auth,null));api.listen(0,'127.0.0.1');await once(api,'listening');
  const client=new ModelReviewClient({url:'http://127.0.0.1:'+api.address().port,readToken:env.AGENTCI_EVIDENCE_TOKEN,maxAttempts:1}),status=await client.show(request);assert.deepEqual(status.admission.request,request);assert.equal(status.execution.state,'failed');assert.equal(status.execution.terminalDigest,digest('fixture terminal failure'));
  let endSeen=false,completion:any;for await(const item of client.modelReviewExport(request)){if(item.type==='record'&&item.frame.type==='end')endSeen=true;if(item.type==='complete'){assert.equal(endSeen,true);completion=item.data;}}
  assert.equal(endSeen,true);assert.equal(completion.complete,true);assert.deepEqual(completion.header.review.admission.request,request);assert.equal(completion.header.review.execution.state,'failed');
  // A new exact admission with a remotely changed head is acknowledged as
  // superseded. No advisory write may target either the old or replacement head.
  const changed={...request,id:randomUUID()};await admissions.admit(changed);await writeFile(fixturePath,JSON.stringify({...fixture,changedHead:true}),{mode:0o600});await start('true');await ready();
  await until(async()=>{const row=(await pool.query('SELECT generation,acknowledged_generation FROM agentci_model_review_publications WHERE id=$1',[changed.id])).rows[0];return row.generation===row.acknowledged_generation;},'changed-head supersession');await runtime.stop('worker');assert.equal((await events()).filter(event=>event.kind==='check-created').length,1);
  assert.equal((await runtime.close()).ownedProcessesRemaining,0);
 }finally{await runtime.close();await session.close();if(api){api.closeAllConnections();await new Promise<void>(resolve=>api.close(()=>resolve()));}await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();await rm(privateRoot,{recursive:true,force:true});}
});
