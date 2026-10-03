import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApi } from '../apps/api/server.ts';

async function api(t: any) {
  const server = createApi();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No address');
  return `http://127.0.0.1:${address.port}`;
}
test('API health and schema retrieval', async t => {
  const url = await api(t);
  const health = await fetch(`${url}/healthz`);
  assert.equal((await health.json()).milestone, 'M0');
  const schema = await fetch(`${url}/v1/schemas/requirement`);
  assert.equal((await schema.json()).title, 'requirement');
});
test('API validates a contract and rejects invalid contracts', async t => {
  const url = await api(t);
  for (const [document, expected] of [
    [{ id: 'SPEC-1', title: 'Contract', type: 'functional', status: 'active', text: 'Explicit.' }, 200],
    [{}, 422],
  ] as const) {
    const response = await fetch(`${url}/v1/validate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ schema: 'requirement', document }) });
    assert.equal(response.status, expected);
  }
});
test('API rejects invalid JSON and unsupported schema names', async t => {
  const url = await api(t);
  for (const body of ['{', JSON.stringify({ schema: 'not-real', document: {} })]) {
    assert.equal((await fetch(`${url}/v1/validate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body })).status, 400);
  }
});
test('API does not expose future product resources', async t => {
  const url = await api(t);
  assert.equal((await fetch(`${url}/v1/projects`)).status, 404);
  assert.equal((await fetch(`${url}/v1/validate`, { method: 'POST', body: '{}' })).status, 415);
});
test('API rejects oversized bodies with a usable 413 response', async t => {
  const url = await api(t);
  const response = await fetch(`${url}/v1/validate`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: 'x'.repeat(1024 * 1024 + 1),
  });
  assert.equal(response.status, 413);
  assert.match((await response.json()).error, /1 MiB/);
});
