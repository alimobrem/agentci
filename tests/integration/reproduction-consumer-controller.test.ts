import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Octokit} from '@octokit/rest';
import {reproductionStagingFixture} from '../helpers/reproduction-staging-fixture.ts';
import {Store} from '../../packages/storage/postgres.ts';
import {ReproductionAuthorityStore} from '../../packages/storage/reproduction-authority.ts';
import {canonical,digest} from '../../packages/review/engine.ts';
import {parseReproductionCatalog} from '../../packages/runtime/reproduction-catalog.ts';
import {initializeReproductionController} from '../../apps/worker/reproduction-consumer-controller.ts';

async function fixture(expired=false){
 const f=await reproductionStagingFixture();
 try{
  await new Store(f.pool,f.scope.organizationId,f.scope.repository).ready();
  for(const n of ['015_m3_reproduction_eval_source','016_m3_reproduction_authority','017_m3_reproduction_dispatch_state','018_m3_reproduction_dispatch_settlement'])await f.pool.query(await readFile(new URL(`../../deploy/migrations/${n}.sql`,import.meta.url),'utf8'));
  const document={schemaVersion:'v1alpha1' as const,...f.scope,plans:[{digest:digest(canonical(f.f.plan)),plan:f.f.plan}]};
  const authority=new ReproductionAuthorityStore(f.pool,f.scope,{finding:async()=>f.f.initial,plan:async()=>f.f.plan,snapshot:async(_subject,side)=>f.f[side]},async()=>true);
  const expected=await authority.apply({schemaVersion:'v1alpha1',...f.scope,revision:1,approvals:[{planId:f.f.plan.id,planDigest:digest(canonical(f.f.plan)),findingId:f.f.initial.id,findingVersion:1,findingDigest:digest(canonical(f.f.initial)),enabled:true,expiresAt:expired?'2000-01-01T00:00:00.000Z':'2100-01-01T00:00:00.000Z'}]},null);
  await f.store.reserve(f.f.initial.id,f.selector);
  const config={...f.scope,installationId:123,cursorKey:'independent-cursor-key-'.repeat(3),evidenceToken:'read-token',operatorToken:'operator-token'},runtime={catalog:parseReproductionCatalog(document,f.scope,digest(canonical(document))),expected,evalTaskQueue:'agentci-eval-v1'};
  let mode='live';const calls:{path:string;signal:boolean}[]=[];
  const github=new Octokit({request:{fetch:async(input:RequestInfo|URL,init?:RequestInit)=>{
   const path=new URL(String(input)).pathname;calls.push({path,signal:!!init?.signal});
   if(mode==='outage')return new Response(JSON.stringify({message:'private fixture outage'}),{status:503,headers:{'content-type':'application/json'}});
   if(mode==='sources'){
    const blobs=new Map<string,string>();
    for(const side of ['base','head'] as const){const snapshot=f.f[side],treeSha=(side==='base'?'c':'d').repeat(40),tree=Object.entries(snapshot.files).map(([name,text])=>{const bytes=Buffer.from(text),sha=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');blobs.set(sha,text);return {path:name,mode:'100644',type:'blob',sha,size:bytes.length};});
     if(path.endsWith(`/git/commits/${snapshot.sha}`))return Response.json({sha:snapshot.sha,tree:{sha:treeSha}});
     if(path.endsWith(`/git/trees/${treeSha}`))return Response.json({sha:treeSha,truncated:false,tree});
    }
    const sha=path.split('/').at(-1)!;if(path.includes('/git/blobs/')&&blobs.has(sha))return Response.json({sha,encoding:'base64',content:Buffer.from(blobs.get(sha)!).toString('base64')});
   }
   if(path.endsWith('/installation'))return Response.json({id:mode==='installation'?456:123,suspended_at:mode==='suspended'?'2026-01-01T00:00:00Z':null});
   if(path.includes('/pulls/'))return Response.json({number:f.f.finding.subject.pullRequest,state:mode==='closed'?'closed':'open',base:{sha:f.f.finding.subject.baseSha,repo:{full_name:mode==='repository'?'other/repo':f.scope.repository}},head:{sha:mode==='stale'?'f'.repeat(40):f.f.finding.subject.headSha}});
   throw Error('Unexpected source fetch during permission/startup');
  }}});
  const start=()=>initializeReproductionController(f.pool,github,config,runtime);
  return {...f,config,runtime,github,start,calls,setMode:(next:string)=>{mode=next;}};
 }catch(error){await f.close();throw error;}
}
async function bind(f:Awaited<ReturnType<typeof fixture>>,controller:Awaited<ReturnType<typeof initializeReproductionController>>){
 // Worker tick owns recurring backfill; reservations created after migration are not yet claimable.
 assert.equal(await controller.dispatch.claim(),undefined);
 await controller.dispatch.backfill();
 const claim=await controller.dispatch.claim();assert.ok(claim);return controller.dispatch.bind(claim,{taskQueue:'agentci-review-v1',evalTaskQueue:'agentci-eval-v1',config:f.runtime.expected});
}
test('controller startup validates expected authority without installing config or contacting GitHub; outage cleanup remains available',async()=>{
 const f=await fixture();try{
  f.setMode('outage');await assert.rejects(initializeReproductionController(f.pool,f.github,f.config,{...f.runtime,expected:{...f.runtime.expected,revision:2}}),/config-unavailable/);
  assert.equal((await f.pool.query('SELECT count(*) FROM agentci_reproduction_config_versions')).rows[0].count,'1');assert.equal(f.calls.length,0);
  const c=await f.start(),entry=await bind(f,c);assert.equal(f.calls.length,0);assert.deepEqual(await c.configIdentity(),f.runtime.expected);
  await c.dispatch.requestCancellation(entry.operationId,'user');assert.deepEqual(await c.activities.stageAdmittedReproduction(entry.operationId,entry.attempt!.token),{kind:'not-started'});
  assert.equal(f.calls.length,0);assert.equal((await f.pool.query('SELECT count(*) FROM agentci_reproduction_non_execution')).rows[0].count,'1');assert.equal((await f.pool.query('SELECT count(*) FROM agentci_eval_jobs')).rows[0].count,'0');
 }finally{await f.close();}
});
test('controller rejects malformed or shared cursor keys and mismatched catalog scope before any remote request',async()=>{
 const f=await fixture();try{
  for(const cursorKey of [undefined,'short','a'.repeat(32)+'\n',f.config.evidenceToken,f.config.operatorToken])await assert.rejects(initializeReproductionController(f.pool,f.github,{...f.config,cursorKey},f.runtime));
  await assert.rejects(initializeReproductionController(f.pool,f.github,{...f.config,evidenceToken:f.config.cursorKey},f.runtime));
  await assert.rejects(initializeReproductionController(f.pool,f.github,{...f.config,repository:'other/repo'},f.runtime));
  assert.equal(f.calls.length,0);assert.equal((await f.pool.query('SELECT count(*) FROM agentci_reproduction_config_versions')).rows[0].count,'1');
 }finally{await f.close();}
});
test('actual controller authority checks fresh installation and exact open PR, preserving outage as unavailable',async()=>{
 const f=await fixture();try{
  const c=await f.start(),entry=await bind(f,c),check=()=>c.activities.checkAdmittedReproduction(entry.operationId,entry.attempt!.token);
  assert.deepEqual(await check(),{allowed:true});assert.equal(f.calls.length,4);assert.ok(f.calls.every(x=>x.signal));
  for(const mode of ['stale','closed','repository','installation','suspended']){f.setMode(mode);await assert.rejects(check(),/reproduction-authority-conflict/);}
  f.setMode('outage');await assert.rejects(check(),/reproduction-authority-unavailable/);
  assert.equal((await c.dispatch.get(entry.operationId))!.cancellation,null);assert.equal((await f.pool.query('SELECT count(*) FROM agentci_reproduction_non_execution')).rows[0].count,'0');
  f.setMode('live');assert.deepEqual(await check(),{allowed:true});
 }finally{await f.close();}
});
test('expired applied approval fails actual controller permission boundary without producing execution or proof',async()=>{
 const f=await fixture(true);try{const c=await f.start(),entry=await bind(f,c);assert.deepEqual(await c.activities.checkAdmittedReproduction(entry.operationId,entry.attempt!.token),{allowed:false});assert.equal(f.calls.length,0);assert.equal((await f.pool.query('SELECT count(*) FROM agentci_eval_jobs')).rows[0].count,'0');assert.equal((await f.pool.query('SELECT count(*) FROM agentci_reproduction_non_execution')).rows[0].count,'0');}finally{await f.close();}
});

test('actual controller stages from exact Git blobs and historical finding without fabricating a legacy review',async()=>{
 const f=await fixture();try{const c=await f.start(),entry=await bind(f,c);assert.equal(f.calls.length,0);f.setMode('sources');const staged=await c.activities.stageAdmittedReproduction(entry.operationId,entry.attempt!.token);assert.equal(staged.kind,'staged');assert.equal((await f.pool.query('SELECT count(*) FROM agentci_eval_jobs WHERE source IS NOT NULL AND review_id IS NULL')).rows[0].count,'1');assert.equal((await f.pool.query('SELECT count(*) FROM agentci_reviews')).rows[0].count,'0');assert.equal((await f.pool.query('SELECT count(*) FROM agentci_reproduction_config_versions')).rows[0].count,'1');assert.ok(f.calls.some(x=>x.path.includes('/git/blobs/')));assert.equal(f.calls.filter(x=>x.path.endsWith('/installation')).length,2);assert.deepEqual(await c.activities.checkAdmittedReproduction(entry.operationId,entry.attempt!.token),{allowed:true});}finally{await f.close();}
});
