import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gateIds, validateRelease, validateTasks, validatePhaseCoverage, releaseLedgerPath, requireCompletedDependencies, median, blockedSeconds, type Release, type Task } from '../scripts/lib/delivery.ts';
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

test('task dependencies reject missing/cyclic graphs and incomplete transitive acceptance', () => {
  const task = (id: string): Task => ({id,title:id,requirementIds:['R1'],status:'not-started',startedAt:null,completedAt:null,acceptance:[{text:'Observed acceptance',status:'pending',evidence:[]}]});
  const a=task('A'), b={...task('B'),dependsOn:['A']}, c={...task('C'),dependsOn:['B']};
  validateTasks([a,b,c],new Set(['R1']));
  assert.throws(()=>validateTasks([a,{...b,dependsOn:['missing']}],new Set(['R1'])),/Invalid task dependencies/);
  assert.throws(()=>validateTasks([a,{...b,dependsOn:['A','A']}],new Set(['R1'])),/Invalid task dependencies/);
  assert.throws(()=>validateTasks([{...a,dependsOn:['C']},b,c],new Set(['R1'])),/Cyclic task dependency/);
  const done = (value:Task):Task => ({...value,status:'done',completedAt:'2026-10-05T00:00:00Z',acceptance:[{...value.acceptance[0]!,status:'passed',evidence:['tests/delivery.test.ts']}]});
  assert.throws(()=>requireCompletedDependencies(c,[a,done(b),c]),/prerequisites for C: A/);
  assert.throws(()=>requireCompletedDependencies(c,[done(a),{...done(b),status:'deferred'},c]),/prerequisites for C: B/);
  requireCompletedDependencies(c,[done(a),done(b),c]);
});

test('delivery CLI refuses premature start, completion and reopen without altering ledger or events', () => {
  const directory=mkdtempSync(join(tmpdir(),'agentci-dependency-gate-'));
  const script=fileURLToPath(new URL('../scripts/delivery.ts',import.meta.url));
  try {
    for(const folder of ['delivery','specs','releases'])mkdirSync(join(directory,folder));
    writeFileSync(join(directory,'specs/requirements.yaml'),'requirements:\n  - id: R1\n    text: "- Phase acceptance"\n    source: {section: "40"}\n    implementation: {milestone: M3}\n');
    writeFileSync(join(directory,'releases/m3-gates.json'),JSON.stringify({milestone:'M3',version:'0.4.0-m3',sourceCommit:null,gates:gateIds.map(id=>({id,status:'pending',evidence:[]}))}));
    const parent:Task={id:'P',title:'Preflight',requirementIds:['R1'],status:'not-started',startedAt:null,completedAt:null,acceptance:[{text:'Preflight works',status:'pending',evidence:[]}]};
    for(const action of ['start','done','reopen']){
      const child:Task={...parent,id:'C',dependsOn:['P'],status:action==='start'?'not-started':action==='done'?'in-progress':'done',completedAt:action==='reopen'?'2026-10-05T00:00:00Z':null,acceptance:[{text:'Child works',status:'passed',evidence:['proof.json']}]};
      const before=JSON.stringify({milestone:'M3',tasks:[parent,child]});writeFileSync(join(directory,'delivery/tasks.json'),before);
      const result=spawnSync(process.execPath,['--import',import.meta.resolve('tsx'),script,'task','C',action,...(action==='reopen'?['New work']:[])],{cwd:directory,encoding:'utf8'});
      assert.notEqual(result.status,0);assert.match(result.stderr,/Incomplete task prerequisites for C: P/);
      assert.equal(readFileSync(join(directory,'delivery/tasks.json'),'utf8'),before);assert.equal(existsSync(join(directory,'delivery/task-events.jsonl')),false);
    }
  } finally {rmSync(directory,{recursive:true,force:true});}
});

test('phase plan cannot drop mandatory retro gates or drift from executable task dependencies', () => {
  const directory=mkdtempSync(join(tmpdir(),'agentci-retro-plan-'));
  try {
    for(const folder of ['delivery','specs'])mkdirSync(join(directory,folder));
    writeFileSync(join(directory,'specs/requirements.yaml'),readFileSync(new URL('../specs/requirements.yaml',import.meta.url)));
    const script=fileURLToPath(new URL('../scripts/check-phase-pr-plan.mjs',import.meta.url));
    for(const mutation of ['provider','release','task-drift']){
      const plan=JSON.parse(readFileSync(new URL('../delivery/phase-pr-plan.json',import.meta.url),'utf8'));
      const tasks=JSON.parse(readFileSync(new URL('../delivery/tasks.json',import.meta.url),'utf8'));
      if(mutation==='task-drift')tasks.tasks.find((t:Task)=>t.id==='M3-02').dependsOn=[];
      else {const pr=plan.phases[0].prs.find((p:{id:string})=>p.id===(mutation==='provider'?'M3-02':'M3-08'));pr.dependsOn=pr.dependsOn.filter((id:string)=>id!==(mutation==='provider'?'M3-R2':'M3-R1'));}
      writeFileSync(join(directory,'delivery/phase-pr-plan.json'),JSON.stringify(plan));writeFileSync(join(directory,'delivery/tasks.json'),JSON.stringify(tasks));
      const result=spawnSync(process.execPath,[script],{cwd:directory,encoding:'utf8'});
      assert.notEqual(result.status,0);assert.match(result.stderr,mutation==='task-drift'?/Task dependency drift/:/Missing required retrospective dependency/);
    }
  } finally {rmSync(directory,{recursive:true,force:true});}
});
