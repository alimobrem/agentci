import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {randomUUID} from 'node:crypto';
import {canonical,digest} from '../packages/review/engine.ts';import {buildReviewContext} from '../packages/reviewers/context.ts';
import {findingsFromReviewer,deduplicateFindings,validateModelFinding} from '../packages/findings/model.ts';
import {createFindingTransitions,findingBlockingDecision,type FindingReceipt} from '../packages/findings/lifecycle.ts';
const fixture=()=>{
 const r=JSON.parse(readFileSync(new URL('../specs/api/fixtures/reviewer-result.json',import.meta.url),'utf8'));
 const docs=[{kind:'source',side:'head',path:'app.ts',content:'first\nsecond',digest:digest('first\nsecond')}];
 r.contextDigest=buildReviewContext(r.subject,docs).digest;
 r.response.structuredOutput={findings:[{category:'security',severity:'high',claim:'  Missing  authorization  ',evidence:[{side:'head',path:'app.ts',digest:docs[0]!.digest,startLine:1,endLine:2}]}]};
 r.proposal.output=structuredClone(r.response.structuredOutput);r.responseDigest=digest(canonical(r.response));return {r,docs};
};
const normalized=()=>{const {r,docs}=fixture();return findingsFromReviewer(r,r.subject,docs)[0]!;};
const receipt=(f:ReturnType<typeof normalized>,outcome:FindingReceipt['outcome']='reproduced'):FindingReceipt=>({findingId:f.id,subjectDigest:digest(canonical(f.subject)),evidenceDigest:digest('execution'),assertionDigest:digest('assertion'),actor:'reproduction',outcome,reason:'Retained controller verification'});

test('finding proposals bind exact selected evidence and reject model-supplied lifecycle fields',()=>{
 const {r,docs}=fixture(),f=findingsFromReviewer(r,r.subject,docs)[0]!;
 assert.equal(f.claim,'Missing authorization');assert.equal(f.state,'proposed');assert.equal(f.sources[0]!.originalClaim,'  Missing  authorization  ');
 for(const mutate of [(p:any)=>p.state='confirmed',(p:any)=>p.evidence[0].path='../secret',(p:any)=>p.evidence[0].endLine=3,(p:any)=>p.evidence[0].digest=digest('wrong')]){
  const {r,docs}=fixture();mutate(r.response.structuredOutput.findings[0]);r.proposal.output=structuredClone(r.response.structuredOutput);r.responseDigest=digest(canonical(r.response));assert.throws(()=>findingsFromReviewer(r,r.subject,docs));
 }
 assert.throws(()=>findingsFromReviewer(r,r.subject,[{...docs[0],content:'changed',digest:digest('changed')}]));
 assert.throws(()=>validateModelFinding({...f,id:digest('forged')},f.subject));
});

test('exact duplicate aggregation is deterministic and agreement does not confirm or block',()=>{
 const {r,docs}=fixture(),a=findingsFromReviewer(r,r.subject,docs)[0]!;r.requestId=randomUUID();r.attemptId=randomUUID();const b=findingsFromReviewer(r,r.subject,docs)[0]!;
 const x=deduplicateFindings([a,b],a.subject);assert.deepEqual(x,deduplicateFindings([b,a],a.subject));assert.equal(x.length,1);assert.equal(x[0]!.sources.length,2);assert.equal(x[0]!.state,'deduplicated');
 assert.equal(findingBlockingDecision(x[0]!,{id:'default',minimumSeverity:'high',allowUnconfirmed:false,reason:''}).blocking,false);
 r.response.structuredOutput.findings[0].evidence[0].endLine=1;r.proposal.output=structuredClone(r.response.structuredOutput);r.responseDigest=digest(canonical(r.response));const distinct=findingsFromReviewer(r,r.subject,docs)[0]!;assert.notEqual(a.id,distinct.id);
 assert.equal(deduplicateFindings([a,distinct],a.subject).length,2);
 assert.throws(()=>deduplicateFindings([a,{...b,subject:{...a.subject,repository:'other/repo'}}],a.subject));
 const repeated=fixture();repeated.r.response.structuredOutput.findings.push({...structuredClone(repeated.r.response.structuredOutput.findings[0]),claim:'Missing authorization'});repeated.r.proposal.output=structuredClone(repeated.r.response.structuredOutput);repeated.r.responseDigest=digest(canonical(repeated.r.response));const sameReview=deduplicateFindings(findingsFromReviewer(repeated.r,repeated.r.subject,repeated.docs),repeated.r.subject);assert.equal(sameReview.length,1);assert.equal(sameReview[0]!.sources.length,2);
});

test('lifecycle requires exact trusted reproduction and operator receipts and preserves the input',async()=>{
 const f=deduplicateFindings([normalized()],normalized().subject)[0]!;let proof=receipt(f);const transition=createFindingTransitions(async()=>proof);
 const pending=(await transition(f,{type:'queue'},1)).finding;assert.equal(f.state,'deduplicated');
 const confirmed=(await transition(pending,{type:'reproduce',receiptId:randomUUID()},2)).finding;assert.equal(confirmed.state,'confirmed');
 proof={...proof,actor:'operator',assertionDigest:null,outcome:'resolved',reason:'Verified resolution evidence'};
 assert.equal((await transition(confirmed,{type:'resolve',receiptId:randomUUID()},3)).finding.state,'resolved');
 for(const outcome of ['not-reproduced','error'] as const){proof=receipt(f,outcome);const unconfirmed=(await transition(pending,{type:'reproduce',receiptId:randomUUID()},2)).finding;assert.equal(unconfirmed.state,'unconfirmed');assert.equal((await transition(unconfirmed,{type:'queue'},3)).finding.disposition,null);}
 proof={...receipt(f),actor:'operator',assertionDigest:null,outcome:'false-positive'};assert.equal((await transition(pending,{type:'false-positive',receiptId:randomUUID()},2)).finding.state,'false-positive');
});

test('forged confirmation, stale version, wrong subject and receipt outages fail closed',async()=>{
 const f=normalized();let reads=0;const transition=createFindingTransitions(async()=>{reads++;return receipt(f);});
 await assert.rejects(transition(f,{type:'reproduce',receiptId:randomUUID()},0));assert.equal(reads,0);
 const d=deduplicateFindings([f],f.subject)[0]!;await assert.rejects(transition(d,{type:'queue'},0));
 const p=(await transition(d,{type:'queue'},1)).finding;
 for(const change of [{findingId:digest('other')},{subjectDigest:digest('other')},{assertionDigest:null},{actor:'operator'},{outcome:'false-positive'}])await assert.rejects(createFindingTransitions(async()=>({...receipt(f),...change}) as FindingReceipt)(p,{type:'reproduce',receiptId:randomUUID()},2));
 await assert.rejects(createFindingTransitions(async()=>{throw Error('secret');})(p,{type:'reproduce',receiptId:randomUUID()},2),error=>error instanceof Error&&error.message==='finding-receipt-unavailable');
 assert.throws(()=>validateModelFinding({...f,state:'confirmed',version:1},f.subject));
});

test('explicit customer override is separate from verification and synthetic findings never block',()=>{
 const f=normalized(),policy={id:'override',minimumSeverity:'high' as const,allowUnconfirmed:true,reason:'Authorized high-severity policy'};
 assert.equal(findingBlockingDecision(f,policy).blocking,false);
 // Structural fixture for an external record; no live-provider acceptance is claimed.
 const external={...f,mode:'external' as const};external.id=digest(canonical({subject:external.subject,mode:external.mode,category:external.category,claim:external.claim,evidence:external.evidence}));
 assert.equal(findingBlockingDecision(external,{...policy,allowUnconfirmed:false}).blocking,false);
 const decision=findingBlockingDecision(external,policy);assert.equal(decision.blocking,true);assert.equal(decision.basis,'explicit-customer-policy');assert.equal(decision.state,'proposed');
 assert.throws(()=>findingBlockingDecision(external,{...policy,reason:''}));
});
