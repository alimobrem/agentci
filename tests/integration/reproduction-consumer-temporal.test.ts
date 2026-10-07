import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {readFile} from 'node:fs/promises';
import {Client,Connection} from '@temporalio/client';
import {reproductionStagingFixture} from '../helpers/reproduction-staging-fixture.ts';import {Store} from '../../packages/storage/postgres.ts';
import {ReproductionAuthorityStore} from '../../packages/storage/reproduction-authority.ts';import {ReproductionDispatchStore} from '../../packages/storage/reproduction-dispatch.ts';import {canonical,digest} from '../../packages/review/engine.ts';
import {dispatchAdmittedReproductions,reproductionStartMemo} from '../../apps/worker/reproduction-consumer-dispatch.ts';
const address=process.env.AGENTCI_TEST_TEMPORAL_ADDRESS;if(!address||!process.env.AGENTCI_TEST_DATABASE_URL)throw Error('Reproduction consumer tests require real PostgreSQL and Temporal');
async function fixture(){const f=await reproductionStagingFixture();const connection=await Connection.connect({address});const client=new Client({connection});try{
 await new Store(f.pool,f.scope.organizationId,f.scope.repository).ready();for(const n of ['015_m3_reproduction_eval_source','016_m3_reproduction_authority','017_m3_reproduction_dispatch_state','018_m3_reproduction_dispatch_settlement'])await f.pool.query(await readFile(new URL(`../../deploy/migrations/${n}.sql`,import.meta.url),'utf8'));
 await f.store.reserve(f.f.initial.id,f.selector);const authority=new ReproductionAuthorityStore(f.pool,f.scope,{finding:async()=>f.f.initial,plan:async()=>f.f.plan,snapshot:async(_s,side)=>f.f[side]},async()=>true);
 const config=await authority.apply({schemaVersion:'v1alpha1',...f.scope,revision:1,approvals:[{planId:f.f.plan.id,planDigest:digest(canonical(f.f.plan)),findingId:f.f.initial.id,findingVersion:1,findingDigest:digest(canonical(f.f.initial)),enabled:true,expiresAt:'2100-01-01T00:00:00.000Z'}]},null);
 const store=new ReproductionDispatchStore(f.pool,f.scope);await store.backfill();const options={taskQueue:`repro-controller-${randomUUID()}`,evalTaskQueue:`repro-eval-${randomUUID()}`,config,timeoutMs:60000};
 return {...f,store,client,options,async dispose(){const r=await store.get(f.selector.operationId);if(r)try{await client.workflow.getHandle(r.workflowId).terminate('Owned fixture cleanup');}catch{}await connection.close();await f.close();}};
 }catch(e){await connection.close();await f.close();throw e;}}
test('real Temporal start survives lost database acknowledgement and reuses exact run/memo',{timeout:30000},async()=>{const f=await fixture();try{
 const port={claim:f.store.claim.bind(f.store),bind:f.store.bind.bind(f.store),attempts:f.store.attempts.bind(f.store),get:f.store.get.bind(f.store),renew:f.store.renew.bind(f.store),release:f.store.release.bind(f.store),adoptObservedRun:async()=>{throw Error('fixture lost acknowledgement');}};
 await assert.rejects(dispatchAdmittedReproductions(port,f.client,f.options),/reproduction-dispatch-unavailable/);
 const pending=(await f.store.get(f.selector.operationId))!;assert.equal(pending.runId,null);const remote=await f.client.workflow.getHandle(pending.workflowId).describe();assert.equal(remote.type,'reproduceAdmittedFinding');
 await f.pool.query("UPDATE agentci_reproduction_dispatch_state SET lease_until=clock_timestamp()-interval '1 second'");await dispatchAdmittedReproductions(f.store,f.client,f.options);
 const saved=(await f.store.get(f.selector.operationId))!;assert.equal(saved.runId,remote.runId);assert.equal(saved.attempt!.token,remote.memo!.startAttemptToken);assert.equal((await f.store.attempts(saved.operationId)).length,1);
 await dispatchAdmittedReproductions(f.store,f.client,f.options);assert.equal((await f.store.get(saved.operationId))!.runId,remote.runId);
 }finally{await f.dispose();}});
test('late old-lease Temporal start after NotFound and new binding safely adopts its original attempt',{timeout:30000},async()=>{const f=await fixture();try{
 const a=await f.store.bind((await f.store.claim())!,f.options);await f.store.release(a,0);let won:string|undefined;
 const port={claim:f.store.claim.bind(f.store),attempts:f.store.attempts.bind(f.store),get:f.store.get.bind(f.store),renew:f.store.renew.bind(f.store),release:f.store.release.bind(f.store),adoptObservedRun:f.store.adoptObservedRun.bind(f.store),bind:async(...args:Parameters<typeof f.store.bind>)=>{const b=await f.store.bind(...args);assert.notEqual(a.attempt!.token,b.attempt!.token);const h=await f.client.workflow.start('reproduceAdmittedFinding',{args:[a.operationId,a.attempt!.token],workflowId:a.workflowId,taskQueue:f.options.taskQueue,workflowIdReusePolicy:'REJECT_DUPLICATE',workflowExecutionTimeout:60000,memo:reproductionStartMemo(a)});won=h.firstExecutionRunId;return b;}};
 await dispatchAdmittedReproductions(port,f.client,f.options);const saved=(await f.store.get(a.operationId))!;assert.equal(saved.runId,won);assert.equal(saved.attempt!.token,a.attempt!.token);assert.equal((await f.store.attempts(a.operationId)).length,2);
 }finally{await f.dispose();}});
test('existing Temporal workflow with wrong retained identity cannot be rebound or acknowledged',{timeout:30000},async()=>{const f=await fixture();try{
 const a=await f.store.bind((await f.store.claim())!,f.options);await f.store.release(a,0);
 await f.client.workflow.start('reproduceAdmittedFinding',{args:[a.operationId,a.attempt!.token],workflowId:a.workflowId,taskQueue:f.options.taskQueue,workflowIdReusePolicy:'REJECT_DUPLICATE',workflowExecutionTimeout:60000,memo:{...reproductionStartMemo(a),bindingDigest:digest('substitution')}});
 await assert.rejects(dispatchAdmittedReproductions(f.store,f.client,f.options),/reproduction-dispatch-unavailable/);assert.equal((await f.store.get(a.operationId))!.runId,null);assert.equal((await f.store.attempts(a.operationId)).length,1);
 }finally{await f.dispose();}});

test('new workflow uses metadata-only child execution and explicit denied cleanup, leaving legacy workflow untouched',{timeout:60000},async()=>{
 const {NativeConnection,Worker}=await import('@temporalio/worker');const connection=await Connection.connect({address}),native=await NativeConnection.connect({address}),client=new Client({connection});
 const queue=`repro-workflow-${randomUUID()}`,evalQueue=`repro-workflow-eval-${randomUUID()}`,operationId=randomUUID(),token=randomUUID(),unitId=randomUUID(),workflowId=`fixture-repro-${randomUUID()}`,unitWorkflowId=`fixture-unit-${randomUUID()}`,cleanupWorkflowId=`fixture-cleanup-${randomUUID()}`;
 let allowed=true,executing=false,cancelCause:string|undefined,cleaned=false,finalized=false;
 const {Context}=await import('@temporalio/activity');
 const evalWorker=await Worker.create({connection:native,taskQueue:evalQueue,maxHeartbeatThrottleInterval:'100 milliseconds',workflowsPath:new URL('../../dist/apps/eval-worker/workflows.js',import.meta.url).pathname,activities:{runEvalUnit:async(id:string)=>{assert.equal(id,unitId);executing=true;const context=Context.current(),timer=setInterval(()=>context.heartbeat(),100);try{await context.cancelled;return id;}finally{clearInterval(timer);}},cleanupCancelledEvalUnit:async(id:string)=>{assert.equal(id,unitId);cleaned=true;return id;}}});
 const worker=await Worker.create({connection:native,taskQueue:queue,workflowsPath:new URL('../../dist/apps/worker/admitted-reproduction-workflows.js',import.meta.url).pathname,activities:{stageAdmittedReproduction:async(op:string,attempt:string)=>{assert.equal(op,operationId);assert.equal(attempt,token);return {kind:'staged',jobId:randomUUID(),unitId,unitWorkflowId,cleanupWorkflowId,evalTaskQueue:evalQueue};},checkAdmittedReproduction:async()=>({allowed}),cancelAdmittedReproduction:async(_op:string,_attempt:string,cause:string)=>{cancelCause=cause;return {staged:true,evalTaskQueue:evalQueue,unitIds:[{unitId,unitWorkflowId,cleanupWorkflowId}]};},finalizeAdmittedReproduction:async()=>{assert.ok(cleaned);finalized=true;}}});
 const runs=[evalWorker.run(),worker.run()];let handle:ReturnType<typeof client.workflow.getHandle>|undefined;
 try{handle=await client.workflow.start('reproduceAdmittedFinding',{args:[operationId,token],taskQueue:queue,workflowId,workflowExecutionTimeout:30000});const result=handle.result();result.catch(()=>{});
  const deadline=Date.now()+10000;while(!executing&&Date.now()<deadline)await new Promise(r=>setTimeout(r,20));assert.ok(executing);allowed=false;await assert.rejects(result);assert.equal(cancelCause,'denied');assert.ok(cleaned);assert.ok(finalized);
  const history=JSON.stringify(await handle.fetchHistory());assert.ok(!history.includes('snapshot.files'));assert.ok(!history.includes('PRIVATE_PROVIDER'));assert.equal((await client.workflow.getHandle(cleanupWorkflowId).describe()).status.name,'COMPLETED');
 }finally{if(handle)try{await handle.terminate('Owned fixture cleanup');}catch{}worker.shutdown();evalWorker.shutdown();await Promise.all(runs);await native.close();await connection.close();}
});

test('terminated real Temporal parent requires independent owned cleanup and terminal observations before settlement callback',{timeout:30000},async()=>{
 const {NativeConnection,Worker}=await import('@temporalio/worker');const {reconcileAdmittedReproductions}=await import('../../apps/worker/reproduction-consumer-recovery.ts');const f=await fixture(),native=await NativeConnection.connect({address});
 const unitId=randomUUID(),unitWorkflowId=`owned-unit-${randomUUID()}`,cleanupWorkflowId=`owned-cleanup-${randomUUID()}`;let cleaned=false,settled=false,observation:any;
 const worker=await Worker.create({connection:native,taskQueue:f.options.evalTaskQueue,workflowsPath:new URL('../../dist/apps/eval-worker/workflows.js',import.meta.url).pathname,activities:{cleanupCancelledEvalUnit:async(id:string)=>{assert.equal(id,unitId);cleaned=true;return id;}}}),running=worker.run();
 try{
  await dispatchAdmittedReproductions(f.store,f.client,f.options);const record=(await f.store.get(f.selector.operationId))!;await f.client.workflow.getHandle(record.workflowId,record.runId!).terminate('Owned termination injection');
  const descriptor={staged:true,evalTaskQueue:f.options.evalTaskQueue,unitIds:[{unitId,unitWorkflowId,cleanupWorkflowId}]};
  const activities={stageAdmittedReproduction:async()=>({kind:'not-started' as const}),checkAdmittedReproduction:async()=>({allowed:true}),inspectAdmittedReproduction:async()=>({...descriptor,jobId:randomUUID()}),cancelAdmittedReproduction:async()=>descriptor,finalizeAdmittedReproduction:async()=>{assert.ok(cleaned);}};
  const options={markRuntimeQuiescent:async(_entry:unknown,value:unknown)=>{observation=value;},settle:async(entry:Parameters<typeof f.store.release>[0])=>{assert.ok(observation);assert.ok(cleaned);settled=true;await f.store.release(entry,60000);}};
  const deadline=Date.now()+10000;while(!settled&&Date.now()<deadline){try{await reconcileAdmittedReproductions(f.store,f.client,activities,options);}catch(e){assert.match(String(e),/reproduction-recovery-unavailable/);}if(!settled){await f.pool.query('UPDATE agentci_reproduction_dispatch_state SET retry_after=NULL');await new Promise(r=>setTimeout(r,30));}}
  assert.ok(settled);assert.equal(observation.status,'TERMINATED');assert.equal(observation.runId,record.runId);assert.equal(observation.units[0].status,'NOT_STARTED');assert.equal(observation.cleanup[0].workflowId,cleanupWorkflowId);assert.ok(observation.cleanup[0].runId);
 }finally{worker.shutdown();await running;await native.close();await f.dispose();}
});

test('bound cancellation with Temporal NotFound fences delayed starts using original attempt without evaluator dispatch',{timeout:30000},async()=>{
 const {NativeConnection,Worker}=await import('@temporalio/worker');const {reconcileAdmittedReproductions}=await import('../../apps/worker/reproduction-consumer-recovery.ts');const f=await fixture(),native=await NativeConnection.connect({address});let stages=0,settled=false;
 const bound=await f.store.bind((await f.store.claim())!,f.options);await f.store.release(bound,0);await f.store.requestCancellation(bound.operationId,'user');
 const descriptor={staged:false,evalTaskQueue:f.options.evalTaskQueue,unitIds:[]};const activities={stageAdmittedReproduction:async(op:string,token:string)=>{assert.equal(op,bound.operationId);assert.equal(token,bound.attempt!.token);assert.ok((await f.store.get(op))!.cancellation);stages++;return {kind:'not-started' as const};},checkAdmittedReproduction:async()=>({allowed:false}),cancelAdmittedReproduction:async()=>descriptor,inspectAdmittedReproduction:async()=>({...descriptor,jobId:null}),finalizeAdmittedReproduction:async()=>{}};
 const worker=await Worker.create({connection:native,taskQueue:f.options.taskQueue,workflowsPath:new URL('../../dist/apps/worker/admitted-reproduction-workflows.js',import.meta.url).pathname,activities}),running=worker.run();
 try{
  const deadline=Date.now()+10000;while(!settled&&Date.now()<deadline){await reconcileAdmittedReproductions(f.store,f.client,activities,{markRuntimeQuiescent:async(_entry,observation)=>{assert.equal(observation.status,'COMPLETED');assert.deepEqual(observation.units,[]);},settle:async entry=>{settled=true;await f.store.release(entry,60000);}});if(!settled){await f.pool.query('UPDATE agentci_reproduction_dispatch_state SET retry_after=NULL');await new Promise(r=>setTimeout(r,30));}}
  assert.ok(settled);assert.equal(stages,1);const saved=(await f.store.get(bound.operationId))!;assert.equal(saved.attempt!.token,bound.attempt!.token);assert.equal((await f.store.attempts(bound.operationId)).length,1);
  await assert.rejects(f.client.workflow.start('reproduceAdmittedFinding',{args:[bound.operationId,bound.attempt!.token],workflowId:bound.workflowId,taskQueue:f.options.taskQueue,workflowIdReusePolicy:'REJECT_DUPLICATE',memo:reproductionStartMemo(bound)}),/already started/i);
 }finally{worker.shutdown();await running;await native.close();await f.dispose();}
});

test('failed cleanup runs retry only after exact identity verification and preserve each original run',{timeout:60000},async()=>{
 const {NativeConnection,Worker}=await import('@temporalio/worker');const {ApplicationFailure}=await import('@temporalio/activity');const {cleanupAdmittedReproduction}=await import('../../apps/worker/reproduction-consumer-recovery.ts');
 const connection=await Connection.connect({address}),native=await NativeConnection.connect({address}),client=new Client({connection});const evidence:{status:string;originalRunId:string;retryRunId:string}[]=[];
 try{for(const terminal of ['FAILED','TIMED_OUT','TERMINATED','CANCELLED']){
  const operationId=randomUUID(),unitId=randomUUID(),taskQueue=`cleanup-retry-${randomUUID()}`,workflowId=`cleanup-retry-${randomUUID()}`;let healthy=false,entered=false,worker:import('@temporalio/worker').Worker|undefined,running:Promise<void>|undefined;
  const descriptor={staged:true,evalTaskQueue:taskQueue,unitIds:[{unitId,unitWorkflowId:`fixture-unit-${randomUUID()}`,cleanupWorkflowId:workflowId}]};
  const launch=async()=>{worker=await Worker.create({connection:native,taskQueue,workflowsPath:new URL('../../dist/apps/eval-worker/workflows.js',import.meta.url).pathname,activities:{cleanupCancelledEvalUnit:async(id:string)=>{assert.equal(id,unitId);entered=true;if(!healthy&&terminal==='FAILED')throw ApplicationFailure.nonRetryable('Owned cleanup failure injection');if(!healthy)await new Promise(r=>setTimeout(r,300));return id;}}});running=worker.run();};
  let original:ReturnType<typeof client.workflow.getHandle>|undefined;
  try{
   if(terminal==='FAILED'||terminal==='CANCELLED')await launch();
   original=await client.workflow.start('cleanupCancelledEvalUnit',{args:[unitId],workflowId,taskQueue,workflowExecutionTimeout:terminal==='TIMED_OUT'?100:30000,memo:{operationId,unitId}});const firstResult=original.result();firstResult.catch(()=>{});
   if(terminal==='TERMINATED')await original.terminate('Owned cleanup termination injection');
   if(terminal==='CANCELLED'){const until=Date.now()+5000;while(!entered&&Date.now()<until)await new Promise(r=>setTimeout(r,10));assert.ok(entered);await original.cancel();}
   await assert.rejects(firstResult);const prior=await original.describe();assert.equal(prior.status.name,terminal);healthy=true;if(!worker)await launch();
   let proof:Awaited<ReturnType<typeof cleanupAdmittedReproduction>>|undefined;const until=Date.now()+10000;
   while(!proof&&Date.now()<until){try{proof=await cleanupAdmittedReproduction(client,operationId,descriptor);}catch(e){assert.match(String(e),/reproduction-cleanup-pending/);await new Promise(r=>setTimeout(r,20));}}
   assert.ok(proof);assert.notEqual(proof[0]!.runId,prior.runId);assert.equal((await client.workflow.getHandle(workflowId,prior.runId).describe()).status.name,terminal);
   assert.deepEqual(await cleanupAdmittedReproduction(client,operationId,descriptor),proof,'completed cleanup is reused without a third run');evidence.push({status:terminal,originalRunId:prior.runId,retryRunId:proof[0]!.runId});
  }finally{try{await client.workflow.getHandle(workflowId).terminate('Owned fixture cleanup');}catch{}if(worker){worker.shutdown();await running;}}
 }console.log('cleanup-retry-run-evidence',JSON.stringify(evidence));
 }finally{await native.close();await connection.close();}
});

test('running or foreign cleanup identity cannot be replaced by retry',{timeout:30000},async()=>{
 const {cleanupAdmittedReproduction}=await import('../../apps/worker/reproduction-consumer-recovery.ts');const connection=await Connection.connect({address}),client=new Client({connection});const handles:ReturnType<typeof client.workflow.getHandle>[]=[];
 try{for(const mode of ['running','foreign','extra']){const foreign=mode!=='running',operationId=randomUUID(),unitId=randomUUID(),taskQueue=`cleanup-conflict-${randomUUID()}`,workflowId=`cleanup-conflict-${randomUUID()}`;
  const handle=await client.workflow.start('cleanupCancelledEvalUnit',{args:[unitId],workflowId,taskQueue,workflowExecutionTimeout:30000,memo:{operationId:mode==='foreign'?randomUUID():operationId,unitId,...(mode==='extra'?{unexpected:'not-the-retained-memo'}:{})}});handles.push(handle);if(foreign)await handle.terminate('Owned foreign identity injection');
  const prior=await handle.describe(),descriptor={staged:true,evalTaskQueue:taskQueue,unitIds:[{unitId,unitWorkflowId:`fixture-unit-${randomUUID()}`,cleanupWorkflowId:workflowId}]};
  await assert.rejects(cleanupAdmittedReproduction(client,operationId,descriptor),foreign?/reproduction-cleanup-identity-conflict/:/reproduction-cleanup-pending/);assert.equal((await client.workflow.getHandle(workflowId).describe()).runId,prior.runId);
 }}finally{for(const h of handles)try{await h.terminate('Owned fixture cleanup');}catch{}await connection.close();}
});
