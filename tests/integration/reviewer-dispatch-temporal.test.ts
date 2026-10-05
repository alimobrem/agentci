import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {readFile} from 'node:fs/promises';import {Pool} from 'pg';
import {Client,Connection} from '@temporalio/client';import {NativeConnection,Worker} from '@temporalio/worker';
import {canonical,digest} from '../../packages/review/engine.ts';
import {ReviewAdmissionStore} from '../../packages/storage/review-admissions.ts';
import {ReviewDispatchStore} from '../../packages/storage/review-dispatch.ts';
import {dispatchAdmittedReviews} from '../../apps/worker/reviewer-dispatch.ts';
const url=process.env.AGENTCI_TEST_DATABASE_URL,address=process.env.AGENTCI_TEST_TEMPORAL_ADDRESS;if(!url||!address)throw Error('Reviewer dispatch requires real PostgreSQL and Temporal; never silently skip');
test('real Temporal resolves lost dispatch acknowledgements and rejects conflicting workflow identity',{timeout:60000},async()=>{
 const schema=`review_temporal_${randomUUID().replaceAll('-','')}`,admin=new Pool({connectionString:url});await admin.query(`CREATE SCHEMA ${schema}`);const pool=new Pool({connectionString:url,options:`-c search_path=${schema}`});
 const connection=await Connection.connect({address}),native=await NativeConnection.connect({address}),client=new Client({connection});
 const queue=`review-dispatch-${randomUUID()}`,workflowsPath=new URL('../../dist/apps/worker/reviewer-workflows.js',import.meta.url).pathname;
 let worker:Worker|undefined,running:Promise<void>|undefined;const handles:ReturnType<typeof client.workflow.getHandle>[]=[];
 try{
  for(const name of ['008_m3_review_admissions','009_m3_review_dispatch'])await pool.query(await readFile(new URL(`../../deploy/migrations/${name}.sql`,import.meta.url),'utf8'));
  const scope={organizationId:randomUUID(),repository:'owner/repo'},admissions=new ReviewAdmissionStore(pool,scope,{approve:async r=>({requestDigest:digest(canonical(r)),policyDigest:digest('policy'),profileRevision:r.profile.revision,mode:r.mode})}),store=new ReviewDispatchStore(pool,scope);
  const admit=async()=>{const id=randomUUID();await admissions.admit({schemaVersion:'v1alpha1',id,subject:{...scope,pullRequest:1,baseSha:'a'.repeat(40),headSha:'b'.repeat(40)},profile:{id:'security',revision:digest('profile')},mode:'synthetic'});return id;};
  const id=await admit(),entry=(await store.get(id))!,options={taskQueue:queue,timeoutMs:45000};
  await assert.rejects(dispatchAdmittedReviews({claim:()=>store.claim(),get:id=>store.get(id),acknowledge:async()=>{throw Error('Fixture response lost after Temporal start');}},client,options),/^Error: review-dispatch-unavailable$/);
  const handle=client.workflow.getHandle(entry.workflowId);handles.push(handle);const started=await handle.describe();assert.equal(started.status.name,'RUNNING');assert.equal((await store.get(id))?.runId,null);
  await pool.query("UPDATE agentci_review_admission_outbox SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[id]);
  await dispatchAdmittedReviews(store,client,options);assert.equal((await store.get(id))?.runId,started.runId);
  let executions=0,finalizations=0;
  worker=await Worker.create({connection:native,taskQueue:queue,workflowsPath,activities:{runAdmittedReview:async(requestId:string)=>{assert.equal(requestId,id);executions++;return digest('fixture-review-result');},finishAdmittedReview:async(requestId:string,runId:string,status:'completed'|'failed'|'cancelled',result:string|null)=>{await store.finish(requestId,runId,status,result??digest(status));if(++finalizations===1)throw Error('Fixture lost finalization response after database commit');}}});running=worker.run();
  assert.equal(await handle.result(),id);assert.equal(executions,1);assert.equal(finalizations,2);assert.equal((await store.get(id))?.terminal?.status,'completed');
  await dispatchAdmittedReviews(store,client,options);assert.equal(executions,1);
  await Worker.runReplayHistory({workflowsPath},await handle.fetchHistory(),handle.workflowId);
  const conflictId=await admit(),conflict=(await store.get(conflictId))!;
  const foreign=await client.workflow.start('reviewAdmittedRequest',{args:[conflictId],workflowId:conflict.workflowId,taskQueue:`unowned-${randomUUID()}`,memo:{admissionDigest:conflict.requestDigest},workflowExecutionTimeout:45000});handles.push(foreign);
  await assert.rejects(dispatchAdmittedReviews(store,client,options),/^Error: review-dispatch-unavailable$/);assert.equal((await store.get(conflictId))?.runId,null,'wrong task queue cannot acknowledge an unrelated workflow');
 }finally{
  for(const handle of handles)try{if((await handle.describe()).status.name==='RUNNING')await handle.terminate('Owned integration fixture cleanup');}catch{}
  worker?.shutdown();await running;await native.close();await connection.close();await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();
 }
});
