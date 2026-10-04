import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { gateIds, validateRelease, validateTasks, validatePhaseCoverage, releaseLedgerPath, median, blockedSeconds, type Release, type Task } from '../scripts/lib/delivery.ts';
const sha = 'a'.repeat(40);
const release = (): Release => ({ milestone: 'M1', version: '0.2.0-m1', sourceCommit: sha, gates: gateIds.map(id => ({ id, status: 'passed', evidence: [{ kind: 'url', value: 'https://github.com/alimobrem/agentci/actions/runs/1', sourceCommit: sha }] })) });
test('release completion rejects missing gates, pending checks and evidence from another SHA', () => {
  assert.deepEqual(validateRelease(release(), true), []);
  const missing = release(); missing.gates.pop(); assert.throws(() => validateRelease(missing), /incomplete/);
  const pending = release(); pending.gates[0]!.status = 'pending'; assert.throws(() => validateRelease(pending, true), /Milestone incomplete/);
  const stale = release(); stale.gates[0]!.evidence[0]!.sourceCommit = 'b'.repeat(40); assert.throws(() => validateRelease(stale), /SHA mismatch/);
});
test('missing proof, invalid scope exceptions and escaped evidence paths cannot close a gate', () => {
  const empty = release(); empty.gates[0]!.evidence = []; assert.throws(() => validateRelease(empty), /No release evidence/);
  const skipped = release(); skipped.gates.find(g => g.id === 'live-dogfood')!.status = 'inapplicable'; assert.throws(() => validateRelease(skipped), /scope exception/);
  const path = release(); path.gates[0]!.evidence = [{kind:'file',value:'../secret',sourceCommit:sha,sha256:'a'.repeat(64)}]; assert.throws(() => validateRelease(path), /Invalid file/);
});
test('task completion requires known requirements, passed acceptance and explicit evidence', () => {
  const task: Task = {id:'T1',title:'Example',requirementIds:['R1'],status:'done',startedAt:null,completedAt:'2026-10-03T00:00:00Z',acceptance:[{text:'Observed result',status:'passed',evidence:['tests/delivery.test.ts']}]};
  validateTasks([task],new Set(['R1'])); assert.throws(()=>validateTasks([task],new Set()),/Unknown requirement/);
  assert.throws(()=>validateTasks([task,task],new Set(['R1'])),/Duplicate/);
  assert.throws(()=>validateTasks([{...task,acceptance:[{...task.acceptance[0]!,evidence:[]}]}],new Set(['R1'])),/acceptance evidence/);
  assert.throws(()=>validateTasks([{...task,acceptance:[{...task.acceptance[0]!,status:'pending'}]}],new Set(['R1'])),/not passed/);
});
test('timing summaries do not invent empty samples and use median rather than best run', () => {
  assert.equal(median([]),null); assert.equal(median([100,10,11]),11); assert.equal(median([3,1,4,2]),2.5);
});
test('deferral preserves unfinished acceptance and rejects absent evidence, escapes and false completion',()=>{
  const task:Task={id:'T1',title:'Deferred adoption',requirementIds:['R1'],status:'deferred',startedAt:'2026-10-03T00:00:00Z',completedAt:null,acceptance:[{text:'Native acceptance',status:'pending',evidence:[]}],deferral:{at:'2026-10-03T00:01:00Z',reason:'Owner approved release default change',evidence:'docs/m2-container-engine.md'}};
  validateTasks([task],new Set(['R1']));
  for(const invalid of [{...task,deferral:undefined},{...task,completedAt:'2026-10-03T00:02:00Z'},{...task,deferral:{...task.deferral!,evidence:'../secret'}},{...task,deferral:{...task.deferral!,at:'2026-10-02T00:00:00Z'}},{...task,deferral:{...task.deferral!,reason:''}}])assert.throws(()=>validateTasks([invalid],new Set(['R1'])),/Deferral|deferral/);
  const events=[{task:'T1',action:'block',at:'2026-10-03T00:00:10Z'},{task:'T1',action:'defer',at:'2026-10-03T00:00:30Z'}];
  assert.equal(blockedSeconds(task,events,Date.parse('2026-10-03T01:00:00Z')),20);
  validateTasks([{...task,status:'in-progress'}],new Set(['R1']));
  assert.throws(()=>validateTasks([{...task,status:'done',completedAt:'2026-10-03T00:02:00Z'}],new Set(['R1'])),/not passed/);
});
test('blocked time is separate from cycle time and unknown starts stay unknown', () => {
  const task:Task={id:'T1',title:'Example',requirementIds:['R1'],status:'done',startedAt:'2026-10-03T00:00:00Z',completedAt:'2026-10-03T00:01:00Z',acceptance:[]};
  const events=[{task:'T1',action:'block',at:'2026-10-03T00:00:10Z'},{task:'T1',action:'start',at:'2026-10-03T00:00:30Z'}];
  assert.equal(blockedSeconds(task,events),20);assert.equal(blockedSeconds({...task,startedAt:null},events),null);
});

test('expanded customer acceptance cannot close with only historical M1 gates', () => {
  const record = release(); record.customerAcceptance = true;
  assert.throws(() => validateRelease(record, true), /incomplete/);
  for (const id of ['customer-onboarding', 'agent-api']) record.gates.push({ id, status: 'pending', evidence: [] });
  assert.deepEqual(validateRelease(record), ['customer-onboarding', 'agent-api']);
  assert.throws(() => validateRelease(record, true), /Milestone incomplete/);
  record.gates.find(g => g.id === 'customer-onboarding')!.status = 'inapplicable';
  assert.throws(() => validateRelease(record), /scope exception/);
});
test('phase identity and coverage cannot reuse a prior milestone ledger or omit an exit requirement', () => {
  assert.equal(releaseLedgerPath('M10'), 'releases/m10-gates.json');
  for (const invalid of ['../M1', 'M11', 'M01', 'M2/secret']) assert.throws(() => releaseLedgerPath(invalid), /Unknown/);
  const wrong = release(); wrong.milestone = 'M2'; assert.throws(() => validateRelease(wrong, true), /Version/);
  const requirements = [{id:'R1',text:'- PR shows regressions',source:{section:'40'},implementation:{milestone:'M2'}}];
  assert.throws(() => validatePhaseCoverage('M2', [], requirements), /no task: R1/);
  assert.throws(() => validatePhaseCoverage('M3', [], requirements), /No milestone/);
  const record = release(); record.milestone='M2'; record.version='0.3.0-m2'; record.customerAcceptance=true;
  for (const id of ['customer-onboarding', 'agent-api']) record.gates.push({id,status:'passed',evidence:[{kind:'url',value:'https://example.com/proof',sourceCommit:sha}]});
  record.gates.find(g=>g.id==='agent-api')!.status='inapplicable';
  assert.throws(()=>validateRelease(record,true),/scope exception/);
});
test('delivery CLI checks a selected historical phase and rejects unsupported phases', () => {
  const result=spawnSync(process.execPath,['--import','tsx','scripts/delivery.ts','release','--milestone','M1','--require-complete'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr); assert.match(result.stdout,/M1 has 0 open release gates/);
  const unknown=spawnSync(process.execPath,['--import','tsx','scripts/delivery.ts','release','--milestone','M11'],{encoding:'utf8'});
  assert.notEqual(unknown.status,0); assert.match(unknown.stderr,/Unknown specification milestone/);
});
