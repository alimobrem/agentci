import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, chmod, rm, readFile, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {loadModelReviewClientConfig} from '../cmd/agentci/model-review.ts';
import {AgentCIError} from '../packages/client/index.ts';
const examples = JSON.parse(await readFile(new URL('../specs/api/drafts/model-review-examples.json', import.meta.url), 'utf8'));
const readToken = 'cli-read-fixture-'.repeat(3), operatorToken = 'cli-operator-fixture-'.repeat(3);
const exec = promisify(execFile), main = new URL('../cmd/agentci/main.ts', import.meta.url).pathname;

test('private client configuration requires private regular files and rejects inline credentials', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agentci-model-review-config-'));
  try {
    const config = join(root, 'client.json'), token = join(root, 'operator-token');
    await writeFile(token, operatorToken + '\n', {mode: 0o600});
    const value = {url: 'https://example.com', operatorTokenFile: 'operator-token'};
    const save = (v: unknown) => writeFile(config, JSON.stringify(v), {mode: 0o600});
    await save(value); assert.equal((await loadModelReviewClientConfig(config)).operatorToken, operatorToken);
    await save({...value, operatorToken}); await assert.rejects(loadModelReviewClientConfig(config), /invalid-private-config/);
    await save(value); await chmod(token, 0o644); await assert.rejects(loadModelReviewClientConfig(config), /invalid-private-config/);
    await chmod(token, 0o600); await symlink(token, join(root, 'link')); await save({...value, operatorTokenFile: 'link'});
    await assert.rejects(loadModelReviewClientConfig(config), /invalid-private-config/);
    await save(value); await chmod(config, 0o644); await assert.rejects(loadModelReviewClientConfig(config), /invalid-private-config/);
    assert.deepEqual(await loadModelReviewClientConfig(undefined, {AGENTCI_API_URL: 'https://example.com', AGENTCI_OPERATOR_TOKEN: operatorToken}),
      {url: 'https://example.com', readToken: undefined, operatorToken});
  } finally {await rm(root, {recursive: true, force: true});}
});

test('executable CLI transport fixture supports profiles/submit/show/cancel and never treats queued state as a verdict', async t => {
  const root = await mkdtemp(join(tmpdir(), 'agentci-model-review-cli-')); t.after(() => rm(root, {recursive: true, force: true}));
  let calls = 0;
  const server = createServer(async (req, res) => {
    calls++; assert.equal(req.headers.authorization, `Bearer ${req.method === 'POST' ? operatorToken : readToken}`);
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = req.url === '/v1/reviewer-profiles' ? {schemaVersion: 'v1alpha1', profiles: []} :
      req.url === '/v1/model-reviews' ? examples.accepted : req.url?.endsWith('/cancellation') ?
        {schemaVersion: 'v1alpha1', id: examples.request.id, cancelRequested: true} : examples.statuses.queued;
    const headers: Record<string, string> = {'content-type': 'application/json'};
    if (req.url === '/v1/model-reviews') {assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString()), examples.request); headers.location = `/v1/model-reviews/${examples.request.id}`;}
    res.writeHead(req.method === 'POST' ? 202 : 200, headers); res.end(JSON.stringify(body));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const env = {...process.env, AGENTCI_API_URL: `http://127.0.0.1:${(server.address() as {port: number}).port}`, AGENTCI_EVIDENCE_TOKEN: readToken, AGENTCI_OPERATOR_TOKEN: operatorToken};
  const request = join(root, 'admission.json'); await writeFile(request, JSON.stringify(examples.request));
  for (const command of ['profiles', 'submit', 'show', 'cancel']) {
    const result = await exec(process.execPath, ['--import', 'tsx', main, 'model-review', command, ...(command === 'profiles' ? [] : ['--request', request])], {env});
    assert.equal(result.stderr, ''); const value = JSON.parse(result.stdout);
    if (command === 'show') {assert.equal(value.execution.state, 'queued'); assert.equal(value.summary, null);}
    assert.ok(!result.stdout.includes(readToken) && !result.stdout.includes(operatorToken));
  }
  assert.equal(calls, 5);
  for (const flags of [['submit', '--token', operatorToken], ['show'], ['profiles', '--request', request], ['submit', '--request', request, '--request', request]]) {
    await assert.rejects(exec(process.execPath, ['--import', 'tsx', main, 'model-review', ...flags], {env}), (error: any) => {
      assert.equal(error.code, 2); assert.equal(error.stdout, '');
      assert.deepEqual(JSON.parse(error.stderr), {error: {code: 'invalid-model-review-arguments'}});
      assert.ok(!error.stderr.includes(operatorToken)); return true;
    });
  }
  assert.equal(calls, 5, 'invalid arguments never dispatch');
  for (const flag of ['--help', '-h']) {
    const result = await exec(process.execPath, ['--import', 'tsx', main, 'model-review', flag], {
      env: {...env, AGENTCI_API_URL: '', AGENTCI_EVIDENCE_TOKEN: '', AGENTCI_OPERATOR_TOKEN: ''}
    });
    assert.equal(result.stderr, '');
    for (const command of ['profiles', 'submit', 'show', 'cancel']) assert.ok(result.stdout.includes(`model-review ${command}`));
    assert.match(result.stdout, /require --request/); assert.match(result.stdout, /private 0600/);
  }
  assert.equal(calls, 5, 'scoped help works without credentials or network');
  const help = await exec(process.execPath, ['--import', 'tsx', main, '--help'], {env});
  assert.match(help.stdout, /review --config PRIVATE_JSON --pr NUMBER/);
  assert.match(help.stdout, /model-review submit\|show\|cancel/);
});
