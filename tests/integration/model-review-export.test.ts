import test from 'node:test';import assert from 'node:assert/strict';import {ModelReviewExportVerifier} from '../../packages/reviewers/export.ts';import {modelReviewExportStorage} from '../helpers/model-review-export-storage.ts';
async function verify(f:Awaited<ReturnType<typeof modelReviewExportStorage>>){const response=await f.get();assert.equal(response.status,200);assert.match(response.headers.get('content-type')??'',/^application\/x-ndjson/);assert.equal(response.headers.get('cache-control'),'no-store');const frames=(await response.text()).trimEnd().split('\n').map(line=>JSON.parse(line)),v=new ModelReviewExportVerifier(f.request);for(const frame of frames)await v.push(frame);return {frames,certificate:v.finish()};}
test('queued and completed exports certify retained snapshots without provider dispatch during reads',async()=>{
 const f=await modelReviewExportStorage();try{
  const queued=await verify(f);assert.equal(queued.certificate.header.review.execution.state,'queued');assert.equal(queued.certificate.header.missingRoleIds.length,2);assert.equal(queued.frames.length,2);assert.equal(f.calls(),0);
  const result=await f.execute();await f.finish('completed',result.digest);const completed=await verify(f);assert.equal(completed.certificate.header.review.execution.state,'completed');assert.equal(completed.certificate.header.reviewerCount,2);assert.equal(completed.certificate.header.findings.length,1);assert.equal(completed.certificate.header.eventCount,1);assert.equal(completed.certificate.header.missingRoleIds.length,0);assert.equal(f.calls(),2);assert.ok(!JSON.stringify(completed.frames).includes(f.content),'No selected source document bytes in export');
  for(const path of [`/v1/model-reviews/${f.request.id}/export?limit=1`,`/v1/model-reviews/not-a-uuid/export`])assert.equal((await fetch(f.origin+path,{headers:{authorization:`Bearer ${f.config.evidenceToken}`}})).status,400);
  assert.equal((await fetch(f.origin+`/v1/model-reviews/${f.request.id}/export`)).status,401);
 }finally{await f.close();}
});
for(const state of ['failed','cancelled'] as const)test(`${state} review exports retained roles and findings when summary commitment was interrupted`,async()=>{
 const f=await modelReviewExportStorage();try{await assert.rejects(f.execute('summary'));await f.finish(state);const result=await verify(f);assert.equal(result.certificate.header.review.execution.state,state);assert.equal(result.certificate.header.review.summary,null);assert.equal(result.certificate.header.reviewerCount,2);assert.equal(result.certificate.header.eventCount,1);assert.equal(f.calls(),2);}finally{await f.close();}
});
test('failure between role saves exports honest missing-role coverage',async()=>{
 const f=await modelReviewExportStorage();try{await assert.rejects(f.execute('second-role'));await f.finish('failed');const result=await verify(f);assert.equal(result.certificate.header.review.summary,null);assert.equal(result.certificate.header.reviewerCount,1);assert.equal(result.certificate.header.missingRoleIds.length,1);assert.equal(result.certificate.header.eventCount,0);assert.equal(f.calls(),2);}finally{await f.close();}
});
test('snapshot metadata frame and aggregate byte limits fail before NDJSON headers',async()=>{
 // Inject only aggregate byte metadata, avoiding a 140MiB fixture allocation.
 // All identities, roles, findings and SQL reads still use the real database.
 const f=await modelReviewExportStorage(5);try{
  const result=await f.execute();await f.finish('completed',result.digest);const {ModelReviewExports}=await import('../../packages/storage/model-review-export.ts');let frameTooLarge=true;
  const connect=f.pool.connect.bind(f.pool),bounded={connect:async()=>{const c=await connect(),query=c.query.bind(c);return {query:async(text:string,values?:unknown[])=>{const result=await query(text,values);if(text.includes(' AS frame_bytes FROM agentci_finding_events')){for(const row of result.rows){if(frameTooLarge)row.frame_bytes=4*1024*1024+1;else row.bytes=28*1024*1024;}}return result;},release:()=>c.release()};}} as any;
  f.control.exportReview=id=>new ModelReviewExports(bounded,f.scope).prepare(id);
  for(const mode of [true,false]){frameTooLarge=mode;const response=await f.get();assert.equal(response.status,413);assert.match(response.headers.get('content-type')??'',/^application\/json/);assert.deepEqual(await response.json(),{error:{code:'response-too-large'}});}
 }finally{await f.close();}
});
test('rehashed retained role cannot change the immutable admitted configuration',async()=>{
 const f=await modelReviewExportStorage();try{
  await assert.rejects(f.execute('second-role'));await f.finish('failed');
  const row=(await f.pool.query('SELECT request_id,result FROM agentci_reviewer_results')).rows[0];
  const {canonical,digest}=await import('../../packages/review/engine.ts');row.result.configDigest=digest('wrong policy but same request/provider/model');
  // Simulate corrupted retained storage in this disposable schema only. Rehashing
  // the result leaves its public domain shape valid but cannot replace authority.
  await f.pool.query('ALTER TABLE agentci_reviewer_results DISABLE TRIGGER reviewer_result_immutable');
  await f.pool.query('UPDATE agentci_reviewer_results SET result=$1,digest=$2 WHERE request_id=$3',[row.result,digest(canonical(row.result)),row.request_id]);
  await f.pool.query('ALTER TABLE agentci_reviewer_results ENABLE TRIGGER reviewer_result_immutable');
  const response=await f.get();assert.equal(response.status,503);assert.match(response.headers.get('content-type')??'',/^application\/json/);assert.deepEqual(await response.json(),{error:{code:'service-unavailable'}});
 }finally{await f.close();}
});
