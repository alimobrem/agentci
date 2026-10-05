import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {Octokit} from '@octokit/rest';
import {Pool} from 'pg';
import {canonical,digest} from '../../packages/review/engine.ts';
import {ReviewAdmissionStore} from '../../packages/storage/review-admissions.ts';
import {ReviewDispatchStore} from '../../packages/storage/review-dispatch.ts';
import {modelReviewPublicationSource} from '../../packages/storage/model-review-publication.ts';
import {createModelReviewPublisher} from '../../packages/github/model-review-check.ts';

const url=process.env.AGENTCI_TEST_DATABASE_URL;
if(!url)throw Error('Model Check acceptance requires real PostgreSQL; never silently skip');
test('model Check HTTP publication fences retries across controllers and reconciles committed remote writes',{timeout:30000},async()=>{
 const schema=`modelcheck_${randomUUID().replaceAll('-','')}`,admin=new Pool({connectionString:url});await admin.query(`CREATE SCHEMA ${schema}`);
 const pool=new Pool({connectionString:url,options:`-c search_path=${schema}`,connectionTimeoutMillis:5000,query_timeout:10000});
 const scope={organizationId:randomUUID(),repository:'fixture/repo'},subject={...scope,pullRequest:1,baseSha:'a'.repeat(40),headSha:'b'.repeat(40)};
 const state={runs:[] as any[],writes:0,stale:false,staleAfterList:false,lostResponse:false};
 let releaseWrite:()=>void=()=>{},onWrite:()=>void=()=>{},holdWrite=false;
 const server=createServer(async(req,res)=>{
  if(req.headers.authorization!=='token fixture-http-credential'){res.writeHead(401);res.end('{}');return;}
  const path=new URL(req.url!,'http://localhost').pathname;let data:any;
  if(req.method==='GET'&&path.endsWith('/pulls/1'))data={state:'open',base:{sha:subject.baseSha},head:{sha:state.stale?'c'.repeat(40):subject.headSha}};
  else if(req.method==='GET'&&path.endsWith('/check-runs')){data={total_count:state.runs.length,check_runs:state.runs};if(state.staleAfterList)state.stale=true;}
  else if(['POST','PATCH'].includes(req.method!)&&path.includes('/check-runs')){
   let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);state.writes++;
   if(req.method==='POST'){data={...body,id:100+state.writes,app:{id:42}};state.runs.push(data);}else{data=state.runs.find(run=>run.id===Number(path.split('/').at(-1)));assert.ok(data);Object.assign(data,body);}
   if(holdWrite){onWrite();await new Promise<void>(resolve=>{releaseWrite=resolve;});}
   if(state.lostResponse){state.lostResponse=false;res.writeHead(503,{'content-type':'application/json'});res.end('{"message":"private-remote-error"}');return;}
  }else{res.writeHead(404);res.end('{}');return;}
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(data));
 });server.listen(0,'127.0.0.1');await once(server,'listening');
 try{
  for(const name of ['008_m3_review_admissions','009_m3_review_dispatch','011_m3_review_summaries','012_m3_review_recovery'])await pool.query(await readFile(new URL(`../../deploy/migrations/${name}.sql`,import.meta.url),'utf8'));
  const admissions=new ReviewAdmissionStore(pool,scope,{approve:async request=>({requestDigest:digest(canonical(request)),policyDigest:digest('trusted'),profileRevision:request.profile.revision,mode:request.mode})});
  const request={schemaVersion:'v1alpha1' as const,id:randomUUID(),subject,profile:{id:'fixture-profile',revision:digest('profile')},mode:'synthetic' as const};await admissions.admit(request);
  const config={...scope,appId:42,installationId:12,publicUrl:'https://agentci.example'},client=new Octokit({baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}`,auth:'fixture-http-credential',log:{debug(){},info(){},warn(){},error(){}}});
  const publish=createModelReviewPublisher(client,modelReviewPublicationSource(pool,scope),config);
  // A second independent source instance must share the PostgreSQL lock.
  const second=createModelReviewPublisher(client,modelReviewPublicationSource(pool,scope),config);
  state.runs.push({id:1,name:'agentci/review',head_sha:subject.headSha,external_id:'other',app:{id:42}},{id:2,name:'agentci/evals',head_sha:subject.headSha,external_id:'other',app:{id:42}});
  state.lostResponse=true;await assert.rejects(publish(request),/^Error: model-review-publication-unavailable$/);assert.equal(state.runs.length,3);
  assert.equal(await second(request),'published');assert.equal(state.runs.length,3,'committed write reconciles rather than creates duplicate');
  assert.equal(state.runs[2].status,'in_progress');assert.equal(state.runs[2].conclusion,undefined);assert.ok(!JSON.stringify(state.runs).includes('fixture-http-credential'));assert.ok(!JSON.stringify(state.runs).includes('private-remote-error'));
  const writes=state.writes;state.staleAfterList=true;assert.equal(await publish(request),'superseded');assert.equal(state.writes,writes);state.stale=false;state.staleAfterList=false;
  holdWrite=true;const started=new Promise<void>(resolve=>{onWrite=resolve;});const oldPublishing=publish(request);await started;
  const newer={...request,id:randomUUID()};await admissions.admit(newer);
  await assert.rejects(second(newer),/^Error: model-review-publication-unavailable$/,'second controller cannot write while old publisher holds subject lock');
  holdWrite=false;releaseWrite();assert.equal(await oldPublishing,'published');assert.equal(await second(newer),'published');
  assert.equal(state.runs[2].status,'completed');assert.equal(state.runs[2].conclusion,'neutral');assert.match(state.runs[2].output.title,/superseded/);
  const afterNew=state.writes;assert.equal(await publish(request),'superseded');assert.equal(state.writes,afterNew,'old retry never writes after newer admission publication');
  const dispatch=new ReviewDispatchStore(pool,scope),record=(await dispatch.get(newer.id))!,runId=randomUUID();await dispatch.bindRun(newer.id,record.workflowId,runId);await dispatch.finish(newer.id,runId,'failed',digest('failed'));
  assert.equal(await publish(newer),'published');assert.equal(state.runs.at(-1).status,'completed');assert.equal(state.runs.at(-1).conclusion,'action_required');assert.match(state.runs.at(-1).output.summary,/Coverage unknown/);
  assert.equal(await second(newer),'published');assert.equal(state.runs.at(-1).status,'completed','retry reloads terminal state rather than old progress');
  assert.deepEqual(state.runs.slice(0,2).map(run=>run.name),['agentci/review','agentci/evals']);assert.ok(state.runs.slice(0,2).every(run=>run.output===undefined));
  assert.equal(state.runs.at(-1).details_url,`https://agentci.example/v1/model-reviews/${newer.id}`);
  const completed=structuredClone(state.runs.at(-1));
  const prefix=`agentci:model-review:${subject.pullRequest}:${subject.baseSha}:${subject.headSha}:`;
  const foreign={id:900,name:'agentci/model-review',head_sha:subject.headSha,external_id:prefix+request.id,app:{id:99},status:'in_progress'};
  const unretained={id:901,name:'agentci/model-review',head_sha:subject.headSha,external_id:prefix+randomUUID(),app:{id:42},status:'in_progress'};
  state.runs.push(foreign,unretained);
  const oldRuns=[];
  for(let i=0;i<21;i++){const old={...request,id:randomUUID()};await admissions.admit(old);const run={id:1000+i,name:'agentci/model-review',head_sha:subject.headSha,external_id:prefix+old.id,app:{id:42},status:'in_progress'};state.runs.push(run);oldRuns.push(run);}
  const latest={...request,id:randomUUID()};await admissions.admit(latest);
  await assert.rejects(publish(latest),/^Error: model-review-publication-unavailable$/);
  assert.equal(oldRuns.filter(run=>run.status==='completed').length,20,'cleanup pass has a fixed write bound');
  assert.equal(await second(latest),'published');assert.ok(oldRuns.every(run=>run.status==='completed'),'next pass converges without abandoned progress Checks');
  assert.equal(foreign.status,'in_progress');assert.equal(unretained.status,'in_progress');
  assert.deepEqual(state.runs.find(run=>run.id===completed.id),completed,'completed evidence is never rewritten by supersession cleanup');
  const currentRun=structuredClone(state.runs.at(-1));assert.equal(await publish(request),'superseded');assert.deepEqual(state.runs.at(-1),currentRun,'old retry cannot mutate newer Check');

 }finally{holdWrite=false;releaseWrite();await new Promise<void>(resolve=>server.close(()=>resolve()));await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
