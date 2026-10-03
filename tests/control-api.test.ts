import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import SwaggerParser from '@apidevtools/swagger-parser';
import { Ajv } from 'ajv';
import { createRequire } from 'node:module';
import { createControlApi } from '../apps/control/server.ts';
import { DeliveryConflict } from '../packages/storage/postgres.ts';
const config = { repository: 'example/repo', installationId: 12, secret: 's'.repeat(32), evidenceToken: 'e'.repeat(32) };
const payload = { action: 'opened', number: 1, installation: { id: 12 }, repository: { full_name: 'example/repo' }, pull_request: { number: 1, base: { sha: 'a'.repeat(40), repo: { full_name: 'example/repo' } }, head: { sha: 'b'.repeat(40) } } };
const contract: any = await SwaggerParser.dereference(JSON.parse(readFileSync(new URL('../specs/api/openapi.json', import.meta.url), 'utf8')));
const ajv = new Ajv({ strict: false }); createRequire(import.meta.url)('ajv-formats')(ajv);
async function api(t: any) {
  const deliveries = new Map<string, string>(); const jobs: unknown[] = [];
  const server = createControlApi(config, {
    ready: async () => {}, evidence: async () => undefined,
    recordDelivery: async (id, hash, job) => { if (deliveries.has(id)) { if (deliveries.get(id) !== hash) throw new DeliveryConflict(); return 'duplicate'; } deliveries.set(id, hash); if (job) jobs.push(job); return 'accepted'; },
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing address');
  const send = (body: string, id = randomUUID(), signature?: string) => fetch(`http://127.0.0.1:${address.port}/v1/webhooks/github`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-github-event': 'pull_request', 'x-github-delivery': id, 'x-hub-signature-256': signature ?? `sha256=${createHmac('sha256', config.secret).update(body).digest('hex')}` }, body });
  return { url: `http://127.0.0.1:${address.port}`, jobs, send };
}
async function matches(response: Response, path: string, method: string): Promise<Record<string, unknown>> {
  const schema = contract.paths[path][method].responses[String(response.status)].content['application/json'].schema;
  const body = await response.json(); assert(ajv.validate(schema, body), JSON.stringify(ajv.errors)); return body as Record<string, unknown>;
}
test('signed webhook returns contracted receipt, queues once, and detects conflicting replay', async t => {
  const { send, jobs } = await api(t); const id = randomUUID(), body = JSON.stringify(payload);
  const first = await send(body, id); assert.equal(first.status, 202); assert.equal((await matches(first, '/v1/webhooks/github', 'post')).status, 'queued');
  const duplicate = await send(body, id); assert.equal(duplicate.status, 202); assert.equal((await matches(duplicate, '/v1/webhooks/github', 'post')).status, 'duplicate');
  assert.equal(jobs.length, 1);
  const conflict = await send(JSON.stringify({ ...payload, action: 'reopened' }), id); assert.equal(conflict.status, 409); await matches(conflict, '/v1/webhooks/github', 'post');
});
test('invalid signature, malformed JSON, wrong installation and invalid SHA cannot dispatch work', async t => {
  const { send, jobs } = await api(t);
  for (const [body, signature, status] of [[JSON.stringify(payload), 'sha256=' + '0'.repeat(64), 401], ['{', undefined, 400], [JSON.stringify({ ...payload, installation: { id: 13 } }), undefined, 403], [JSON.stringify({ ...payload, pull_request: { ...payload.pull_request, head: { sha: 'main' } } }), undefined, 400]] as const) {
    const response = await send(body, undefined, signature); assert.equal(response.status, status); await matches(response, '/v1/webhooks/github', 'post');
  }
  assert.equal(jobs.length, 0);
});
test('closed PRs are recorded as ignored; unsupported methods and oversized bodies fail', async t => {
  const { send, jobs, url } = await api(t);
  const closed = await send(JSON.stringify({ ...payload, action: 'closed' })); assert.equal((await matches(closed, '/v1/webhooks/github', 'post')).status, 'ignored'); assert.equal(jobs.length, 0);
  const method = await fetch(`${url}/v1/webhooks/github`); assert.equal(method.status, 405); assert.equal(method.headers.get('allow'), 'POST');
  const large = await send('x'.repeat(1024 * 1024 + 1)); assert.equal(large.status, 413); await matches(large, '/v1/webhooks/github', 'post');
});
test('evidence API requires credentials before revealing IDs and matches documented errors', async t => {
  const { url } = await api(t); const path = '/v1/evidence/{id}';
  const denied = await fetch(`${url}/v1/evidence/${randomUUID()}`); assert.equal(denied.status, 401); await matches(denied, path, 'get');
  const invalid = await fetch(`${url}/v1/evidence/not-a-uuid`, { headers: { authorization: `Bearer ${config.evidenceToken}` } }); assert.equal(invalid.status, 400); await matches(invalid, path, 'get');
  const missing = await fetch(`${url}/v1/evidence/${randomUUID()}`, { headers: { authorization: `Bearer ${config.evidenceToken}` } }); assert.equal(missing.status, 404); await matches(missing, path, 'get');
  const health = await fetch(`${url}/healthz`); assert.equal(health.status, 200); await matches(health, '/healthz', 'get');
});
