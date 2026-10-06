import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {canonical,digest} from '../packages/review/engine.ts';
import {createFindingTransitions,type FindingAction,type FindingReceipt} from '../packages/findings/lifecycle.ts';
import {validateFindingHistoryRecord,validateFindingHistoryLink,type FindingHistoryRecord} from '../packages/findings/history.ts';
import type {ModelFinding} from '../packages/findings/model.ts';
const proposed=JSON.parse(readFileSync(new URL('../specs/api/fixtures/model-finding.json',import.meta.url),'utf8')) as ModelFinding;
function event(finding:ModelFinding,action:any,prior:FindingHistoryRecord|null,receipt:FindingReceipt|null=null):FindingHistoryRecord{
 const input=finding.version===1?{type:'create',finding}:{id:finding.id,subject:finding.subject,action,expectedVersion:finding.version-1};
 const value={schemaVersion:'v1alpha1' as const,operationId:randomUUID(),inputDigest:digest(canonical(input)),previousDigest:prior?.digest??null,action,receipt,finding};
 return {event:value,digest:digest(canonical(value))};
}
async function chain(){
 const finding={...structuredClone(proposed),state:'deduplicated' as const,version:1},first=event(finding,{type:'create'},null);
 const queue={type:'queue'} as const,queued=(await createFindingTransitions(async()=>{throw Error('no receipt for queue');})(finding,queue,1)).finding,second=event(queued,queue,first);
 const receipt:FindingReceipt={findingId:finding.id,subjectDigest:digest(canonical(finding.subject)),evidenceDigest:digest('receipt-evidence'),assertionDigest:digest('assertion'),actor:'reproduction',outcome:'reproduced',reason:'Synthetic receipt fixture'};
 const action:FindingAction={type:'reproduce',receiptId:randomUUID()},confirmed=(await createFindingTransitions(async()=>receipt)(queued,action,2)).finding;
 return [first,second,event(confirmed,action,second,receipt)];
}
function rehash(record:FindingHistoryRecord){
 const e=record.event,f=e.finding;e.inputDigest=digest(canonical(f.version===1?{type:'create',finding:f}:{id:f.id,subject:f.subject,action:e.action,expectedVersion:f.version-1}));record.digest=digest(canonical(e));return record;
}
test('standalone retained event rejects self-consistent forged versions actions and receipt envelopes',async t=>{
 const [first,second,third]=await chain();assert.deepEqual(validateFindingHistoryRecord(first,proposed.subject),first);assert.deepEqual(validateFindingHistoryRecord(second,proposed.subject),second);assert.deepEqual(validateFindingHistoryRecord(third,proposed.subject),third);
 const invalid:[string,FindingHistoryRecord][]=[];
 const zero=event(structuredClone(proposed),{type:'queue'},first!);invalid.push(['unretained version zero',zero]);
 const unknown=structuredClone(second!);(unknown.event.action as any).type='promote-to-confirmed';invalid.push(['unknown action',rehash(unknown)]);
 const extra=structuredClone(second!);(extra.event.action as any).force=true;invalid.push(['unknown action fields',rehash(extra)]);
 const queueReceipt=structuredClone(second!);queueReceipt.event.receipt=structuredClone(third!.event.receipt);invalid.push(['queue with receipt',rehash(queueReceipt)]);
 const missingReceipt=structuredClone(third!);missingReceipt.event.receipt=null;invalid.push(['confirmation missing receipt',rehash(missingReceipt)]);
 const wrongFinding=structuredClone(third!);wrongFinding.event.receipt!.findingId=digest('different-finding');invalid.push(['receipt for another finding',rehash(wrongFinding)]);
 const wrongEvidence=structuredClone(third!);wrongEvidence.event.receipt!.evidenceDigest=digest('different-evidence');invalid.push(['receipt and disposition mismatch',rehash(wrongEvidence)]);
 const extraReceipt=structuredClone(third!);(extraReceipt.event.receipt as any).privateKey='forbidden-field';invalid.push(['unknown receipt fields',rehash(extraReceipt)]);
 for(const [label,record] of invalid)await t.test(label,()=>assert.throws(()=>validateFindingHistoryRecord(record,proposed.subject)));
 assert.throws(()=>validateFindingHistoryRecord(first,{...proposed.subject,organizationId:randomUUID()}));
});
test('finding history chain rejects omitted duplicated reordered and wrong-predecessor events',async()=>{
 const [first,second,third]=await chain();assert.deepEqual(await validateFindingHistoryLink(first!,proposed.subject),first);assert.deepEqual(await validateFindingHistoryLink(second!,proposed.subject,first),second);assert.deepEqual(await validateFindingHistoryLink(third!,proposed.subject,second),third);
 await assert.rejects(validateFindingHistoryLink(second!,proposed.subject));
 await assert.rejects(validateFindingHistoryLink(third!,proposed.subject,first));
 await assert.rejects(validateFindingHistoryLink(second!,proposed.subject,second));
 await assert.rejects(validateFindingHistoryLink(first!,proposed.subject,second));
 const broken=structuredClone(third!);broken.event.previousDigest=digest('unrelated-tip');rehash(broken);await assert.rejects(validateFindingHistoryLink(broken,proposed.subject,second));
});
