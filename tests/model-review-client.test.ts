import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer, type IncomingMessage, type ServerResponse} from 'node:http';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {canonical, digest} from '../packages/review/engine.ts';
import {ModelReviewClient} from '../packages/client/model-review.ts';
import {AgentCIError} from '../packages/client/index.ts';

const examples = JSON.parse(await readFile(new URL('../specs/api/drafts/model-review-examples.json', import.meta.url), 'utf8'));
const request = examples.request, readToken = 'read-fixture-'.repeat(4), operatorToken = 'operator-fixture-'.repeat(4);
const code = (expected: string) => (error: unknown) => error instanceof AgentCIError && error.code === expected;
async function fixture(t: any, handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>) {
  const server = createServer((req, res) => {void handler(req, res);});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise<void>(resolve => {server.closeAllConnections(); server.close(() => resolve());}));
  const url = `http://127.0.0.1:${(server.address() as {port: number}).port}`;
  return {url, client: new ModelReviewClient({url, readToken, operatorToken, maxAttempts: 1})};
}
const json = (res: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}) => {
  res.writeHead(status, {'content-type': 'application/json', ...headers}); res.end(JSON.stringify(value));
};

test('model-review transport fixture verifies identities and uses separate read/write credentials', async t => {
  const methods: string[] = [];
  const {client} = await fixture(t, async (req, res) => {
    methods.push(`${req.method} ${req.url}`);
    assert.equal(req.headers.authorization, `Bearer ${req.method === 'POST' ? operatorToken : readToken}`);
    if (req.url === '/v1/reviewer-profiles') {json(res, 200, {schemaVersion: 'v1alpha1', profiles: []}); return;}
    if (req.url === '/v1/model-reviews') {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      assert.equal(Buffer.concat(chunks).toString(), canonical(request));
      json(res, 202, examples.accepted, {location: `/v1/model-reviews/${request.id}`}); return;
    }
    if (req.url?.endsWith('/cancellation')) {
      let bytes = 0; for await (const chunk of req) bytes += chunk.length;
      assert.equal(bytes, 0); assert.equal(req.headers['content-type'], undefined);
      json(res, 202, {schemaVersion: 'v1alpha1', id: request.id, cancelRequested: true}); return;
    }
    json(res, 200, examples.statuses.queued);
  });
  assert.deepEqual(await client.profiles(), {schemaVersion: 'v1alpha1', profiles: []});
  assert.deepEqual(await client.submit({...request, id: request.id.toUpperCase()}), examples.accepted);
  assert.deepEqual(await client.show(request), examples.statuses.queued);
  assert.equal((await client.cancel(request)).cancelRequested, true);
  assert.equal(methods.length, 5, 'cancellation verifies pinned admission before mutation');
  assert.equal(JSON.stringify(client), '{}', 'credentials remain private fields');
});

test('bounded retries preserve admission bytes after a lost response and transient unavailability', async t => {
  const received: string[] = [];
  const {url} = await fixture(t, async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk); received.push(Buffer.concat(chunks).toString());
    if (received.length === 1) {req.socket.destroy(); return;}
    if (received.length === 2) {json(res, 503, {error: {code: 'service-unavailable'}}, {'retry-after': '1'}); return;}
    json(res, 202, examples.accepted, {location: `/v1/model-reviews/${request.id}`});
  });
  const client = new ModelReviewClient({url, operatorToken});
  assert.deepEqual(await client.submit(request), examples.accepted);
  assert.deepEqual(received, [canonical(request), canonical(request), canonical(request)]);
});

test('client rejects forged identity, summary, extra fields and cancellation before touching the wrong subject', async t => {
  let value: any = examples.statuses.queued, posts = 0;
  const {client} = await fixture(t, (req, res) => {if (req.method === 'POST') posts++; json(res, 200, value);});
  for (const change of [
    (v: any) => {v.admission.digest = 'sha256:' + '0'.repeat(64);},
    (v: any) => {v.execution.state = 'completed';},
    (v: any) => {v.privateApproval = 'must not be accepted';},
    (v: any) => {v.admission.request.subject.repository = 'other/repo'; v.admission.digest = digest(canonical(v.admission.request));}
  ]) {
    value = structuredClone(examples.statuses.queued); change(value);
    await assert.rejects(client.cancel(request), error => code('identity-mismatch')(error) || code('invalid-response')(error));
  }
  assert.equal(posts, 0);
  value = structuredClone(examples.statuses.awaitingFinalization); value.summary.digest = 'sha256:' + '0'.repeat(64);
  await assert.rejects(client.show(request), code('invalid-response'));
});

test('client redacts errors and rejects redirect, invalid UTF-8, unknown error code and oversized body', async t => {
  let mode = 'denied', redirected = 0;
  const {client, url} = await fixture(t, (req, res) => {
    if (req.url === '/leak') {redirected++; res.end(); return;}
    if (mode === 'denied') {json(res, 403, {error: {code: 'review-denied'}}); return;}
    if (mode === 'private-error') {json(res, 503, {error: {code: operatorToken}}); return;}
    if (mode === 'redirect') {res.writeHead(302, {location: '/leak'}); res.end(); return;}
    if (mode === 'utf8') {res.writeHead(200, {'content-type': 'application/json'}); res.end(Buffer.from([0xc0, 0xaf])); return;}
    res.writeHead(200, {'content-type': 'application/json'}); res.end(' '.repeat(4 * 1024 * 1024 + 1));
  });
  await assert.rejects(client.show(request), code('review-denied'));
  for (const [next, expected] of [['private-error', 'invalid-response'], ['redirect', 'transport-failure'], ['utf8', 'invalid-response'], ['large', 'response-too-large']]) {
    mode = next!; await assert.rejects(client.show(request), error => code(expected!)(error) && !String(error).includes(operatorToken));
  }
  assert.equal(redirected, 0);
  await assert.rejects(new ModelReviewClient({url, readToken}).submit(request), code('operator-token-required'));
  await assert.rejects(new ModelReviewClient({url, readToken}).cancel(request), code('operator-token-required'));
});

test('client validates origins, credentials and request input before network, with bounded timeouts', async t => {
  for (const url of ['http://public.example', 'https://user:secret@example.com', 'https://example.com/path', 'https://example.com?token=secret'])
    assert.throws(() => new ModelReviewClient({url, operatorToken}), code('invalid-origin'));
  for (const options of [{readToken: operatorToken, operatorToken}, {operatorToken: 'short'}, {operatorToken: operatorToken + '\n'}, {}])
    assert.throws(() => new ModelReviewClient({url: 'https://example.com', ...options}), code('invalid-token'));
  assert.throws(() => new ModelReviewClient({url: 'https://example.com', operatorToken, maxAttempts: 4}), code('invalid-attempts'));
  const {url, client} = await fixture(t, () => {});
  await assert.rejects(client.submit({...request, secret: operatorToken}), code('invalid-request'));
  await assert.rejects(new ModelReviewClient({url, operatorToken, timeoutMs: 25}).show(request), code('transport-failure'));
});
