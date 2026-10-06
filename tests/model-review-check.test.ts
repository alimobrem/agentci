import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canonical,digest} from '../packages/review/engine.ts';
import type {ModelReviewStatus} from '../packages/reviewers/transport.ts';
import {modelReviewCheckOutput} from '../packages/github/model-review-check.ts';
const admission=JSON.parse(readFileSync(new URL('../specs/api/fixtures/review-admission.json',import.meta.url),'utf8'));
function fixture(status='completed'):ModelReviewStatus{
 const summary={schemaVersion:'v1alpha1',admissionId:admission.id,admissionDigest:digest(canonical(admission)),profileRevision:admission.profile.revision,contextDigest:digest('context'),mode:admission.mode,coverage:{selectedFiles:1,configuredRoles:1,completedRoles:status==='completed'?1:0,wholeRepository:false},roles:[{requestId:admission.id,role:'security',digest:digest('role'),status}],findings:[]};
 const hash=digest(canonical(summary));return {schemaVersion:'v1alpha1',admission:{request:structuredClone(admission),digest:digest(canonical(admission))},execution:{state:'completed',cancelRequested:false,terminalDigest:hash},summary:{summary:summary as any,digest:hash}};
}
test('model review conclusion never treats synthetic, unconfirmed or incomplete work as clean success',()=>{
 const complete=fixture(),render=(value:ModelReviewStatus)=>modelReviewCheckOutput(value,admission.subject,'https://agentci.example');
 assert.equal(render(complete).conclusion,'neutral');assert.match(render(complete).output.summary,/Synthetic fixture/);assert.match(render(complete).output.summary,/not whole-repository/);
 for(const role of ['refused','incomplete'])assert.equal(render(fixture(role)).conclusion,'action_required');
 for(const state of ['failed','cancelled','terminated','timed-out'] as const){const value=fixture();value.execution.state=state;value.execution.terminalDigest=digest(state);value.summary=null;assert.equal(render(value).conclusion,'action_required');assert.match(render(value).output.summary,/Coverage unknown/);}
 const queued=fixture();queued.execution={state:'queued',cancelRequested:false,terminalDigest:null};queued.summary=null;assert.equal(render(queued).status,'in_progress');assert.equal(render(queued).conclusion,undefined);
});
test('renderer binds exact subject, summary and role digests and refuses credential-bearing URLs',()=>{
 const good=fixture();
 for(const mutate of [(v:ModelReviewStatus)=>{v.admission.digest=digest('wrong');},(v:ModelReviewStatus)=>{v.summary!.summary.coverage.completedRoles=0;},(v:ModelReviewStatus)=>{v.execution.terminalDigest=digest('other');},(v:ModelReviewStatus)=>{v.summary!.summary.admissionId='22222222-2222-4222-8222-222222222222';}]){const changed=structuredClone(good);mutate(changed);assert.throws(()=>modelReviewCheckOutput(changed,admission.subject,'https://agentci.example'));}
 assert.throws(()=>modelReviewCheckOutput(good,{...admission.subject,headSha:'c'.repeat(40)},'https://agentci.example'));
 for(const url of ['https://user:secret@example.com','https://example.com?token=secret','https://example.com/path','http://remote.example'])assert.throws(()=>modelReviewCheckOutput(good,admission.subject,url));
 const escaped=fixture();escaped.admission.request.profile.id='review_profile';escaped.admission.digest=digest(canonical(escaped.admission.request));escaped.summary!.summary.admissionDigest=escaped.admission.digest;escaped.summary!.digest=digest(canonical(escaped.summary!.summary));escaped.execution.terminalDigest=escaped.summary!.digest;
 const result=modelReviewCheckOutput(escaped,admission.subject,'https://agentci.example');assert.match(result.output.summary,/review\\_profile/);assert.ok(Buffer.byteLength(result.output.summary)<60000);assert.equal(result.detailsUrl,`https://agentci.example/v1/model-reviews/${admission.id}`);
});
