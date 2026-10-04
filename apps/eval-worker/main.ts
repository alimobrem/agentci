import {prepareContainerClientRuntime} from './client-runtime.ts';
import {fileURLToPath} from 'node:url';
import {Pool} from 'pg';
import {NativeConnection,Worker} from '@temporalio/worker';
import {EvalStore} from '../../packages/storage/evals.ts';
import {evalWorkerConfig} from './config.ts';
import {requireEvalPrivileges} from './privileges.ts';
import {createEvalActivities} from './activities.ts';
const config=await evalWorkerConfig();
if(config.policyFor('command').engine==='podman')await prepareContainerClientRuntime();
const pool=new Pool({connectionString:config.databaseUrl,max:10,connectionTimeoutMillis:5000,query_timeout:10_000});
let native:NativeConnection|undefined;
try{
  await requireEvalPrivileges(pool);
  const store=new EvalStore(pool,config.organizationId,config.repository);await store.ready();
  native=await NativeConnection.connect({address:config.temporalAddress});
  const worker=await Worker.create({connection:native,namespace:config.namespace,taskQueue:config.taskQueue,
    workflowsPath:fileURLToPath(new URL('./workflows.js',import.meta.url)),activities:createEvalActivities(store,config.policyFor),
    maxConcurrentActivityTaskExecutions:2,maxHeartbeatThrottleInterval:1000,defaultHeartbeatThrottleInterval:1000});
  for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>worker.shutdown());
  await worker.run();
}finally{await native?.close();await pool.end();}
