import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID, createHash} from 'node:crypto';
import {readFile, mkdtemp, writeFile, rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {Pool} from 'pg';
import {Client, Connection} from '@temporalio/client';
import {NativeConnection, Worker} from '@temporalio/worker';
import type {Octokit} from '@octokit/rest';
import {createControlApi} from '../../apps/control/server.ts';
import {createModelReviewControl} from '../../apps/control/model-reviews.ts';
import {createReviewerRuntime} from '../../packages/runtime/reviewers.ts';
import {initializeReviewerController} from '../../apps/worker/reviewer-runtime.ts';
import {dispatchAdmittedReviews} from '../../apps/worker/reviewer-dispatch.ts';
import type {ReviewAdmissionRequest} from '../../packages/reviewers/admission.ts';

const databaseUrl = process.env.AGENTCI_TEST_DATABASE_URL, address = process.env.AGENTCI_TEST_TEMPORAL_ADDRESS;
if (!databaseUrl || !address) throw Error('Model-review client acceptance requires real PostgreSQL and Temporal; never silently skip');
// Default CI exercises built modules. Package acceptance reruns the same test
// against an actual production-only installation, without changing the server.
const clientRoot = process.env.AGENTCI_TEST_CLIENT_PACKAGE_ROOT ?? new URL('../../', import.meta.url).pathname;
const {ModelReviewClient} = await import(pathToFileURL(resolve(clientRoot, 'dist/packages/client/model-review.js')).href);

test('compiled client and CLI round-trip actual model-review HTTP, PostgreSQL and Temporal', {timeout: 60000}, async () => {
  const schema = `client_${randomUUID().replaceAll('-', '')}`, admin = new Pool({connectionString: databaseUrl});
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({connectionString: databaseUrl, options: `-c search_path=${schema}`});
  const connection = await Connection.connect({address}), native = await NativeConnection.connect({address}), temporal = new Client({connection});
  const files = await mkdtemp(resolve(tmpdir(), 'agentci-client-acceptance-'));
  let worker: Worker | undefined, running: Promise<void> | undefined;
  let server: ReturnType<typeof createControlApi> | undefined;
  const handles: ReturnType<typeof temporal.workflow.getHandle>[] = [];
  try {
    for (const name of ['004_m3_model_budget', '005_m3_reviewer_results', '006_m3_finding_history', '008_m3_review_admissions', '009_m3_review_dispatch', '010_m3_reviewer_profiles', '011_m3_review_summaries', '012_m3_review_recovery'])
      await pool.query(await readFile(new URL(`../../deploy/migrations/${name}.sql`, import.meta.url), 'utf8'));
    const config = {organizationId: randomUUID(), repository: 'owner/repo', installationId: 123,
      secret: 'owned-webhook-fixture-'.repeat(3), evidenceToken: 'owned-read-fixture-'.repeat(3), operatorToken: 'owned-operator-fixture-'.repeat(3)};
    const definition = JSON.parse(await readFile(new URL('../../deploy/reviewers.synthetic.example.json', import.meta.url), 'utf8'));
    definition.profiles[0].budget.id = randomUUID();
    const baseSha = 'a'.repeat(40), headSha = 'b'.repeat(40), treeSha = 'c'.repeat(40), content = 'Synthetic client acceptance\n';
    const blobSha = createHash('sha1').update(`blob ${Buffer.byteLength(content)}\0${content}`).digest('hex');
    let currentHead = headSha;
    const github = {pulls: {get: async (params: any) => {
      assert.equal(params.owner, 'owner'); assert.equal(params.repo, 'repo'); assert.equal(params.pull_number, 7);
      return {data: {state: 'open', base: {sha: baseSha}, head: {sha: currentHead}}};
    }}, git: {
      getCommit: async () => ({data: {sha: headSha, tree: {sha: treeSha}}}),
      getTree: async () => ({data: {sha: treeSha, truncated: false, tree: [{type: 'blob', mode: '100644', path: 'README.md', sha: blobSha, size: Buffer.byteLength(content)}]}}),
      getBlob: async () => ({data: {sha: blobSha, encoding: 'base64', content: Buffer.from(content).toString('base64')}})
    }} as unknown as Octokit;
    // Only the worker initializer registers configured profiles. Leave its
    // polling worker stopped until the API has proven durable queued admission.
    const runtime = createReviewerRuntime(definition, {}), controller = await initializeReviewerController(pool, github, config, runtime);
    const control = await createModelReviewControl(pool, config, definition, github);
    server = createControlApi(config, {ready: async () => {}, recordDelivery: async () => {throw Error('Unused legacy route');}, evidence: async () => undefined}, undefined, control);
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const url = `http://127.0.0.1:${(server.address() as {port: number}).port}`;
    const client = new ModelReviewClient({url, readToken: config.evidenceToken, operatorToken: config.operatorToken, maxAttempts: 1});
    const profiles = await client.profiles(); assert.equal(profiles.profiles.length, 1);
    const profile = profiles.profiles[0];
    const admission: ReviewAdmissionRequest = {schemaVersion: 'v1alpha1', id: randomUUID(), subject: {
      organizationId: config.organizationId, repository: config.repository, pullRequest: 7, baseSha, headSha
    }, profile: {id: profile.id, revision: profile.revision}, mode: profile.mode};
    const accepted = await client.submit(admission);
    await Promise.all([client.submit(admission), client.submit(admission)]);
    assert.equal((await pool.query('SELECT count(*) FROM agentci_review_admission_outbox')).rows[0].count, '1');
    const queued = await client.show(admission); assert.equal(queued.execution.state, 'queued'); assert.equal(queued.summary, null);
    currentHead = 'd'.repeat(40);
    assert.deepEqual(await client.submit(admission), accepted, 'exact replay remains valid after head changes');
    await assert.rejects(client.submit({...admission, id: randomUUID()}), (error: any) => error.code === 'review-denied');
    currentHead = headSha;
    await assert.rejects(client.show({...admission, subject: {...admission.subject, repository: 'other/repo'}}), (error: any) => error.code === 'identity-mismatch');
    const taskQueue = `client-${randomUUID()}`, workflowsPath = new URL('../../dist/apps/worker/workflows.js', import.meta.url).pathname;
    worker = await Worker.create({connection: native, taskQueue, workflowsPath, activities: controller.activities}); running = worker.run();
    await dispatchAdmittedReviews(controller.dispatch, temporal, {taskQueue, timeoutMs: 45000});
    const state = (await controller.dispatch.get(admission.id))!, handle = temporal.workflow.getHandle(state.workflowId, state.runId!); handles.push(handle);
    assert.equal(await handle.result(), admission.id);
    const completed = await client.show(admission);
    assert.equal(completed.execution.state, 'completed'); assert.equal(completed.summary.summary.coverage.completedRoles, 7);
    assert.equal(completed.summary.summary.coverage.wholeRepository, false); assert.equal(completed.summary.summary.mode, 'synthetic');
    await client.cancel(admission);
    const cancelledLate = await client.show(admission);
    assert.equal(cancelledLate.execution.cancelRequested, true); assert.equal(cancelledLate.execution.state, 'completed');
    assert.equal(cancelledLate.execution.terminalDigest, completed.execution.terminalDigest);
    assert.deepEqual(cancelledLate.summary, completed.summary);
    assert.equal((await pool.query('SELECT count(*) FROM agentci_model_attempts')).rows[0].count, '7');

    // Exercise the executable from the selected build or installed package too.
    const exec = promisify(execFile), env = {...process.env, AGENTCI_API_URL: url, AGENTCI_EVIDENCE_TOKEN: config.evidenceToken, AGENTCI_OPERATOR_TOKEN: config.operatorToken};
    const requestFile = resolve(files, 'admission.json'); await writeFile(requestFile, JSON.stringify(admission));
    for (const command of ['profiles', 'submit', 'show', 'cancel']) {
      const result = await exec(process.execPath, [resolve(clientRoot, 'dist/cmd/agentci/main.js'), 'model-review', command,
        ...(command === 'profiles' ? [] : ['--request', requestFile])], {env});
      assert.equal(result.stderr, ''); const value = JSON.parse(result.stdout);
      if (command === 'profiles') assert.deepEqual(value, profiles);
      if (command === 'submit') assert.deepEqual(value, accepted);
      if (command === 'show') assert.deepEqual(value, cancelledLate);
      if (command === 'cancel') assert.equal(value.cancelRequested, true);
    }
    assert.equal((await pool.query('SELECT count(*) FROM agentci_review_admission_outbox')).rows[0].count, '1');
  } finally {
    if (server) await new Promise<void>(resolve => {server!.closeAllConnections(); server!.close(() => resolve());});
    for (const handle of handles) try {if ((await handle.describe()).status.name === 'RUNNING') await handle.terminate('Owned client acceptance cleanup');} catch {}
    worker?.shutdown(); await running; await native.close(); await connection.close(); await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end();
    await rm(files, {recursive: true, force: true});
  }
});
