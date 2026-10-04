import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { Octokit } from '@octokit/rest';
import { currentPullRequest, publishCheck, remoteSnapshot, createRemoteSnapshotReader } from '../packages/github/client.ts';
import { analyze } from '../packages/review/engine.ts';
import { readFileSync } from 'node:fs';
import { reviewJob as job } from './fixtures/control.ts';
async function provider(t: any) {
  const files = { 'agentci.yaml': readFileSync(new URL('../agentci.yaml', import.meta.url), 'utf8'), 'specs/agentci-full-spec.md': 'Example spec.' };
  const blobs = Object.entries(files).map(([path, text]) => ({ path, bytes: Buffer.from(text), sha: createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex') }));
  const state = { stale: false, truncated: false, corrupt: false, wrongSize: false, denied: false, blobRequests: 0, treeRequests: 0, commitRequests: 0, runs: [] as any[], creations: 0, updates: 0 };
  const server = createServer(async (req, res) => {
    const path = req.url!.split('?')[0]; let output: any;
    if(state.denied){res.writeHead(403);res.end('{}');return;}
    if (path === '/repos/example/repo/pulls/1') output = { state: 'open', base: { sha: job.baseSha }, head: { sha: state.stale ? 'c'.repeat(40) : job.headSha } };
    else if (path?.includes('/git/commits/')) { state.commitRequests++; output = { sha: path.split('/').at(-1), tree: { sha: 'd'.repeat(40) } }; }
    else if (path?.includes('/git/trees/')) { state.treeRequests++; output = { sha: 'd'.repeat(40), truncated: state.truncated, tree: blobs.map(b => ({ path: b.path, sha: b.sha, size: b.bytes.length+(state.wrongSize?1:0), type: 'blob', mode: '100644' })) }; }
    else if (path?.includes('/git/blobs/')) { state.blobRequests++; const blob = blobs.find(b => path.endsWith(b.sha))!; output = { sha: blob.sha, encoding: 'base64', content: (state.corrupt ? Buffer.alloc(blob.bytes.length, 65) : blob.bytes).toString('base64') }; }
    else if (req.method === 'GET' && path?.endsWith('/check-runs')) { const runs=new URL(req.url!,'http://localhost').searchParams.get('filter')==='all'?state.runs:state.runs.slice(-1);output = { total_count: runs.length, check_runs: runs }; }
    else if ((req.method === 'POST' || req.method === 'PATCH') && path?.includes('/check-runs')) {
      let raw = ''; for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      if (req.method === 'POST') { state.creations++; state.runs.push({ ...body, id: state.creations, app: { id: 42 } }); }
      else state.updates++;
      output = { ...body, id: 1, app: { id: 42 } };
    } else { res.writeHead(404); res.end('{}'); return; }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(output));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing address');
  return { client: new Octokit({ baseUrl: `http://127.0.0.1:${address.port}`, auth: 'local-fixture-only' }), state };
}
test('GitHub adapter reads exact Git objects and rejects truncation and content identity mismatch', async t => {
  const { client, state } = await provider(t);
  const snapshot = await remoteSnapshot(client, job.repository, job.headSha); assert.equal(snapshot.sha, job.headSha); assert(snapshot.files['agentci.yaml']);
  state.truncated = true; await assert.rejects(remoteSnapshot(client, job.repository, job.headSha), /limits/); state.truncated = false;
  state.corrupt = true; await assert.rejects(remoteSnapshot(client, job.repository, job.headSha), /mismatched/);
});
test('Checks reconcile retries only against this App and exact head; current-head check rejects force pushes', async t => {
  const { client, state } = await provider(t);
  const base = await remoteSnapshot(client, job.repository, job.baseSha), head = await remoteSnapshot(client, job.repository, job.headSha);
  const analysis = analyze({ repository: job.repository, base, head });
  state.runs.push({ id: 99, external_id: `agentci:1:${job.baseSha}:${job.headSha}`, app: { id: 999 } });
  await publishCheck(client, 42, job, analysis, 'https://example.invalid/v1/evidence/id');
  state.runs.push({id:100,name:'agentci/review',head_sha:job.headSha,external_id:'different-pr-attempt',app:{id:42}});
  await publishCheck(client, 42, job, analysis, 'https://example.invalid/v1/evidence/id');
  assert.equal(state.creations, 1); assert.equal(state.updates, 1);
  const run = state.runs.find(r => r.app.id === 42); assert.equal(run.head_sha, job.headSha); assert.equal(run.conclusion, 'neutral');
  assert.equal(await currentPullRequest(client, job), true); state.stale = true; assert.equal(await currentPullRequest(client, job), false);
});

test('verified snapshot reuse reduces blob requests while freshly checking trees and rejecting tampered sizes',async t=>{
 const {client,state}=await provider(t),read=createRemoteSnapshotReader(client);
 const base=await read(job.repository,job.baseSha),head=await read(job.repository,job.headSha);
 assert.deepEqual(base.files,head.files);assert.equal(state.blobRequests,2);assert.equal(state.commitRequests,2);assert.equal(state.treeRequests,2);
 state.wrongSize=true;await assert.rejects(read(job.repository,job.headSha),/cached blob size/);state.wrongSize=false;
 const before=state.blobRequests;await read('example/other',job.headSha);assert.equal(state.blobRequests-before,2,'repository boundary does not share content');
 state.denied=true;await assert.rejects(read(job.repository,job.headSha));state.denied=false;
 state.truncated=true;await assert.rejects(read(job.repository,job.headSha),/limits/);
});
test('snapshot cache is bounded, client-local and never retains corrupt responses',async t=>{
 const {client,state}=await provider(t),read=createRemoteSnapshotReader(client,{maxEntries:1});
 for(let i=0;i<3;i++)await read(job.repository,job.headSha);assert.equal(state.blobRequests,6,'one-entry cache evicts rather than growing');
 const byteLimited=createRemoteSnapshotReader(client,{maxBytes:1});await byteLimited(job.repository,job.headSha);await byteLimited(job.repository,job.headSha);assert.equal(state.blobRequests,10);
 const other=await provider(t);await createRemoteSnapshotReader(other.client)(job.repository,job.headSha);assert.equal(other.state.blobRequests,2,'separate authenticated client cannot inherit content');
 const failed=createRemoteSnapshotReader(client);state.corrupt=true;await assert.rejects(failed(job.repository,job.headSha),/mismatched/);state.corrupt=false;
 const before=state.blobRequests;await failed(job.repository,job.headSha);assert.equal(state.blobRequests-before,2,'failed verification must not populate cache');
 assert.throws(()=>createRemoteSnapshotReader(client,{maxBytes:0}),/bounds/);
});

test('concurrent verified blob reads do not double-count cache capacity',async t=>{
 const {client}=await provider(t);const ordinary=await remoteSnapshot(client,job.repository,job.headSha);
 const bytes=Object.values(ordinary.files).reduce((n,text)=>n+Buffer.byteLength(text),0),read=createRemoteSnapshotReader(client,{maxBytes:bytes});
 const snapshots=await Promise.all([read(job.repository,job.headSha),read(job.repository,job.baseSha),read(job.repository,job.headSha)]);
 for(const snapshot of snapshots)assert.deepEqual(snapshot.files,ordinary.files);
 assert.deepEqual((await read(job.repository,job.headSha)).files,ordinary.files);
});
