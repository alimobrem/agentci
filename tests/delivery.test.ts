import test from 'node:test';
import assert from 'node:assert/strict';
import { gateIds, validateRelease, validateTasks, median, blockedSeconds, type Release, type Task } from '../scripts/lib/delivery.ts';
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
test('blocked time is separate from cycle time and unknown starts stay unknown', () => {
  const task:Task={id:'T1',title:'Example',requirementIds:['R1'],status:'done',startedAt:'2026-10-03T00:00:00Z',completedAt:'2026-10-03T00:01:00Z',acceptance:[]};
  const events=[{task:'T1',action:'block',at:'2026-10-03T00:00:10Z'},{task:'T1',action:'start',at:'2026-10-03T00:00:30Z'}];
  assert.equal(blockedSeconds(task,events),20);assert.equal(blockedSeconds({...task,startedAt:null},events),null);
});
