import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {readFile} from 'node:fs/promises';import {createServer} from 'node:http';import {once} from 'node:events';import {spawn} from 'node:child_process';import {Octokit} from '@octokit/rest';import {Pool} from 'pg';
import {initializeModelReviewCheckScheduler} from '../../apps/worker/model-review-publication.ts';
import {ReviewAdmissionStore} from '../../packages/storage/review-admissions.ts';import {ReviewDispatchStore} from '../../packages/storage/review-dispatch.ts';
import {createModelReviewControl} from '../../apps/control/model-reviews.ts';import {createControlApi} from '../../apps/control/server.ts';
import {canonical,digest} from '../../packages/review/engine.ts';
const url=process.env.AGENTCI_TEST_DATABASE_URL;if(!url)throw Error('Publication scheduler acceptance requires real PostgreSQL; never silently skip');
test('durable model Check scheduler recovers lost responses/process death and serves authenticated exact evidence',{timeout:45000},async()=>{
 const schema=`check_scheduler_${randomUUID().replaceAll('-','')}`,admin=new Pool({connectionString:url});await admin.query(`CREATE SCHEMA ${schema}`);const pool=new Pool({connectionString:url,options:`-c search_path=${schema}`});
 const scope={organizationId:randomUUID(),repository:'fixture/repo'},subject={...scope,pullRequest:1,baseSha:'a'.repeat(40),headSha:'b'.repeat(40)},auth={...scope,installationId:12,secret:'fixture-webhook-secret'.repeat(2),evidenceToken:'fixture-evidence-token'.repeat(2)};
 const state={runs:[] as any[],writes:0,lostResponse:false,rateLimit:false,retryAfter:'120'};let mutateDuringWrite:(()=>Promise<void>)|undefined;
 const gh=createServer(async(req,res)=>{
  if(req.headers.authorization!=='token fixture-http-token'){res.writeHead(401);res.end('{}');return;}
  let result:any;const path=new URL(req.url!,'http://localhost').pathname;
  if(state.rateLimit){state.rateLimit=false;res.writeHead(429,{'content-type':'application/json','retry-after':state.retryAfter});res.end('{"message":"private provider response"}');return;}
  if(req.method==='GET'&&path.endsWith('/pulls/1'))result={state:'open',base:{sha:subject.baseSha},head:{sha:subject.headSha}};
  else if(req.method==='GET'&&path.endsWith('/check-runs'))result={total_count:state.runs.length,check_runs:state.runs};
  else if(['POST','PATCH'].includes(req.method!)&&path.includes('/check-runs')){
   let raw='';for await(const bytes of req)raw+=bytes;const body=JSON.parse(raw);state.writes++;
   if(req.method==='POST'){result={...body,id:state.writes+100,app:{id:42}};state.runs.push(result);}else{result=state.runs.find(run=>run.id===Number(path.split('/').at(-1)));Object.assign(result,body);}
   if(mutateDuringWrite){const operation=mutateDuringWrite;mutateDuringWrite=undefined;await operation();}
   if(state.lostResponse){state.lostResponse=false;res.writeHead(503,{'content-type':'application/json'});res.end('{"message":"private provider response"}');return;}
  }else{res.writeHead(404);res.end('{}');return;}
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(result));
 });gh.listen(0,'127.0.0.1');await once(gh,'listening');
 let api:ReturnType<typeof createControlApi>|undefined,child:ReturnType<typeof spawn>|undefined;
 try{
  for(const name of ['008_m3_review_admissions','009_m3_review_dispatch','011_m3_review_summaries','012_m3_review_recovery','013_model_review_publication'])await pool.query(await readFile(new URL(`../../deploy/migrations/${name}.sql`,import.meta.url),'utf8'));
  const backend=await createModelReviewControl(pool,auth);api=createControlApi(auth,{ready:async()=>{},evidence:async()=>undefined,recordDelivery:async()=>'accepted'},undefined,backend);api.listen(0,'127.0.0.1');await once(api,'listening');
  const publicUrl=`http://127.0.0.1:${(api.address() as {port:number}).port}`,baseUrl=`http://127.0.0.1:${(gh.address() as {port:number}).port}`,config={...scope,appId:42,installationId:12,publicUrl};
  const client=()=>new Octokit({baseUrl,auth:'fixture-http-token',log:{debug(){},info(){},warn(){},error(){}}}),init=()=>initializeModelReviewCheckScheduler(pool,client(),{...config,organizationId:config.organizationId.toUpperCase()},{AGENTCI_MODEL_REVIEW_CHECKS:'true'});
  assert.equal(await initializeModelReviewCheckScheduler({} as Pool,{} as Octokit,config,{}),null);await assert.rejects(initializeModelReviewCheckScheduler(pool,client(),config,{AGENTCI_MODEL_REVIEW_CHECKS:'1'}),/invalid-model-review/);
  const admissions=new ReviewAdmissionStore(pool,scope,{approve:async request=>({requestDigest:digest(canonical(request)),policyDigest:digest('policy'),profileRevision:request.profile.revision,mode:request.mode})}),dispatch=new ReviewDispatchStore(pool,scope);
  const request={schemaVersion:'v1alpha1' as const,id:randomUUID(),subject,profile:{id:'fixture',revision:digest('profile')},mode:'synthetic' as const};await admissions.admit(request);
  assert.equal(await initializeModelReviewCheckScheduler(pool,client(),config,{AGENTCI_MODEL_REVIEW_CHECKS:'false'}),null);assert.equal(state.writes,0);assert.equal((await pool.query('SELECT acknowledged_generation FROM agentci_model_review_publications WHERE id=$1',[request.id])).rows[0].acknowledged_generation,'0','disabled capability retains queued work for re-enable');
  state.lostResponse=true;assert.equal((await (await init())!.tick()).deferred,1);assert.equal(state.runs.length,1);
  await pool.query("UPDATE agentci_model_review_publications SET retry_after=clock_timestamp()-interval '1 second'");
  assert.equal((await (await init())!.tick()).published,1);assert.equal(state.runs.length,1,'lost-response retry reconciles same Check');
  const quietWrites=state.writes;assert.equal((await (await init())!.tick()).attempted,0);assert.equal(state.writes,quietWrites,'unchanged evidence is not repeatedly published');
  const evidenceUrl=state.runs[0].details_url;assert.equal((await fetch(evidenceUrl)).status,401);const response=await fetch(evidenceUrl,{headers:{authorization:`Bearer ${auth.evidenceToken}`}});assert.equal(response.status,200);const body=await response.json() as any;assert.equal(body.admission.request.id,request.id);assert.equal(body.admission.digest,digest(canonical(request)));assert.equal(response.headers.get('cache-control'),'no-store');
  // A newer generation committed during the remote write must survive its old ack.
  await dispatch.requestCancellation(request.id);let stop=false;mutateDuringWrite=async()=>{const current=(await dispatch.get(request.id))!,runId=randomUUID();await dispatch.bindRun(request.id,current.workflowId,runId);await dispatch.finish(request.id,runId,'terminated',digest('terminated'));stop=true;};
  assert.equal((await (await init())!.tick(()=>stop)).published,1);
  const pending=(await pool.query('SELECT generation,acknowledged_generation FROM agentci_model_review_publications WHERE id=$1',[request.id])).rows[0];assert.ok(BigInt(pending.generation)>BigInt(pending.acknowledged_generation));
  assert.equal((await (await init())!.tick()).published,1);assert.equal(state.runs[0].conclusion,'action_required');assert.match(state.runs[0].output.summary,/execution terminated/);
  // Kill a real publisher process after GitHub commits, before its SQL ack.
  const crashRequest={...request,id:randomUUID()};await admissions.admit(crashRequest);
  const code=`import {Pool} from 'pg';import {Octokit} from '@octokit/rest';import {ModelReviewPublicationOutbox} from './packages/storage/model-review-publication-outbox.ts';import {ModelReviewReads} from './packages/storage/model-review-reads.ts';import {modelReviewPublicationSource} from './packages/storage/model-review-publication.ts';import {createModelReviewPublisher} from './packages/github/model-review-check.ts';const config=JSON.parse(process.env.CHECK_TEST_CONFIG),pool=new Pool({connectionString:process.env.AGENTCI_TEST_DATABASE_URL,options:'-c search_path='+process.env.CHECK_TEST_SCHEMA});const queue=new ModelReviewPublicationOutbox(pool,config),claim=await queue.claim(),snapshot=await new ModelReviewReads(pool,config).status(claim.id);await createModelReviewPublisher(new Octokit({baseUrl:process.env.CHECK_TEST_GITHUB,auth:'fixture-http-token'}),modelReviewPublicationSource(pool,config),config)(snapshot.admission.request);process.stdout.write('remote-committed\\n');setInterval(()=>{},1000);`;
  child=spawn(process.execPath,['--import','tsx','--input-type=module','-e',code],{cwd:new URL('../../',import.meta.url).pathname,env:{...process.env,CHECK_TEST_CONFIG:JSON.stringify(config),CHECK_TEST_SCHEMA:schema,CHECK_TEST_GITHUB:baseUrl},stdio:['ignore','pipe','pipe']});
  const [signal]=await once(child.stdout!,'data',{signal:AbortSignal.timeout(15000)});assert.match(signal.toString(),/remote-committed/);const exited=once(child,'exit');child.kill('SIGKILL');await exited;child=undefined;
  const count=state.runs.length;await pool.query("UPDATE agentci_model_review_publications SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[crashRequest.id]);assert.equal((await (await init())!.tick()).published,1);assert.equal(state.runs.length,count,'crash recovery does not duplicate remotely committed create');
  await dispatch.requestCancellation(crashRequest.id);state.rateLimit=true;assert.equal((await (await init())!.tick()).deferred,1);
  const rateRow=(await pool.query('SELECT last_error,retry_after>clock_timestamp()+interval \'110 seconds\' AS cooling FROM agentci_model_review_publications WHERE id=$1',[crashRequest.id])).rows[0];assert.equal(rateRow.last_error,'rate-limit');assert.equal(rateRow.cooling,true);
  await admissions.admit({...request,id:randomUUID()});assert.equal((await (await init())!.tick()).attempted,0,'fresh process client/new admission cannot bypass persisted cooldown');
  await pool.query("UPDATE agentci_model_review_publication_cooldowns SET retry_after=clock_timestamp()-interval '1 second'");await pool.query("UPDATE agentci_model_review_publications SET retry_after=clock_timestamp()-interval '1 second'");state.rateLimit=true;state.retryAfter='999999999999';assert.equal((await (await init())!.tick()).deferred,1);const bounded=(await pool.query("SELECT retry_after BETWEEN clock_timestamp()+interval '50 seconds' AND clock_timestamp()+interval '65 seconds' AS bounded FROM agentci_model_review_publication_cooldowns")).rows[0];assert.equal(bounded.bounded,true,'implausible metadata falls back to one minute rather than a permanent stall');
  assert.ok(!JSON.stringify(state.runs).includes('fixture-http-token'));assert.ok(!JSON.stringify(state.runs).includes('private provider response'));
 }finally{if(child&&child.exitCode===null&&child.signalCode===null){const exited=once(child,'exit');child.kill('SIGKILL');await exited;}if(api)await new Promise<void>(resolve=>api!.close(()=>resolve()));await new Promise<void>(resolve=>gh.close(()=>resolve()));await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
