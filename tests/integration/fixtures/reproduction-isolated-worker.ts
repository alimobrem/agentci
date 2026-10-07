import {Pool} from 'pg';import {NativeConnection,Worker} from '@temporalio/worker';
import {EvalStore} from '../../../packages/storage/evals.ts';import {createEvalActivities} from '../../../apps/eval-worker/activities.ts';
const [schema,organizationId,repository,taskQueue,phase]=process.argv.slice(2);if(!schema||!/^[a-z0-9_]+$/.test(schema)||!organizationId||!repository||!taskQueue||!['pause','recover'].includes(phase!))throw Error('Invalid owned reproduction worker fixture');
const pool=new Pool({connectionString:process.env.AGENTCI_FIXTURE_EVAL_DATABASE_URL,options:`-c search_path=${schema}`});const store=new EvalStore(pool,organizationId,repository);await store.ready();
const original=store.recordTrial.bind(store);
if(phase==='pause')store.recordTrial=async(...args)=>{await original(...args);process.send?.({event:'checkpoint',unitId:args[0]});await new Promise<void>(()=>{});};
const native=await NativeConnection.connect({address:process.env.AGENTCI_TEST_TEMPORAL_ADDRESS}),worker=await Worker.create({connection:native,taskQueue,workflowsPath:new URL('../../../dist/apps/eval-worker/workflows.js',import.meta.url).pathname,maxHeartbeatThrottleInterval:'100 milliseconds',activities:createEvalActivities(store,()=>({image:process.env.AGENTCI_TEST_RUNNER_IMAGE!}),{maintenanceMs:250,leaseSeconds:3})});
process.on('message',message=>{if(message==='shutdown')worker.shutdown();});const run=worker.run();process.send?.({event:'ready'});try{await run;}finally{await native.close();await pool.end();process.disconnect?.();}
