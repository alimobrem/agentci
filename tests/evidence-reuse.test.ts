import test from 'node:test';import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {evidenceKey,reusableEvidence,validateEvidenceHistory,evidenceMeasurements,type EvidenceRecord} from '../scripts/lib/evidence-reuse.ts';
const record=(overrides:Partial<EvidenceRecord>={}):EvidenceRecord=>({id:randomUUID(),recordedAt:'2026-10-05T00:00:00Z',sourceCommit:'a'.repeat(40),artifactDigest:'sha256:'+'b'.repeat(64),platform:'linux/arm64',verifierRevision:'sha256:'+'c'.repeat(64),subject:'api',boundary:'download',coverage:['startup','recovery'],result:'passed',reason:null,proof:{path:'delivery/acceptance/proof.json',sha256:'d'.repeat(64)},seconds:30,cache:'warm',...overrides});
test('immutable evidence reuse requires exact identity and sufficient coverage at the same boundary',()=>{
 const original=record();assert.equal(reusableEvidence({...original,coverage:['startup']},[original])?.id,original.id);
 for(const change of [{sourceCommit:'e'.repeat(40)},{artifactDigest:'sha256:'+'f'.repeat(64)},{platform:'linux/amd64'},{verifierRevision:'sha256:'+'1'.repeat(64)},{subject:'worker'},{boundary:'publication' as const},{coverage:['isolation']}])assert.equal(reusableEvidence({...original,...change},[original]),null);
 assert.equal(evidenceKey(original),evidenceKey({...original,coverage:['recovery','startup']}));
});
test('failed or invalidated evidence cannot fall back to a stale earlier pass',()=>{
 const first=record(),failed=record({result:'failed',recordedAt:'2026-10-05T00:01:00Z',reason:'New failure investigated'});
 assert.equal(reusableEvidence(first,[first,failed]),null);
 assert.equal(reusableEvidence(first,[first],[{recordId:first.id,at:'2026-10-05T00:01:00Z',reason:'Security assessment changed'}]),null);
 const recovered=record({recordedAt:'2026-10-05T00:02:00Z',reason:'Recovery verification after retained failure'});
 assert.equal(reusableEvidence(first,[first,failed,recovered])?.id,recovered.id);
 assert.throws(()=>validateEvidenceHistory([first,record()]),/requires.*reason/);
 assert.throws(()=>validateEvidenceHistory([first,first]),/Duplicate/);
 assert.throws(()=>validateEvidenceHistory([first],[{recordId:'missing',at:first.recordedAt,reason:'Missing'}]),/Invalid.*invalidation/);
});
test('measurement cohorts preserve failures, unknown timings and distinct cache/platform/coverage',()=>{
 const samples=[record(),record({id:randomUUID(),cache:'cold',reason:'Cold-cache comparison',recordedAt:'2026-10-05T00:01:00Z',result:'failed',seconds:null}),record({platform:'linux/amd64'}),record({verifierRevision:'sha256:'+'2'.repeat(64)}),record({coverage:['startup'],reason:'Narrow feedback measurement',recordedAt:'2026-10-05T00:02:00Z'})];
 const report=evidenceMeasurements(samples);assert.equal(report.cohorts.length,5);assert.equal(report.cohorts.find(c=>c.cache==='cold')?.failures,1);assert.deepEqual(report.cohorts.find(c=>c.cache==='cold')?.seconds,[]);
 assert.match(report.interpretation,/No total development acceleration/);
});

test('evidence CLI preserves history, rejects changed proof and requires repeat reasons',()=>{
 const directory=mkdtempSync(join(tmpdir(),'agentci-evidence-'));
 const module=new URL('../scripts/lib/evidence-command.ts',import.meta.url).href;
 const invoke=(...args:string[])=>spawnSync(process.execPath,['--import',import.meta.resolve('tsx'),'--input-type=module','-e',`const {evidenceCommand}=await import(${JSON.stringify(module)});await evidenceCommand(process.argv[1],process.argv.slice(2));`,...args],{cwd:directory,encoding:'utf8'});
 try{
  mkdirSync(join(directory,'delivery/acceptance'),{recursive:true});
  const proof='{"result":"passed"}\n';writeFileSync(join(directory,'delivery/acceptance/proof.json'),proof);
  const {id,recordedAt,...input}=record({proof:{path:'delivery/acceptance/proof.json',sha256:createHash('sha256').update(proof).digest('hex')}});
  writeFileSync(join(directory,'input.json'),JSON.stringify(input));
  const identity=Object.fromEntries(['sourceCommit','artifactDigest','platform','verifierRevision','subject','boundary','coverage'].map(key=>[key,(input as any)[key]]));writeFileSync(join(directory,'identity.json'),JSON.stringify(identity));
  const first=invoke('record','input.json');assert.equal(first.status,0,first.stderr);const recordId=JSON.parse(first.stdout).id;
  const before=readFileSync(join(directory,'delivery/evidence-records.jsonl'),'utf8');
  const duplicate=invoke('record','input.json');assert.notEqual(duplicate.status,0);assert.match(duplicate.stderr,/requires.*reason/);assert.equal(readFileSync(join(directory,'delivery/evidence-records.jsonl'),'utf8'),before);
  const reused=invoke('reuse','identity.json');assert.equal(reused.status,0,reused.stderr);assert.equal(JSON.parse(reused.stdout).id,recordId);
  writeFileSync(join(directory,'delivery/acceptance/proof.json'),'changed');const changed=invoke('reuse','identity.json');assert.notEqual(changed.status,0);assert.match(changed.stderr,/proof bytes changed/);
  writeFileSync(join(directory,'delivery/acceptance/proof.json'),proof);
  assert.equal(invoke('invalidate',recordId,'New security assessment').status,0);assert.equal(invoke('reuse','identity.json').status,1);
  writeFileSync(join(directory,'input.json'),JSON.stringify({...input,reason:'Reassessed invalidated evidence'}));assert.equal(invoke('record','input.json').status,0);
  assert.equal(readFileSync(join(directory,'delivery/evidence-records.jsonl'),'utf8').trim().split('\n').length,2);
 }finally{rmSync(directory,{recursive:true,force:true});}
});
