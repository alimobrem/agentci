import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {readFile} from 'node:fs/promises';import {Pool} from 'pg';
import {Client,Connection} from '@temporalio/client';import {NativeConnection,Worker} from '@temporalio/worker';
import {canonical,digest} from '../../packages/review/engine.ts';
import {ReviewAdmissionStore} from '../../packages/storage/review-admissions.ts';
import {ReviewDispatchStore} from '../../packages/storage/review-dispatch.ts';
import {ReviewerProfileStore} from '../../packages/storage/reviewer-profiles.ts';
import {ReviewSummaryStore} from '../../packages/storage/review-summaries.ts';
import {createAdmittedReviewExecution} from '../../apps/worker/reviewer-execution.ts';
import {createAdmittedReviewActivities} from '../../apps/worker/reviewer-activities.ts';
import {setTimeout as delay} from 'node:timers/promises';
import {reconcileAdmittedReviews} from '../../apps/worker/reviewer-recovery.ts';
import {dispatchAdmittedReviews} from '../../apps/worker/reviewer-dispatch.ts';
import {findingProposalSchema} from '../../packages/findings/model.ts';
import {ProviderFailure,type ModelProvider} from '../../packages/providers/types.ts';
const url=process.env.AGENTCI_TEST_DATABASE_URL,address=process.env.AGENTCI_TEST_TEMPORAL_ADDRESS;if(!url||!address)throw Error('Admitted activity acceptance requires real PostgreSQL and Temporal; never silently skip');
test('real reviewer activities recover committed summaries, cancel provider execution and exclude private history',{timeout:60000},async()=>{
 const schema=`activities_${randomUUID().replaceAll('-','')}`,admin=new Pool({connectionString:url});await admin.query(`CREATE SCHEMA ${schema}`);const pool=new Pool({connectionString:url,options:`-c search_path=${schema}`});
 const connection=await Connection.connect({address}),native=await NativeConnection.connect({address}),client=new Client({connection});
 const queue=`admitted-${randomUUID()}`,workflowsPath=new URL('../../dist/apps/worker/reviewer-workflows.js',import.meta.url).pathname;
 let releaseSummary:()=>void=()=>{};let worker:Worker|undefined,running:Promise<void>|undefined;const handles:ReturnType<typeof client.workflow.getHandle>[]=[];
 try{
  for(const name of ['004_m3_model_budget','005_m3_reviewer_results','006_m3_finding_history','008_m3_review_admissions','009_m3_review_dispatch','010_m3_reviewer_profiles','011_m3_review_summaries','012_m3_review_recovery'])await pool.query(await readFile(new URL(`../../deploy/migrations/${name}.sql`,import.meta.url),'utf8'));
  const scope={organizationId:randomUUID(),repository:'owner/repo'},profiles=new ReviewerProfileStore(pool,scope),input=JSON.parse(await readFile(new URL('../../specs/api/fixtures/reviewer-profile.json',import.meta.url),'utf8'));input.budget.id=randomUUID();input.reviewers[0].responseSchema=findingProposalSchema;const profile=await profiles.put(input);
  const admissions=new ReviewAdmissionStore(pool,scope,{approve:async r=>({requestDigest:digest(canonical(r)),policyDigest:digest('fixture-policy'),profileRevision:r.profile.revision,mode:r.mode})}),dispatch=new ReviewDispatchStore(pool,scope),summaries=new ReviewSummaryStore(pool,scope);
  const admit=async()=>{const id=randomUUID();await admissions.admit({schemaVersion:'v1alpha1',id,subject:{...scope,pullRequest:1,baseSha:'a'.repeat(40),headSha:'b'.repeat(40)},profile:{id:profile.profile.id,revision:profile.revision},mode:'synthetic'});return id;};
  let calls=0,hold=false,entered:()=>void=()=>{};const content='UNTRUSTED_SOURCE_SENTINEL';
  const provider:ModelProvider={id:'fixture',upstreamIdentity:'fixture',capabilities:()=>({stream:false,tools:false,structuredOutput:true,developerInstructions:false,extensions:false}),estimateCost:()=>({upperBoundUsdMicros:10,pricingRevision:'fixture',maxInputTokens:20000,maxOutputTokens:256}),async invoke(request,context){calls++;if(hold){entered();await new Promise<never>((_resolve,reject)=>{const cancel=()=>reject(new ProviderFailure('cancelled',false,'possibly-sent'));context.signal.addEventListener('abort',cancel,{once:true});if(context.signal.aborted)cancel();});}return {schemaVersion:'v1alpha1',requestId:request.requestId,attemptId:context.attemptId,provider:request.provider,model:request.model,status:'completed',text:'PRIVATE_PROVIDER_OUTPUT',structuredOutput:{findings:[]},toolCalls:[],usage:{inputTokens:1,outputTokens:1,costUsdMicros:1,costKind:'reported',pricingRevision:null},providerRequestId:null};},async *stream(){throw Error('unused');}};
  const execute=createAdmittedReviewExecution({pool,scope,admissions,registrations:[{provider,execution:'fixture'}],authorize:async()=>null,readSnapshot:async(_repo,sha)=>({sha,files:{'src/main.ts':content}})});
  let loseResponse=true,holdAfterSummary=false,summaryReady:()=>void=()=>{};
  const activities=createAdmittedReviewActivities({dispatch,summaries,execute:async(...args)=>{const result=await execute(...args);if(holdAfterSummary){summaryReady();await new Promise<void>(resolve=>{releaseSummary=resolve;});}if(loseResponse){loseResponse=false;throw Error('PRIVATE_LOST_RESPONSE_DETAIL');}return result;}});
  worker=await Worker.create({connection:native,taskQueue:queue,workflowsPath,activities});running=worker.run();
  const start=async(id:string)=>{await dispatchAdmittedReviews(dispatch,client,{taskQueue:queue,timeoutMs:45000});const state=(await dispatch.get(id))!,handle=client.workflow.getHandle(state.workflowId,state.runId!);handles.push(handle);return handle;};
  const id=await admit(),handle=await start(id);assert.equal(await handle.result(),id);assert.equal(calls,1);const saved=(await summaries.get(id))!;assert.equal((await dispatch.get(id))?.terminal?.digest,saved.digest);
  const history=await handle.fetchHistory();await Worker.runReplayHistory({workflowsPath},history,handle.workflowId);
  const payloadTexts:string[]=[];const visit=(value:any)=>{if(value instanceof Uint8Array){payloadTexts.push(Buffer.from(value).toString('utf8'));return;}if(value&&typeof value==='object')for(const child of Object.values(value))visit(child);else if(typeof value==='string')payloadTexts.push(value);};visit(history);
  for(const forbidden of [content,'PRIVATE_PROVIDER_OUTPUT','PRIVATE_LOST_RESPONSE_DETAIL'])assert.ok(!payloadTexts.some(text=>text.includes(forbidden)),`${forbidden} must stay outside workflow history`);
  const cancelled=await admit();await dispatch.requestCancellation(cancelled);const queued=await start(cancelled);await assert.rejects(queued.result());assert.equal((await dispatch.get(cancelled))?.terminal?.status,'cancelled');assert.equal(calls,1);
  hold=true;const observed=new Promise<void>(resolve=>{entered=resolve;}),inflight=await admit(),active=await start(inflight);await observed;await dispatch.requestCancellation(inflight);await assert.rejects(active.result());assert.equal((await dispatch.get(inflight))?.terminal?.status,'cancelled');assert.equal(calls,2);assert.equal(await summaries.get(inflight),undefined);
  await Worker.runReplayHistory({workflowsPath},await queued.fetchHistory(),queued.workflowId);await Worker.runReplayHistory({workflowsPath},await active.fetchHistory(),active.workflowId);
  assert.equal((await pool.query("SELECT count(*) FROM agentci_model_attempts WHERE state='unknown'")).rows[0].count,'1','possibly sent cancellation retains budget exposure');
  const terminationObserved=new Promise<void>(resolve=>{entered=resolve;}),terminatedId=await admit(),terminated=await start(terminatedId);await terminationObserved;await terminated.terminate('Owned fixture termination during provider call');
  await reconcileAdmittedReviews(dispatch,summaries,client,{taskQueue:queue});assert.equal((await dispatch.get(terminatedId))?.terminal?.status,'terminated');assert.equal((await dispatch.get(terminatedId))?.cancelRequested,true);assert.equal(await summaries.get(terminatedId),undefined);
  for(let i=0;i<200;i++){if((await pool.query("SELECT count(*) FROM agentci_model_attempts WHERE state='unknown'")).rows[0].count==='2')break;await delay(50);}
  assert.equal((await pool.query("SELECT count(*) FROM agentci_model_attempts WHERE state='unknown'")).rows[0].count,'2','terminated provider call must retain uncertain exposure');assert.equal(calls,3);
  hold=false;holdAfterSummary=true;const summaryObserved=new Promise<void>(resolve=>{summaryReady=resolve;}),savedId=await admit(),savedHandle=await start(savedId);await summaryObserved;const beforeTermination=(await summaries.get(savedId))!;
  await savedHandle.terminate('Owned fixture termination after summary commit');await reconcileAdmittedReviews(dispatch,summaries,client,{taskQueue:queue});assert.deepEqual((await dispatch.get(savedId))?.terminal,{status:'completed',digest:beforeTermination.digest});releaseSummary();assert.equal(calls,4);
  await reconcileAdmittedReviews(dispatch,summaries,client,{taskQueue:queue});assert.equal(calls,4);

 }finally{
  releaseSummary();
  for(const handle of handles)try{if((await handle.describe()).status.name==='RUNNING')await handle.terminate('Owned activity fixture cleanup');}catch{}
  worker?.shutdown();await running;await native.close();await connection.close();await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();
 }
});
