import {loadReviewerRuntime} from '../../packages/runtime/reviewers.ts';
import {initializeReviewerController} from './reviewer-runtime.ts';
import {dispatchAdmittedReviews} from './reviewer-dispatch.ts';
import {reconcileAdmittedReviews} from './reviewer-recovery.ts';
import {ReviewAttempts} from '../../packages/storage/review-attempts.ts';
import {reconcileReviewAttempts} from './recovery.ts';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { Client, Connection } from '@temporalio/client';
import { NativeConnection, Worker } from '@temporalio/worker';
import { runtimeConfig } from '../../packages/runtime/config.ts';
import { Store } from '../../packages/storage/postgres.ts';
import { installationClient } from '../../packages/github/client.ts';
import { createActivities } from './activities.ts';
import {createEvalReviewActivities} from './eval-activities.ts';
import {controllerEvalPolicy} from '../../packages/evals/orchestration.ts';
import {EvalStore} from '../../packages/storage/evals.ts';
import {dispatchPendingReviews,evalReviewTimeout} from './dispatch.ts';
const config = await runtimeConfig();
const evalPolicy=controllerEvalPolicy(),timeoutMs=evalReviewTimeout();
const pool = new Pool({ connectionString: config.databaseUrl, max: 10, connectionTimeoutMillis: 5000, query_timeout: 10_000 });
const store = new Store(pool, config.organizationId, config.repository);
await store.ready();
const evals=new EvalStore(pool,config.organizationId,config.repository);await evals.ready();
const attempts=new ReviewAttempts(pool,config.organizationId,config.repository);await attempts.ready();
const connection = await Connection.connect({ address: config.temporalAddress });
const native = await NativeConnection.connect({ address: config.temporalAddress });
const client = new Client({ connection, namespace: config.namespace });
const github = installationClient(config.appId, config.installationId, config.privateKey);
const reviewerRuntime=await loadReviewerRuntime();
const reviewers=reviewerRuntime?await initializeReviewerController(pool,github,config,reviewerRuntime):null;
const evalActivities=createEvalReviewActivities(github,store,evals,config,evalPolicy);
const worker = await Worker.create({ connection: native, namespace: config.namespace, taskQueue: config.taskQueue,
  workflowsPath: fileURLToPath(new URL('./workflows.js', import.meta.url)), activities: {...createActivities(github, store, config),...evalActivities,...reviewers?.activities} });
let stopped = false;
let dispatching = false;
let dispatchOperation:Promise<void>|undefined;
async function dispatch() {
  if (dispatching || stopped) return;
  dispatching = true;
  try {
    const pipelines=[(async()=>{await dispatchPendingReviews(store,client,{taskQueue:config.taskQueue,timeoutMs,attempts});await reconcileReviewAttempts(attempts,evals,client,evalActivities,{shouldStop:()=>stopped});})()];
    if(reviewers)pipelines.push((async()=>{
      // Recovery still runs when starting a different admission fails.
      const operations=await Promise.allSettled([
        dispatchAdmittedReviews(reviewers.dispatch,client,{taskQueue:config.taskQueue,timeoutMs:86400000,shouldStop:()=>stopped}),
        reconcileAdmittedReviews(reviewers.dispatch,reviewers.summaries,client,{taskQueue:config.taskQueue,shouldStop:()=>stopped}),
      ]);if(operations.some(result=>result.status==='rejected'))throw Error('Admitted review dispatch/recovery unavailable');
    })());
    const results=await Promise.allSettled(pipelines);if(results.some(result=>result.status==='rejected'))throw Error('Review dispatch/recovery unavailable');
  } catch { console.error('Review dispatch/recovery unavailable; retained work will retry'); }
  finally { dispatching = false; }
}
const timer = setInterval(() => {if(!dispatchOperation&&!stopped)dispatchOperation=dispatch().finally(()=>{dispatchOperation=undefined;});}, 1000);
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { stopped = true; clearInterval(timer); worker.shutdown(); });
try { await worker.run(); } finally { stopped = true; clearInterval(timer); await dispatchOperation; await native.close(); await connection.close(); await pool.end(); }
