import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {Client,Connection} from '@temporalio/client';
import {NativeConnection,Worker} from '@temporalio/worker';
import type {ReproductionActivities} from '../../apps/worker/reproduction-activities.ts';
import {createEvalActivities} from '../../apps/eval-worker/activities.ts';
import type {EvalStore} from '../../packages/storage/evals.ts';
import {containerEngine,type RunnerPolicy} from '../../packages/evals/runner.ts';
export async function runReproductionWorkflow(activities:ReproductionActivities,evals:EvalStore,policy:RunnerPolicy,id:string,unitId:string,cancel:boolean){
 const address=process.env.AGENTCI_TEST_TEMPORAL_ADDRESS;
 if(!address)throw Error('End-to-end reproduction requires real Temporal; never silently skip');
 const connection=await Connection.connect({address}),native=await NativeConnection.connect({address});
 const queue=`repro-controller-${randomUUID()}`,evalQueue=`repro-evaluator-${randomUUID()}`,client=new Client({connection});
 const workflowsPath=new URL('../../dist/apps/worker/reproduction-workflows.js',import.meta.url).pathname;
 let controller:Worker|undefined,evaluator:Worker|undefined,runs:Promise<void>[]=[];
 const docker=async(args:string[])=>(await promisify(execFile)(containerEngine(),args,{timeout:10000})).stdout.trim();
 try{
  controller=await Worker.create({connection:native,taskQueue:queue,workflowsPath,activities});
  evaluator=await Worker.create({connection:native,taskQueue:evalQueue,workflowsPath:new URL('../../dist/apps/eval-worker/workflows.js',import.meta.url).pathname,activities:createEvalActivities(evals,()=>policy,{maintenanceMs:100,maxTrials:1}),maxHeartbeatThrottleInterval:100,defaultHeartbeatThrottleInterval:100});
  runs=[controller.run(),evaluator.run()];
  const handle=await client.workflow.start('reproduceFinding',{args:[id,evalQueue],workflowId:randomUUID(),taskQueue:queue,workflowExecutionTimeout:'30 seconds'});
  try{
   if(cancel){
    let live='';for(let i=0;i<100;i++){live=await docker(['ps','--quiet','--filter',`label=agentci.eval.unit=${unitId}`]);if(live)break;await delay(25);}
    assert.ok(live,'Temporal cancellation must observe a running owned container');
    await handle.cancel();await assert.rejects(handle.result());
    assert.equal((await evals.unit(unitId))!.status,'cancelled');
   }else assert.equal((await handle.result()).state,'confirmed');
   assert.equal(await docker(['ps','--all','--quiet','--filter',`label=agentci.eval.unit=${unitId}`]),'','parent completion must wait for cleanup');
   const history=await handle.fetchHistory();
   assert.ok(!JSON.stringify(history).includes('app.mjs'),'source and assertions must not appear in parent history');
   await Worker.runReplayHistory({workflowsPath},history,handle.workflowId);
  }finally{await handle.cancel();await handle.result().catch(()=>{});}
 }finally{controller?.shutdown();evaluator?.shutdown();await Promise.all(runs);await native.close();await connection.close();}
}
