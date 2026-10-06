import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {findingReadFixture} from '../helpers/finding-read-fixture.ts';
import {validateModelFindingHistory,validateModelReviewFindings} from '../../packages/reviewers/finding-transport.ts';
import {validateFindingHistoryRecord} from '../../packages/findings/history.ts';
test('finding HTTP reads retain original review versions, scope partial evidence and paginate stable history',async()=>{
 const f=await findingReadFixture();try{
  const path=`/v1/findings/${encodeURIComponent(f.finding.id)}`,query=`reviewId=${f.request.id}`,list=`/v1/model-reviews/${f.request.id}/findings`;
  assert.equal((await f.get(list)).status,409);
  const partial=await f.get(`${path}?${query}`);assert.equal(partial.status,200);assert.deepEqual(validateFindingHistoryRecord(await partial.json(),f.request.subject),f.initial);
  await f.history.transition(f.finding.id,f.finding.subject,{type:'queue'},1,randomUUID());await f.retainSummary();
  const refs=await f.get(list);assert.equal(refs.status,200);assert.deepEqual(validateModelReviewFindings(await refs.json()).items,[{id:f.finding.id,version:1,digest:f.initial.digest}]);
  assert.equal((validateFindingHistoryRecord(await (await f.get(`${path}?${query}`)).json(),f.request.subject)).event.finding.version,2);
  assert.deepEqual(await (await f.get(`${path}?${query}&version=1`)).json(),f.initial);
  const first=await validateModelFindingHistory(await (await f.get(`${path}/history?${query}&limit=1`)).json(),f.request.subject);assert.equal(first.throughVersion,2);assert.equal(first.items[0]!.event.finding.version,1);assert.ok(first.nextCursor);
  const second=await validateModelFindingHistory(await (await f.get(`${path}/history?${query}&cursor=${first.nextCursor}&limit=100`)).json(),f.request.subject,first.items[0]);assert.equal(second.items[0]!.event.finding.version,2);assert.equal(second.nextCursor,null);
  const unrelated={...f.request,id:randomUUID()};await f.admissions.admit(unrelated);assert.equal((await f.get(`${path}?reviewId=${unrelated.id}`)).status,404);
  for(const suffix of ['&limit=0','&limit=101','&limit=1&limit=2','&unknown=x','&cursor=x'])assert.equal((await f.get(`${path}/history?${query}${suffix}`)).status,400);
  assert.equal((await f.get(`${path}?${query}&version=3`)).status,404);assert.equal((await f.get(`${path}?${query}&version=10001`)).status,400);
  assert.equal((await f.get(`${path}?${query}`,'wrong')).status,401);assert.equal((await f.get(`${path}?${query}`,f.config.operatorToken)).status,200);
  assert.equal((await f.get(`${list}?cursor=${first.nextCursor}`)).status,400);
  const response=await f.get(`${path}?${query}`);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-content-type-options'),'nosniff');
 }finally{await f.close();}
});
