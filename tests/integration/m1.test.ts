import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { Client, Connection, WorkflowExecutionAlreadyStartedError } from '@temporalio/client';
import { NativeConnection, Worker } from '@temporalio/worker';
import { Store, DeliveryConflict } from '../../packages/storage/postgres.ts';
import { analyze, canonical, digest } from '../../packages/review/engine.ts';
import { parseYaml } from '../../packages/project/index.ts';
import { stringify } from 'yaml';
import { reviewJob as job } from '../fixtures/control.ts';
const databaseUrl = process.env.AGENTCI_TEST_DATABASE_URL;
const temporalAddress = process.env.AGENTCI_TEST_TEMPORAL_ADDRESS;
if (!databaseUrl || !temporalAddress) throw new Error('Integration tests require AGENTCI_TEST_DATABASE_URL and AGENTCI_TEST_TEMPORAL_ADDRESS; never silently skip');

test('PostgreSQL: concurrent webhook replay, transactional outbox, immutable evidence and scope isolation', async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await pool.query(await readFile(new URL('../../deploy/migrations/001_m1.sql', import.meta.url), 'utf8'));
    const store = new Store(pool, '00000000-0000-4000-8000-000000000001', 'example/repo'); await store.ready();
    const id = randomUUID();
    const results = await Promise.all(Array.from({ length: 10 }, () => store.recordDelivery(id, 'digest', job)));
    assert.equal(results.filter(result => result === 'accepted').length, 1);
    await assert.rejects(store.recordDelivery(id, 'changed', job), DeliveryConflict);
    const entries = await store.pending(); assert.equal(entries.filter(entry => entry.id === id).length, 1);
    assert.equal((await store.pending()).filter(entry => entry.id === id).length, 0);
    await store.dispatched(id);
    const config = parseYaml(await readFile(new URL('../../agentci.yaml', import.meta.url), 'utf8')) as any;
    config.spec.specifications.include = ['specs/**'];
    const base = { sha: job.baseSha, files: { 'agentci.yaml': stringify(config), 'specs/overview.md': 'Example spec.' } };
    const head = { sha: job.headSha, files: { ...base.files, 'prompts/instructions.md': 'new prompt' } };
    const analysis = analyze({ repository: job.repository, base, head });
    const records = await Promise.all([store.save(analysis, 1), store.save(analysis, 1)]);
    assert.equal(records[0]!.id, records[1]!.id); assert.equal(records[0]!.digest, digest(canonical(analysis)));
    assert.equal(records[0]!.evidence.subject.pullRequest, 1);
    const anotherPr = await store.save(analysis, 2); assert.notEqual(anotherPr.id, records[0]!.id); assert.equal(anotherPr.evidence.subject.pullRequest, 2);
    assert.deepEqual((await store.evidence(records[0]!.id))?.analysis, analysis);
    await assert.rejects(store.save({ ...analysis, risk: 'high' }, 1), /Immutable/);
    let release!: () => void;
    let entered!: () => void;
    const ready = new Promise<void>(resolve => { entered = resolve; });
    const held = store.withPublicationLock('fixture', async () => { entered(); await new Promise<void>(resolve => { release = resolve; }); });
    await ready; await assert.rejects(store.withPublicationLock('fixture', async () => {}), /busy/);
    release(); await held; await store.withPublicationLock('fixture', async () => {});
    const wrong = new Store(pool, '00000000-0000-4000-8000-000000000002', 'other/repo');
    await assert.rejects(wrong.ready(), /another deployment/); assert.equal(await wrong.evidence(records[0]!.id), undefined);
    // The local test is repeatable without weakening production immutability.
    await pool.query('DELETE FROM agentci_reviews WHERE repository=$1 AND base_sha=$2 AND head_sha=$3', [job.repository, job.baseSha, job.headSha]);
  } finally { await pool.end(); }
});

test('Temporal: durable activity retries, stale-head outcome, duplicate-start fence and history replay', async () => {
  const connection = await Connection.connect({ address: temporalAddress! });
  const native = await NativeConnection.connect({ address: temporalAddress! });
  const queue = `agentci-test-${randomUUID()}`, client = new Client({ connection });
  let attempts = 0, publications = 0;
  const workflowsPath = new URL('../../dist/apps/worker/workflows.js', import.meta.url).pathname;
  const activities = { isCurrent: async (job: any) => job.pullRequest !== 2,
    review: async () => { if (++attempts === 1) throw new Error('Simulated transient I/O'); return 'evidence-id'; },
    publish: async () => { publications++; return 'published'; }, fail: async () => {} };
  const worker = await Worker.create({ connection: native, taskQueue: queue, workflowsPath, activities });
  const run = worker.run();
  try {
    const workflowId = randomUUID();
    const handle = await client.workflow.start('reviewPullRequest', { args: [job], workflowId, taskQueue: queue, workflowIdReusePolicy: 'REJECT_DUPLICATE' });
    assert.equal(await handle.result(), 'published'); assert.equal(attempts, 2); assert.equal(publications, 1);
    await assert.rejects(client.workflow.start('reviewPullRequest', { args: [job], workflowId, taskQueue: queue, workflowIdReusePolicy: 'REJECT_DUPLICATE' }), WorkflowExecutionAlreadyStartedError);
    const stale = await client.workflow.execute('reviewPullRequest', { args: [{ ...job, pullRequest: 2 }], workflowId: randomUUID(), taskQueue: queue });
    assert.equal(stale, 'superseded'); assert.equal(publications, 1);
    const history = await handle.fetchHistory();
    await Worker.runReplayHistory({ workflowsPath }, history, workflowId);
  } finally { worker.shutdown(); await run; await native.close(); await connection.close(); }
});
