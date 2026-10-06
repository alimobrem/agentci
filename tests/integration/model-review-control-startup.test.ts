import {ModelReviewExportVerifier} from '../../packages/reviewers/export.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {spawn,type ChildProcess} from 'node:child_process';
import {Pool} from 'pg';
import {ReviewerProfileStore} from '../../packages/storage/reviewer-profiles.ts';
import {ReviewAdmissionStore} from '../../packages/storage/review-admissions.ts';
import {canonical,digest} from '../../packages/review/engine.ts';
import {validateModelReviewStatus} from '../../packages/reviewers/transport.ts';
const databaseUrl=process.env.AGENTCI_TEST_DATABASE_URL;
if(!databaseUrl)throw Error('Compiled control startup acceptance requires real PostgreSQL; never silently skip');
const migrations=['001_m1','002_m2','003_m2_review_recovery','004_m3_model_budget','005_m3_reviewer_results','006_m3_finding_history','008_m3_review_admissions','009_m3_review_dispatch','010_m3_reviewer_profiles','011_m3_review_summaries','012_m3_review_recovery'];
async function unusedPort(){const socket=createServer();await new Promise<void>(resolve=>socket.listen(0,'127.0.0.1',resolve));const address=socket.address();if(!address||typeof address==='string')throw Error();await new Promise<void>(resolve=>socket.close(()=>resolve()));return address.port;}
async function launch(env:NodeJS.ProcessEnv,guard:string){
 const port=await unusedPort(),child=spawn(process.execPath,['--import',guard,new URL('../../dist/apps/control/main.js',import.meta.url).pathname],{env:{...env,AGENTCI_PORT:String(port)},stdio:['ignore','pipe','pipe']});
 let logs='',listened=false;const append=(v:Buffer)=>{logs=(logs+v.toString()).slice(-32768);};child.stdout!.on('data',append);child.stderr!.on('data',append);
 const closed=new Promise<{code:number|null;signal:NodeJS.Signals|null}>(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));
 const ready=new Promise<void>((resolve,reject)=>{
  const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('Compiled control startup timed out'));},10000);timer.unref();
  child.once('error',error=>{clearTimeout(timer);reject(error);});
  child.stdout!.on('data',()=>{if(logs.includes(`AgentCI control API listening on ${port}`)){listened=true;clearTimeout(timer);resolve();}});
  void closed.then(()=>{clearTimeout(timer);resolve();});
 });
 await ready;return {child,closed,origin:`http://127.0.0.1:${port}`,get listened(){return listened;},logs:()=>logs};
}
async function stop(child:ChildProcess,closed:Promise<unknown>){if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');await closed;}
test('compiled control main starts with scoped private config but no model keys, preserves disabled startup, and rejects invalid activation',{timeout:60000},async()=>{
 const admin=new Pool({connectionString:databaseUrl}),directory=await mkdtemp(join(tmpdir(),'agentci-control-startup-')),schemas:string[]=[],pools:Pool[]=[],children:Awaited<ReturnType<typeof launch>>[]=[];
 try{
  const organizationId=randomUUID(),repository='fixture/control',definition=JSON.parse(await readFile(new URL('../../deploy/reviewers.synthetic.example.json',import.meta.url),'utf8'));
  definition.profiles[0].budget.id=randomUUID();
  const key=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}}).privateKey;
  const keyPath=join(directory,'app.pem'),configPath=join(directory,'reviewers.json'),guard=join(directory,'no-external-network.mjs');
  await writeFile(keyPath,key,{mode:0o600});await writeFile(configPath,JSON.stringify(definition),{mode:0o600});
  await writeFile(guard,"globalThis.fetch=async()=>{throw Error('fixture-external-network-forbidden')};\n",{mode:0o600});
  const evidenceToken='read-'+randomUUID(),operatorToken='write-'+randomUUID();
  const environment:NodeJS.ProcessEnv={...process.env,AGENTCI_ORGANIZATION_ID:organizationId,AGENTCI_REPOSITORY:repository,AGENTCI_PUBLIC_URL:'http://127.0.0.1',GITHUB_APP_ID:'123',GITHUB_INSTALLATION_ID:'456',GITHUB_WEBHOOK_SECRET:'webhook-fixture-'+randomUUID(),AGENTCI_EVIDENCE_TOKEN:evidenceToken,AGENTCI_OPERATOR_TOKEN:operatorToken,GITHUB_PRIVATE_KEY_FILE:keyPath,AGENTCI_REVIEWER_CONFIG_FILE:configPath,TEMPORAL_ADDRESS:'127.0.0.1:1'};
  for(const name of ['OPENAI_API_KEY','ANTHROPIC_API_KEY','XAI_API_KEY','NODE_OPTIONS','PGOPTIONS','AGENTCI_CURSOR_KEY'])delete environment[name];
  const database=async(names:string[])=>{const schema=`main_${randomUUID().replaceAll('-','')}`;schemas.push(schema);await admin.query(`CREATE SCHEMA ${schema}`);const pool=new Pool({connectionString:databaseUrl,options:`-c search_path=${schema}`});pools.push(pool);for(const name of names)await pool.query(await readFile(new URL(`../../deploy/migrations/${name}.sql`,import.meta.url),'utf8'));const url=new URL(databaseUrl!);url.searchParams.set('options',`-c search_path=${schema}`);return {pool,url:url.toString()};};
  const full=await database(migrations),scope={organizationId,repository},profiles=new ReviewerProfileStore(full.pool,scope),profile=await profiles.put(definition.profiles[0]),id=randomUUID();
  const admissions=new ReviewAdmissionStore(full.pool,scope,{approve:async request=>({requestDigest:digest(canonical(request)),policyDigest:digest('fixture-scoped-authority'),profileRevision:request.profile.revision,mode:request.mode})});
  await admissions.admit({schemaVersion:'v1alpha1',id,subject:{...scope,pullRequest:1,baseSha:'a'.repeat(40),headSha:'b'.repeat(40)},profile:{id:profile.profile.id,revision:profile.revision},mode:'synthetic'});
  const start=async(extra:NodeJS.ProcessEnv)=>{const process=await launch(extra,guard);children.push(process);return process;};
  const configured=await start({...environment,DATABASE_URL:full.url});assert.equal(configured.listened,true,configured.logs());
  assert.equal((await fetch(configured.origin+'/readyz')).status,200);
  const descriptors=await fetch(configured.origin+'/v1/reviewer-profiles',{headers:{authorization:`Bearer ${evidenceToken}`}});assert.equal(descriptors.status,200);assert.deepEqual(await descriptors.json(),{schemaVersion:'v1alpha1',profiles:[{id:profile.profile.id,revision:profile.revision,mode:'synthetic',revoked:false}]});
  const status=await fetch(configured.origin+'/v1/model-reviews/'+id,{headers:{authorization:`Bearer ${operatorToken}`}});assert.equal(status.status,200);assert.equal(validateModelReviewStatus(await status.json()).execution.state,'queued');
  const exported=await fetch(configured.origin+'/v1/model-reviews/'+id+'/export',{headers:{authorization:`Bearer ${evidenceToken}`}});assert.equal(exported.status,200);
  const verifier=new ModelReviewExportVerifier((await admissions.get(id))!.request);for(const line of (await exported.text()).trimEnd().split('\n'))await verifier.push(JSON.parse(line));const certificate=verifier.finish();assert.equal(certificate.header.review.execution.state,'queued');assert.equal(certificate.header.missingRoleIds.length,profile.profile.reviewers.length);
  assert.equal((await fetch(configured.origin+'/v1/model-reviews/'+id+'/findings',{headers:{authorization:`Bearer ${evidenceToken}`}})).status,503,'No cursor key leaves finding reads unavailable');
  assert.equal((await fetch(configured.origin+'/v1/reviewer-profiles')).status,401);assert.ok(!configured.logs().includes('fixture-external-network-forbidden'));await stop(configured.child,configured.closed);
  const retained=(await admissions.get(id))!;
  const summary={schemaVersion:'v1alpha1',admissionId:id,admissionDigest:retained.digest,profileRevision:profile.revision,contextDigest:digest('fixture-empty-context'),mode:'synthetic',coverage:{selectedFiles:1,configuredRoles:1,completedRoles:1,wholeRepository:false},roles:[{requestId:randomUUID(),role:'security',digest:digest('retained-fixture-role'),status:'completed'}],findings:[]};
  await full.pool.query('INSERT INTO agentci_review_execution_summaries(organization_id,repository,id,summary,digest) VALUES($1,$2,$3,$4,$5)',[organizationId,repository,id,summary,digest(canonical(summary))]);
  const keyed=await start({...environment,DATABASE_URL:full.url,AGENTCI_CURSOR_KEY:'cursor-'+randomUUID()});assert.equal(keyed.listened,true,keyed.logs());
  const findings=await fetch(keyed.origin+'/v1/model-reviews/'+id+'/findings',{headers:{authorization:`Bearer ${evidenceToken}`}});assert.equal(findings.status,200);assert.deepEqual(await findings.json(),{schemaVersion:'v1alpha1',reviewId:id,summaryDigest:digest(canonical(summary)),items:[],nextCursor:null});await stop(keyed.child,keyed.closed);
  // Released/base-only schema starts with no new config, App key or operator key.
  const legacy=await database(migrations.slice(0,3)),disabled:NodeJS.ProcessEnv={...environment,DATABASE_URL:legacy.url};delete disabled.AGENTCI_REVIEWER_CONFIG_FILE;delete disabled.GITHUB_PRIVATE_KEY_FILE;delete disabled.AGENTCI_OPERATOR_TOKEN;
  const off=await start(disabled);assert.equal(off.listened,true,off.logs());assert.equal((await fetch(off.origin+'/readyz')).status,200);assert.deepEqual(await (await fetch(off.origin+'/v1/reviewer-profiles',{headers:{authorization:`Bearer ${evidenceToken}`}})).json(),{schemaVersion:'v1alpha1',profiles:[]});await stop(off.child,off.closed);
  const missingSchema=await database(migrations.filter(name=>name!=='011_m3_review_summaries'));
  for(const [kind,env,message] of [
   ['missing migration',{...environment,DATABASE_URL:missingSchema.url},'reviewer-runtime-storage-unavailable'],
   ['equal cursor and read token',{...environment,DATABASE_URL:full.url,AGENTCI_CURSOR_KEY:evidenceToken},'Cursor key must be independent'],
   ['short cursor key',{...environment,DATABASE_URL:full.url,AGENTCI_CURSOR_KEY:'short'},'Invalid finding cursor key'],
   ['equal tokens',{...environment,DATABASE_URL:full.url,AGENTCI_OPERATOR_TOKEN:evidenceToken},'Invalid model review credentials'],
   ['missing operator token',{...environment,DATABASE_URL:full.url,AGENTCI_OPERATOR_TOKEN:undefined},'Model review mutation credential required'],
  ] as const){const rejected=await start(env);assert.equal(rejected.listened,false,kind);const exit=await rejected.closed;assert.notEqual(exit.code,0,kind);assert.ok(rejected.logs().includes(message),kind);for(const secret of [evidenceToken,operatorToken,key])assert.ok(!rejected.logs().includes(secret),`${kind}: private data leaked`);}
 }finally{for(const child of children)await stop(child.child,child.closed);for(const pool of pools)await pool.end();for(const schema of schemas)await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();await rm(directory,{recursive:true,force:true});}
});
