import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { Client, Connection, WorkflowExecutionAlreadyStartedError } from '@temporalio/client';
import { NativeConnection, Worker } from '@temporalio/worker';
import { runtimeConfig } from '../../packages/runtime/config.ts';
import { Store } from '../../packages/storage/postgres.ts';
import { installationClient } from '../../packages/github/client.ts';
import { createActivities } from './activities.ts';
const config = await runtimeConfig();
const pool = new Pool({ connectionString: config.databaseUrl, max: 10, connectionTimeoutMillis: 5000, query_timeout: 10_000 });
const store = new Store(pool, config.organizationId, config.repository);
await store.ready();
const connection = await Connection.connect({ address: config.temporalAddress });
const native = await NativeConnection.connect({ address: config.temporalAddress });
const client = new Client({ connection, namespace: config.namespace });
const github = installationClient(config.appId, config.installationId, config.privateKey);
const worker = await Worker.create({ connection: native, namespace: config.namespace, taskQueue: config.taskQueue,
  workflowsPath: fileURLToPath(new URL('./workflows.js', import.meta.url)), activities: createActivities(github, store, config) });
let stopped = false;
let dispatching = false;
async function dispatch() {
  if (dispatching || stopped) return;
  dispatching = true;
  try {
    for (const entry of await store.pending()) {
      const job = entry.payload;
      try {
        await client.workflow.start('reviewPullRequest', { args: [job], taskQueue: config.taskQueue,
          workflowId: `agentci:${job.repository}:${entry.id}`, workflowIdReusePolicy: 'ALLOW_DUPLICATE_FAILED_ONLY' });
      } catch (error) { if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error; }
      await store.dispatched(entry.id);
    }
  } catch { console.error('Review dispatch failed; durable outbox will retry'); }
  finally { dispatching = false; }
}
const timer = setInterval(() => void dispatch(), 1000);
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { stopped = true; clearInterval(timer); worker.shutdown(); });
try { await worker.run(); } finally { stopped = true; clearInterval(timer); await native.close(); await connection.close(); await pool.end(); }
