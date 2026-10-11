import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canonical,digest} from '../packages/review/engine.ts';
import {validateReviewAdmission} from '../packages/reviewers/admission.ts';
import {nameUuid} from '../packages/evals/request-id.ts';
import {validateReviewExecutionSummary} from '../packages/reviewers/summary.ts';
const read=(path:string)=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const examples=read('../specs/api/drafts/model-review-examples.json');
const draft=read('../specs/api/drafts/model-review-transport.json');
// Contract fixture coherence only. Real transport authorization, atomic reads,
// persistence and export verification are acceptance work in 07c-1/2/3/4.
function coherentStatus(value:any){
 assert.deepEqual(Object.keys(value).sort(),['admission','execution','schemaVersion','summary']);assert.equal(value.schemaVersion,'v1alpha1');
 const request=validateReviewAdmission(value.admission.request);assert.equal(value.admission.digest,digest(canonical(request)));
 const {state,terminalDigest}=value.execution;
 assert.ok(['queued','dispatched','completed','failed','cancelled','terminated','timed-out'].includes(state));
 assert.equal(typeof value.execution.cancelRequested,'boolean');
 if(['queued','dispatched'].includes(state))assert.equal(terminalDigest,null);else assert.match(terminalDigest,/^sha256:[a-f0-9]{64}$/);
 if(value.summary!==null){
  const summary=validateReviewExecutionSummary(value.summary.summary);
  assert.equal(summary.admissionId,request.id);assert.equal(summary.admissionDigest,value.admission.digest);
  assert.equal(summary.profileRevision,request.profile.revision);assert.equal(summary.mode,request.mode);
  assert.equal(value.summary.digest,digest(canonical(summary)));
  assert.ok(['queued','dispatched','completed'].includes(state));
 }
 if(state==='completed'){assert.ok(value.summary);assert.equal(terminalDigest,value.summary.digest);}
}
test('draft composed status examples retain domain identity and do not equate completion with successful coverage',()=>{
 const request=validateReviewAdmission(examples.request);assert.equal(examples.accepted.id,request.id);assert.equal(examples.accepted.requestDigest,digest(canonical(request)));
 for(const value of Object.values(examples.statuses))coherentStatus(value);
 const completed=examples.statuses.completedWithRefusal;
 assert.equal(completed.execution.state,'completed');assert.equal(completed.summary.summary.coverage.completedRoles,0);
 assert.equal(completed.summary.summary.coverage.wholeRepository,false);assert.equal(completed.summary.summary.roles[0].status,'refused');
 assert.equal(examples.statuses.awaitingFinalization.execution.terminalDigest,null);assert.ok(examples.statuses.awaitingFinalization.summary);
 assert.equal(examples.emptyFindingsPage.summaryDigest,completed.summary.digest);assert.equal(examples.emptyFindingsPage.reviewId,request.id);
 assert.equal(examples.emptyFindingsPage.nextCursor,null);assert.deepEqual(examples.emptyFindingsPage.items,[]);
});
test('cross-record corruption and false terminal evidence fail composed fixture invariants',()=>{
 for(const mutate of [
  (s:any)=>{s.admission.request.subject.headSha='f'.repeat(40);},
  (s:any)=>{s.summary.summary.admissionId='22222222-2222-4222-8222-222222222222';s.summary.digest=digest(canonical(s.summary.summary));},
  (s:any)=>{s.summary.summary.profileRevision='sha256:'+'f'.repeat(64);s.summary.digest=digest(canonical(s.summary.summary));},
  (s:any)=>{s.summary.summary.mode='live';s.summary.digest=digest(canonical(s.summary.summary));},
  (s:any)=>{s.summary.summary.coverage.completedRoles=1;},
  (s:any)=>{s.execution.state='terminated';},
  (s:any)=>{s.summary=null;},
  (s:any)=>{s.execution.terminalDigest='sha256:'+'f'.repeat(64);},
 ]){const value=structuredClone(examples.statuses.completedWithRefusal);mutate(value);assert.throws(()=>coherentStatus(value));}
 // The request boundary remains the shipped internal validator, including its
 // rejection of caller-selected execution/credential fields.
 for(const field of ['command','providerUrl','budget','credentials'])assert.throws(()=>validateReviewAdmission({...examples.request,[field]:'caller-controlled'}));
});
test('cancelled export prefix binds missing roles and is explicitly not a complete execution or download',()=>{
 const {digest:frameDigest,...frame}=examples.exportHeader;assert.equal(frameDigest,digest(canonical(frame)));
 const {snapshotDigest,...snapshot}=frame.data;assert.equal(snapshotDigest,digest(canonical(snapshot)));
 coherentStatus(snapshot.review);assert.equal(snapshot.review.execution.state,'cancelled');assert.equal(snapshot.review.summary,null);
 assert.deepEqual(snapshot.retainedRoles,[]);assert.equal(snapshot.reviewerCount,0);assert.equal(snapshot.eventCount,0);
 assert.deepEqual(snapshot.missingRoleIds,snapshot.configuredRoles.map((r:any)=>r.requestId));
 for(const role of snapshot.configuredRoles)assert.equal(role.requestId,nameUuid(snapshot.review.admission.request.id,`agentci:reviewer:v1:${snapshot.review.admission.request.profile.revision}:${role.role}`));
 assert.equal(frame.type,'header');assert.equal(frame.sequence,0);assert.equal(frame.previousDigest,'sha256:'+'0'.repeat(64));
 const altered=structuredClone(frame);altered.data.review.execution.state='completed';assert.notEqual(digest(canonical(altered)),frameDigest);
 assert.match(examples.notice,/incomplete stream prefix/);
});
test('draft operations map real requirement IDs and advertise only implemented transport slices',()=>{
 const requirements=readFileSync(new URL('../specs/requirements.yaml',import.meta.url),'utf8');
 const published=read('../specs/api/openapi.json');
 assert.equal(draft.state,'draft-not-shipped');assert.equal(new Set(draft.operations.map((o:any)=>o.operationId)).size,draft.operations.length);
 for(const op of draft.operations){assert.ok(op.scenarios.length);assert.ok(op.requirementIds.length);for(const id of op.requirementIds)assert.ok(requirements.includes(`id: ${id}\n`),id);if(!['listReviewFindings','getFinding','getFindingHistory','exportModelReview','getFindingReproduction','cancelFindingReproduction','requestFindingReproduction','setFindingDisposition'].includes(op.operationId)&&op.owner!=='07c-1')assert.equal(published.paths[op.path],undefined,`${op.path} is draft only`);else assert.equal(published.paths[op.path]?.[op.method.toLowerCase()]?.operationId,op.operationId);}
 const reservation=published.paths['/v1/findings/{id}/reproductions'].post;assert.equal(reservation.requestBody.required,true);assert.equal(reservation.requestBody.content['application/json'].schema.$ref,'#/components/schemas/FindingReproductionRequest');assert.deepEqual(reservation.security,[{ModelReviewOperator:[]}]);
 assert.deepEqual(draft.authority.mutation,['AGENTCI_OPERATOR_TOKEN']);assert.ok(draft.authority.read.includes('AGENTCI_EVIDENCE_TOKEN'));
 assert.ok(draft.operations.find((o:any)=>o.operationId==='exportModelReview').scenarios.some((s:string)=>s.includes('M3-C11')));
});
