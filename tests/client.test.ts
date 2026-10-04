import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { AgentCIClient, AgentCIError } from '../packages/client/index.ts';
import { analyze, canonical, digest } from '../packages/review/engine.ts';
import { readFile } from 'node:fs/promises';
const identity = { repository: 'customer/project', baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), pullRequest: 1 };
async function fixture(t: any) {
  const id = randomUUID(), token = 'private-token-'.repeat(4);
  const files = { 'agentci.yaml': await readFile(new URL('../agentci.yaml', import.meta.url), 'utf8'), 'specs/agentci-full-spec.md': 'Customer specification.' };
  const analysis = analyze({ repository: identity.repository, base: { sha: identity.baseSha, files }, head: { sha: identity.headSha, files } });
  const hash = digest(canonical(analysis));
  const record = { id, digest: hash, analysis, evidence: { schemaVersion: 'v1alpha1', id, organizationId: randomUUID(), kind: 'PullRequest', version: 1, createdAt: new Date().toISOString(), subject: { gitSha: identity.headSha, pullRequest: 1 }, claim: { sourceType: 'static-analysis', confidence: 1, verificationStatus: 'verified', producer: { name: 'agentci', version: '0.2.1-m1' } }, artifacts: [{ uri: `urn:agentci:analysis:${id}`, digest: hash, mediaType: 'application/json' }], edges: [] } };
  const state = { record, redirect: false, status: 200, readyToken: '' };
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/readyz') { state.readyToken = req.headers.authorization ?? ''; res.end(JSON.stringify({ status: 'ready' })); return; }
    if (state.redirect) { res.writeHead(302, { location: '/somewhere' }); res.end(); return; }
    if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401); res.end(JSON.stringify({ error: { code: token } })); return; }
    res.writeHead(state.status); res.end(JSON.stringify(state.record));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address() as { port: number }; const url = `http://127.0.0.1:${address.port}`;
  return { id, token, state, client: new AgentCIClient({ url, token }), url };
}
test('agent client verifies evidence identity/digest and keeps bearer tokens off readiness', async t => {
  const f = await fixture(t); assert.deepEqual(await f.client.ready(), { status: 'ready' }); assert.equal(f.state.readyToken, '');
  assert.equal((await f.client.evidence(f.id, identity)).digest, f.state.record.digest);
  await assert.rejects(f.client.evidence(f.id, { ...identity, headSha: 'c'.repeat(40) }), /identity-mismatch/);
  f.state.record.digest = 'sha256:' + '0'.repeat(64); await assert.rejects(f.client.evidence(f.id, identity), /digest-mismatch/);
});
test('agent client rejects authentication, redirects and invalid records without leaking provider errors', async t => {
  const f = await fixture(t), wrong = new AgentCIClient({ url: f.url, token: 'x'.repeat(32) });
  await assert.rejects(wrong.evidence(f.id, identity), (error: unknown) => error instanceof AgentCIError && error.code === 'unauthorized' && !error.message.includes(f.token));
  f.state.redirect = true; await assert.rejects(f.client.evidence(f.id, identity), /transport-failure/); f.state.redirect = false;
  f.state.status = 503; await assert.rejects(f.client.evidence(f.id, identity), /service-unavailable/); f.state.status = 200;
  f.state.record.evidence.id = randomUUID(); await assert.rejects(f.client.evidence(f.id, identity), /identity-mismatch/);
  for (const url of ['http://remote.example.com', 'https://user:password@example.com', 'https://example.com?token=secret']) assert.throws(() => new AgentCIClient({ url, token: f.token }));
});
