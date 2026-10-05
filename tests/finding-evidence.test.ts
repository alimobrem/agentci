import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {randomUUID} from 'node:crypto';
import {mergeFindingEvidence} from '../packages/findings/model.ts';
import {digest} from '../packages/review/engine.ts';
const fixture=()=>JSON.parse(readFileSync(new URL('../specs/api/fixtures/model-finding.json',import.meta.url),'utf8'));
test('additional reviewer evidence preserves disposition and cannot interrupt pinned reproduction',()=>{
 const first=fixture();first.state='deduplicated';first.version=1;first.disposition=null;
 const incoming=structuredClone(first);incoming.sources[0].requestId=randomUUID();incoming.sources[0].attemptId=randomUUID();incoming.severity='critical';
 const next=mergeFindingEvidence(first,incoming);assert.equal(next.id,first.id);assert.equal(next.state,'deduplicated');assert.equal(next.version,2);assert.equal(next.sources.length,2);assert.equal(next.severity,'critical');
 for(const state of ['confirmed','unconfirmed','false-positive','resolved']){
  const disposition=state==='confirmed'?{kind:'reproduction',outcome:'reproduced'}:state==='unconfirmed'?{kind:'reproduction',outcome:'error'}:state==='resolved'?{kind:'operator',outcome:'resolved'}:{kind:'operator',outcome:'false-positive'};
  const prior={...first,state,version:3,disposition:{...disposition,evidenceDigest:digest('trusted receipt'),reason:'retained decision'}};
  const merged=mergeFindingEvidence(prior,incoming);assert.equal(merged.state,state);assert.deepEqual(merged.disposition,prior.disposition);assert.equal(merged.version,4);
 }
 assert.throws(()=>mergeFindingEvidence({...first,state:'reproduction-pending',version:2},incoming),/invalid-model-finding/);
 assert.throws(()=>mergeFindingEvidence(first,{...incoming,subject:{...incoming.subject,headSha:'c'.repeat(40)}}));
 assert.throws(()=>mergeFindingEvidence({...first,version:10000},incoming));
 const full={...first,sources:Array.from({length:64},()=>({...first.sources[0],requestId:randomUUID(),attemptId:randomUUID()}))};
 assert.throws(()=>mergeFindingEvidence(full,incoming),/invalid-model-finding/);
});
