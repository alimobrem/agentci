import test from 'node:test';import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';import {setTimeout as delay} from 'node:timers/promises';
import {Client,Connection} from '@temporalio/client';import {NativeConnection,Worker} from '@temporalio/worker';import {Context} from '@temporalio/activity';
const address=process.env.AGENTCI_TEST_TEMPORAL_ADDRESS;
if(!address)throw Error('Reproduction workflow acceptance requires real Temporal; never silently skip');
test('reproduction controller retries staging and finalization, waits for cancelled staging and replays',{timeout:60000},async()=>{
 const connection=await Connection.connect({address}),native=await NativeConnection.connect({address}),client=new Client({connection});
 const queue=`reproduction-${randomUUID()}`,evalQueue=`reproduction-eval-${randomUUID()}`;
 const workflowsPath=new URL('../../dist/apps/worker/reproduction-workflows.js',import.meta.url).pathname;
 const plans=new Map<string,{unitId:string;jobId:string}>(),stages=new Map<string,number>(),finals=new Map<string,number>(),executions:string[]=[],cleaned:string[]=[];
 let hold=false,release:(()=>void)|undefined,cancelled=false;
 const controller=await Worker.create({connection:native,taskQueue:queue,workflowsPath,activities:{
  stageFindingReproduction:async(id:string)=>{
   const plan=plans.get(id)??{unitId:randomUUID(),jobId:randomUUID()};plans.set(id,plan);
   stages.set(id,(stages.get(id)??0)+1);
   if(hold)await new Promise<void>(resolve=>{release=resolve;});
   if(stages.get(id)===1&&!hold)throw Error('Fixture lost staging response after commit');return plan;
  },
  finalizeFindingReproduction:async(id:string)=>{finals.set(id,(finals.get(id)??0)+1);if(finals.get(id)===1&&!cancelled)throw Error('Fixture lost finalization response after commit');return {findingId:id,version:3,state:cancelled?'unconfirmed':'confirmed'};},
  cancelFindingReproduction:async(id:string)=>{cancelled=true;const p=plans.get(id)!;return {jobId:p.jobId,unitIds:[p.unitId]};},
 }});
 const evaluator=await Worker.create({connection:native,taskQueue:evalQueue,workflowsPath:new URL('../../dist/apps/eval-worker/workflows.js',import.meta.url).pathname,activities:{
  runEvalUnit:async(id:string)=>{executions.push(id);return id;},
  cleanupCancelledEvalUnit:async(id:string)=>{cleaned.push(id);assert.equal(Context.current().info.attempt,1);return id;},
 }});
 const runs=[controller.run(),evaluator.run()];
 try{
  const id=randomUUID(),handle=await client.workflow.start('reproduceFinding',{args:[id,evalQueue],workflowId:randomUUID(),taskQueue:queue,workflowExecutionTimeout:'30 seconds'});
  assert.deepEqual(await handle.result(),{findingId:id,version:3,state:'confirmed'});
  assert.equal(stages.get(id),2);assert.equal(finals.get(id),2);assert.deepEqual(executions,[plans.get(id)!.unitId]);
  await Worker.runReplayHistory({workflowsPath},await handle.fetchHistory(),handle.workflowId);
  hold=true;const cancelId=randomUUID(),cancel=await client.workflow.start('reproduceFinding',{args:[cancelId,evalQueue],workflowId:randomUUID(),taskQueue:queue,workflowExecutionTimeout:'30 seconds'});
  for(let i=0;i<100&&!release;i++)await delay(25);assert.ok(release,'must observe staging before cancellation');
  await cancel.cancel();release!();await assert.rejects(cancel.result());
  assert.deepEqual(cleaned,[plans.get(cancelId)!.unitId]);assert.equal(finals.get(cancelId),1);assert.equal(executions.length,1);
  await Worker.runReplayHistory({workflowsPath},await cancel.fetchHistory(),cancel.workflowId);
 }finally{release?.();controller.shutdown();evaluator.shutdown();await Promise.all(runs);await native.close();await connection.close();}
});
