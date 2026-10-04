import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {comparisonFixture} from './fixtures/comparison.ts';import {exportFixture} from './fixtures/export.ts';
import {evalCheckEvidence} from '../packages/github/eval-check.ts';
import {comparisonRecord,createEvalComparison} from '../packages/evals/comparison.ts';
import type {ExportItem} from '../packages/evals/export.ts';
test('Check evidence requires a complete identity-bound export and derives regression/gap status',async()=>{
  const record=await comparisonFixture(),c=record.comparison,expected={...c.subject,organizationId:c.organizationId,reviewId:c.reviewId,attemptId:c.attemptId};
  const evidence=await evalCheckEvidence(exportFixture(record),record.id,expected);assert.equal(evidence.summary.outcome,'failed');assert.match(evidence.text,/Regression: safe-response/);assert.match(evidence.text,/pass-rate delta -1/);assert.match(evidence.text,/critical failures 2/);assert.equal(evidence.abbreviated,false);
  const items:ExportItem[]=[];for await(const item of exportFixture(record))items.push(item);
  async function* sequence(values:ExportItem[]){yield* values;}
  await assert.rejects(evalCheckEvidence(sequence(items.slice(0,-1)),record.id,expected),/Incomplete export/);
  await assert.rejects(evalCheckEvidence(exportFixture(record),record.id,{...expected,baseSha:'c'.repeat(40)}),/identity mismatch/);
  await assert.rejects(evalCheckEvidence(sequence([...items,items[0]!]),record.id,expected),/after export end/);
  const forged=structuredClone(items);const summary=forged.find(v=>v.type==='summary')!;if(summary.type==='summary')summary.data.outcome='passed';await assert.rejects(evalCheckEvidence(sequence(forged),record.id,expected),/summary mismatch/);
  const {apiVersion,kind,summary:oldSummary,...input}=c;
  const cancelled=comparisonRecord(createEvalComparison({...input,cancelRequested:true}));await assert.rejects(evalCheckEvidence(exportFixture(cancelled),record.id,expected),/not complete/);
  const queued=comparisonRecord(createEvalComparison({...input,units:input.units.map(({result,...u})=>({...u,status:'queued'}))}));await assert.rejects(evalCheckEvidence(exportFixture(queued),record.id,expected),/not complete/);
  const empty=comparisonRecord(createEvalComparison({...input,units:[]}));assert.equal((await evalCheckEvidence(exportFixture(empty),record.id,expected)).summary.outcome,'no-evals');
  const gapped=comparisonRecord(createEvalComparison({...input,units:[],coverageGaps:['REQ-NEW']}));const gaps=await evalCheckEvidence(exportFixture(gapped),record.id,expected);assert.equal(gaps.summary.outcome,'insufficient');assert.match(gaps.text,/Uncovered requirement: REQ-NEW/);
});
test('Check display caps UTF-8 bytes while complete large evidence and all regressions remain validated',async()=>{
  const record=await comparisonFixture(),c=record.comparison,{apiVersion,kind,summary,...input}=c;
  const units=Array.from({length:100},(_,i)=>c.units.map(u=>{const id=randomUUID(),suite=`suite-${i}`,model='model/'+ 'a'.repeat(100);const source=i<99&&u.side==='head'?c.units[0]!.result!:u.result!;return {...structuredClone(u),id,suite,model,result:{...structuredClone(source),id,suite,model,subject:structuredClone(u.result!.subject)}};})).flat();
  const large=comparisonRecord(createEvalComparison({...input,units})),expected={...c.subject,organizationId:c.organizationId,reviewId:c.reviewId,attemptId:c.attemptId};
  const evidence=await evalCheckEvidence(exportFixture(large),record.id,expected);assert.equal(evidence.summary.unitCount,200);assert.equal(evidence.summary.comparisonCount,100);assert.equal(evidence.summary.outcome,'failed');assert.equal(evidence.abbreviated,true);assert.equal(evidence.regressions,1);assert.match(evidence.text,/Comparison suite-99/);assert.match(evidence.text,/Regression: safe-response/);assert.ok(Buffer.byteLength(evidence.text)<48000);
  const unsafe=comparisonRecord(createEvalComparison({...input,units:c.units.map(u=>({...u,model:'model_with__underscores',result:{...u.result!,model:'model_with__underscores'}}))}));
  const escaped=await evalCheckEvidence(exportFixture(unsafe),record.id,expected);assert.ok(escaped.text.includes('model\\_with\\_\\_underscores'));
});
