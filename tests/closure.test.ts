import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID,createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {validateConsolidatedClosure,type ConsolidatedClosure} from '../scripts/lib/closure.ts';
import {gateIds,customerGateIds,type Release} from '../scripts/lib/delivery.ts';
import type {EvidenceRecord} from '../scripts/lib/evidence-reuse.ts';
function fixture(){
 const sourceCommit='a'.repeat(40),version='0.4.0-m3';
 const release:Release={milestone:'M3',version,sourceCommit,customerAcceptance:true,gates:[...gateIds,...customerGateIds].map(id=>({id,status:'passed',evidence:[{kind:'url',value:'https://example.com/proof',sourceCommit}]}))};
 const evidence:EvidenceRecord={id:randomUUID(),recordedAt:'2026-10-05T00:00:00Z',sourceCommit,artifactDigest:'sha256:'+'b'.repeat(64),platform:'linux/arm64',verifierRevision:'sha256:'+'c'.repeat(64),subject:'fixture',boundary:'download',coverage:[...release.gates.map(g=>`gate:${g.id}`),'demo:success','demo:failure'],result:'passed',reason:null,proof:{path:'releases/fixture.json',sha256:'d'.repeat(64)},seconds:null,cache:'unknown'};
 const closure:ConsolidatedClosure={milestone:'M3',version,sourceCommit,releaseUrl:`https://github.com/alimobrem/agentci/releases/tag/v${version}`,requirementAudit:{path:'releases/m3-audit.json',sha256:'d'.repeat(64)},retrospective:{path:'docs/retrospectives/m3.md',sha256:'e'.repeat(64)},demo:{deliveredAt:'2026-10-05T00:01:00Z',successEvidenceId:evidence.id,failureEvidenceId:evidence.id},gates:release.gates.map(g=>({id:g.id,evidenceIds:g.id==='closure'?[]:[evidence.id]})),limitations:[]};
 return {release,evidence,closure};
}
test('consolidated closure rejects wrong source, incomplete gates, missing demos and invalidated proofs',()=>{
 const {release,evidence,closure}=fixture();assert.equal(validateConsolidatedClosure(release,closure,[evidence]).length,1);
 assert.throws(()=>validateConsolidatedClosure(release,{...closure,sourceCommit:'f'.repeat(40)},[evidence]),/identity/);
 assert.throws(()=>validateConsolidatedClosure(release,{...closure,gates:closure.gates.slice(1)},[evidence]),/mapping/);
 assert.throws(()=>validateConsolidatedClosure(release,{...closure,demo:{...closure.demo,failureEvidenceId:'missing'}},[evidence]),/demo:failure/);
 assert.throws(()=>validateConsolidatedClosure(release,closure,[{...evidence,coverage:['gate:scope']}]),/current accepted evidence/);
 assert.throws(()=>validateConsolidatedClosure(release,closure,[evidence],[{recordId:evidence.id,at:'2026-10-05T00:02:00Z',reason:'Security finding'}]),/current accepted evidence/);
 const recursive=structuredClone(closure);recursive.gates.find(g=>g.id==='closure')!.evidenceIds=[evidence.id];assert.throws(()=>validateConsolidatedClosure(release,recursive,[evidence]),/recursively/);
});
test('closure refuses pending release gates and stale evidence after a later failed verification',()=>{
 const {release,evidence,closure}=fixture();
 const pending=structuredClone(release);pending.gates[0]!.status='pending';assert.throws(()=>validateConsolidatedClosure(pending,closure,[evidence]),/Milestone incomplete/);
 const failed:EvidenceRecord={...evidence,id:randomUUID(),recordedAt:'2026-10-05T00:03:00Z',result:'failed',reason:'Required recovery retest failed'};
 assert.throws(()=>validateConsolidatedClosure(release,closure,[evidence,failed]),/current accepted evidence/);
});

test('release CLI enforces canonical closure and rejects changed proof bytes',()=>{
 const directory=mkdtempSync(join(tmpdir(),'agentci-closure-'));
 const script=fileURLToPath(new URL('../scripts/delivery.ts',import.meta.url));
 try{
  for(const name of ['delivery','specs','releases','docs/retrospectives'])mkdirSync(join(directory,name),{recursive:true});
  const {release,evidence,closure}=fixture();
  const proof='{"fixture":true}\n',digest=createHash('sha256').update(proof).digest('hex');
  evidence.proof.sha256=digest;closure.requirementAudit.sha256=digest;closure.retrospective.sha256=digest;
  for(const name of [evidence.proof.path,closure.requirementAudit.path,closure.retrospective.path])writeFileSync(join(directory,name),proof);
  writeFileSync(join(directory,'delivery/evidence-records.jsonl'),JSON.stringify(evidence)+'\n');
  writeFileSync(join(directory,'specs/requirements.yaml'),'requirements:\n  - id: R1\n    text: "- Acceptance"\n    source: {section: "40"}\n    implementation: {milestone: M3}\n');
  writeFileSync(join(directory,'delivery/tasks.json'),JSON.stringify({milestone:'M3',tasks:[{id:'T',title:'Fixture',requirementIds:['R1'],status:'done',startedAt:null,completedAt:'2026-10-05T00:01:00Z',acceptance:[{text:'Fixture accepted',status:'passed',evidence:['releases/fixture.json']}]}]}));
  const invoke=()=>spawnSync(process.execPath,['--import',import.meta.resolve('tsx'),script,'release','--require-complete'],{cwd:directory,encoding:'utf8'});
  writeFileSync(join(directory,'releases/m3-gates.json'),JSON.stringify(release));
  const absent=invoke();assert.notEqual(absent.status,0);assert.match(absent.stderr,/Canonical consolidated closure/);
  const bytes=JSON.stringify(closure);writeFileSync(join(directory,'releases/m3-closure.json'),bytes);
  release.gates.find(g=>g.id==='closure')!.evidence=[{kind:'file',value:'releases/m3-closure.json',sourceCommit:release.sourceCommit!,sha256:createHash('sha256').update(bytes).digest('hex')}];
  writeFileSync(join(directory,'releases/m3-gates.json'),JSON.stringify(release));
  const passed=invoke();assert.equal(passed.status,0,passed.stderr);
  writeFileSync(join(directory,evidence.proof.path),'tampered');const changed=invoke();assert.notEqual(changed.status,0);assert.match(changed.stderr,/proof bytes changed/);
 }finally{rmSync(directory,{recursive:true,force:true});}
});
