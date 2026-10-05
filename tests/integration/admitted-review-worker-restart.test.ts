import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fork, type ChildProcess} from 'node:child_process';
import {once} from 'node:events';
import {Pool} from 'pg';
import {Client, Connection} from '@temporalio/client';
import {Worker} from '@temporalio/worker';
import {canonical, digest} from '../../packages/review/engine.ts';
import {ReviewAdmissionStore} from '../../packages/storage/review-admissions.ts';
import {ReviewDispatchStore} from '../../packages/storage/review-dispatch.ts';
import {ReviewerProfileStore} from '../../packages/storage/reviewer-profiles.ts';
import {ReviewSummaryStore} from '../../packages/storage/review-summaries.ts';
import {dispatchAdmittedReviews} from '../../apps/worker/reviewer-dispatch.ts';
import {findingProposalSchema} from '../../packages/findings/model.ts';

const url = process.env.AGENTCI_TEST_DATABASE_URL, address = process.env.AGENTCI_TEST_TEMPORAL_ADDRESS;
if (!url || !address) throw Error('Worker restart acceptance requires real PostgreSQL and Temporal; never silently skip');

test('SIGKILL and replacement worker recover the same admitted review without charging twice', {timeout: 100000}, async () => {
  const schema = `restart_${randomUUID().replaceAll('-', '')}`, admin = new Pool({connectionString: url});
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({connectionString: url, options: `-c search_path=${schema}`});
  const connection = await Connection.connect({address}), client = new Client({connection});
  const scope = {organizationId: randomUUID(), repository: 'owner/repo'}, taskQueue = `restart-${randomUUID()}`;
  const children: ChildProcess[] = [];
  let handle: ReturnType<typeof client.workflow.getHandle> | undefined;
  const startWorker = (phase: string) => {
    const child = fork(new URL('./fixtures/reviewer-restart-worker.ts', import.meta.url), [schema, scope.organizationId, taskQueue, phase],
      {execArgv: ['--import', 'tsx'], stdio: ['ignore', 'pipe', 'pipe', 'ipc']});
    children.push(child);
    let output = '';
    child.stdout?.on('data', chunk => {output = (output + chunk).slice(-8000);});
    child.stderr?.on('data', chunk => {output = (output + chunk).slice(-8000);});
    const events = new Map<string, unknown>();
    child.on('message', (message: any) => {events.set(message.event, message);});
    const waitFor = (event: string): Promise<any> => new Promise((resolve, reject) => {
      if (events.has(event)) {resolve(events.get(event)); return;}
      const cleanup = () => {clearTimeout(timer); child.off('message', message); child.off('exit', exited); child.off('error', failed);};
      const message = (value: any) => {if (value.event === event) {cleanup(); resolve(value);}};
      const exited = () => {cleanup(); reject(Error(`Worker exited before ${event}: ${output}`));};
      const failed = (error: Error) => {cleanup(); reject(error);};
      const timer = setTimeout(() => {cleanup(); reject(Error(`Worker did not emit ${event}: ${output}`));}, 30000);
      child.on('message', message); child.once('exit', exited); child.once('error', failed);
      if (child.exitCode !== null || child.signalCode !== null) exited();
    });
    return {child, waitFor};
  };
  try {
    for (const name of ['004_m3_model_budget', '005_m3_reviewer_results', '006_m3_finding_history', '008_m3_review_admissions', '009_m3_review_dispatch', '010_m3_reviewer_profiles', '011_m3_review_summaries', '012_m3_review_recovery'])
      await pool.query(await readFile(new URL(`../../deploy/migrations/${name}.sql`, import.meta.url), 'utf8'));
    await pool.query('CREATE TABLE owned_provider_calls(request_id uuid NOT NULL)');
    const input = JSON.parse(await readFile(new URL('../../specs/api/fixtures/reviewer-profile.json', import.meta.url), 'utf8'));
    input.budget.id = randomUUID(); input.reviewers[0].responseSchema = findingProposalSchema;
    const profile = await new ReviewerProfileStore(pool, scope).put(input);
    const admissions = new ReviewAdmissionStore(pool, scope, {approve: async request => ({requestDigest: digest(canonical(request)), policyDigest: digest('fixture-policy'), profileRevision: request.profile.revision, mode: request.mode})});
    const dispatch = new ReviewDispatchStore(pool, scope), summaries = new ReviewSummaryStore(pool, scope), id = randomUUID();
    await admissions.admit({schemaVersion: 'v1alpha1', id, subject: {...scope, pullRequest: 1, baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40)}, profile: {id: profile.profile.id, revision: profile.revision}, mode: 'synthetic'});
    const original = startWorker('crash'); await original.waitFor('ready');
    await dispatchAdmittedReviews(dispatch, client, {taskQueue, timeoutMs: 90000});
    const before = (await dispatch.get(id))!;
    handle = client.workflow.getHandle(before.workflowId, before.runId!);
    const committed = await original.waitFor('summary-committed');
    assert.equal(before.terminal, null);
    assert.equal((await summaries.get(id))?.digest, committed.digest);
    const attemptsBefore = (await pool.query('SELECT * FROM agentci_model_attempts ORDER BY id')).rows;
    const exited = once(original.child, 'exit');
    assert.equal(original.child.kill('SIGKILL'), true);
    assert.deepEqual(await exited, [null, 'SIGKILL'], 'actually kill the OS worker, bypassing graceful cleanup');
    assert.equal((await handle.describe()).status.name, 'RUNNING', 'workflow survives worker loss');
    const replacement = startWorker('recover'); await replacement.waitFor('ready');
    assert.equal(await handle.result(), id);
    const after = (await dispatch.get(id))!;
    assert.equal(after.runId, before.runId, 'recovery must resume the original run');
    assert.deepEqual(after.terminal, {status: 'completed', digest: committed.digest});
    assert.equal((await pool.query('SELECT count(*) FROM owned_provider_calls')).rows[0].count, '1');
    assert.deepEqual((await pool.query('SELECT * FROM agentci_model_attempts ORDER BY id')).rows, attemptsBefore, 'no extra attempt or charge after restart');
    const history = await handle.fetchHistory();
    // Temporal records server-side retries on the eventual ActivityTaskStarted
    // event, rather than emitting a terminal timeout event for each attempt.
    const recoveredActivity = history.events?.map(event => event.activityTaskStartedEventAttributes)
      .find(event => event?.attempt === 2);
    assert.ok(recoveredActivity?.lastFailure?.timeoutFailureInfo, 'real activity timeout triggers retry after process loss');
    await Worker.runReplayHistory({workflowsPath: new URL('../../dist/apps/worker/reviewer-workflows.js', import.meta.url).pathname}, history, handle.workflowId);
    const stopped = once(replacement.child, 'exit'); replacement.child.send('shutdown');
    assert.deepEqual(await stopped, [0, null]);
  } finally {
    if (handle) try {if ((await handle.describe()).status.name === 'RUNNING') await handle.terminate('Owned restart acceptance cleanup');} catch {}
    for (const child of children) if (child.exitCode === null && child.signalCode === null) {const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;}
    await connection.close(); await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end();
  }
});
