import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {findingReadFixture} from '../helpers/finding-read-fixture.ts';
import {canonical,digest} from '../../packages/review/engine.ts';
import {FindingHistoryStore} from '../../packages/storage/finding-history.ts';
import {ReviewDispatchStore} from '../../packages/storage/review-dispatch.ts';
import {validateModelFindingHistory} from '../../packages/reviewers/finding-transport.ts';
test('real HTTP continuation authenticates each page and excludes appended history beyond its watermark',async()=>{
 const f=await findingReadFixture();try{
  const path=`/v1/findings/${encodeURIComponent(f.finding.id)}`,query=`reviewId=${f.request.id}`;
  await f.history.transition(f.finding.id,f.finding.subject,{type:'queue'},1,randomUUID());
  const first=await validateModelFindingHistory(await(await f.get(`${path}/history?${query}&limit=1`)).json(),f.request.subject);
  assert.equal(first.throughVersion,2);assert.ok(first.nextCursor);
  const writes=new FindingHistoryStore(f.pool,f.scope,{reviewer:async()=>{throw Error('not used');},receipt:async()=>({findingId:f.finding.id,subjectDigest:digest(canonical(f.finding.subject)),evidenceDigest:digest('synthetic-retained-receipt'),assertionDigest:digest('synthetic-assertion'),actor:'reproduction',outcome:'not-reproduced',reason:'Controlled fixture'})});
  await writes.transition(f.finding.id,f.finding.subject,{type:'reproduce',receiptId:randomUUID()},2,randomUUID());
  const next=`${path}/history?${query}&cursor=${first.nextCursor}`;
  assert.equal((await f.get(next,'invalid-token')).status,401);
  assert.equal((await fetch(f.origin+next)).status,401);
  const second=await validateModelFindingHistory(await(await f.get(next)).json(),f.request.subject,first.items.at(-1));
  assert.equal(second.throughVersion,2);assert.deepEqual(second.items.map(r=>r.event.finding.version),[2]);assert.equal(second.nextCursor,null);
  const fresh=await validateModelFindingHistory(await(await f.get(`${path}/history?${query}`)).json(),f.request.subject);
  assert.deepEqual(fresh.items.map(r=>r.event.finding.version),[1,2,3]);assert.equal(fresh.throughVersion,3);
  const other={...f.request,id:randomUUID()};await f.admissions.admit(other);
  assert.equal((await f.get(`${path}/history?reviewId=${other.id}&cursor=${first.nextCursor}`)).status,400);
  assert.equal((await f.get(`/v1/findings/${encodeURIComponent(digest('another-finding'))}/history?${query}&cursor=${first.nextCursor}`)).status,400);
 }finally{await f.close();}
});
test('failed and cancelled reviews retain authenticated partial finding evidence without claiming summary completeness',async t=>{
 for(const terminal of ['failed','cancelled'] as const)await t.test(terminal,async()=>{
  const f=await findingReadFixture();try{
   const dispatch=new ReviewDispatchStore(f.pool,f.scope),entry=await dispatch.get(f.request.id);assert.ok(entry);const runId=randomUUID();
   await dispatch.bindRun(f.request.id,entry.workflowId,runId);
   if(terminal==='cancelled')await dispatch.requestCancellation(f.request.id);
   await dispatch.finish(f.request.id,runId,terminal,digest('retained-terminal-fixture'));
   const response=await f.get(`/v1/findings/${encodeURIComponent(f.finding.id)}?reviewId=${f.request.id}`);assert.equal(response.status,200);assert.deepEqual(await response.json(),f.initial);
   assert.equal((await f.get(`/v1/model-reviews/${f.request.id}/findings`)).status,409);
   const status=await(await f.get(`/v1/model-reviews/${f.request.id}`)).json();assert.equal(status.summary,null);assert.equal(status.execution.state,terminal);
  }finally{await f.close();}
 });
});
test('history continuation refuses a corrupted stored anchor with a bounded public error',async()=>{
 const f=await findingReadFixture();try{
  await f.history.transition(f.finding.id,f.finding.subject,{type:'queue'},1,randomUUID());
  const path=`/v1/findings/${encodeURIComponent(f.finding.id)}/history?reviewId=${f.request.id}`;
  const first=await(await f.get(`${path}&limit=1`)).json();assert.ok(first.nextCursor);
  // Simulate out-of-band corruption only inside the fixture's disposable schema.
  await f.pool.query('ALTER TABLE agentci_finding_events DISABLE TRIGGER finding_event_immutable');
  await f.pool.query('UPDATE agentci_finding_events SET digest=$1 WHERE finding_id=$2 AND version=1',[digest('corrupt-anchor'),f.finding.id]);
  await f.pool.query('ALTER TABLE agentci_finding_events ENABLE TRIGGER finding_event_immutable');
  const response=await f.get(`${path}&cursor=${first.nextCursor}`);assert.equal(response.status,503);
  const body=await response.text();assert.match(body,/service-unavailable/);assert.ok(body.length<256);assert.doesNotMatch(body,/anchor|SELECT|postgres|findingread_/);
 }finally{await f.close();}
});
