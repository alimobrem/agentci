import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parse } from 'yaml';
import { validateTasks, validateRelease, validatePhaseCoverage, releaseLedgerPath, requireCompletedDependencies, median, blockedSeconds, type Task, type Release } from './lib/delivery.ts';
const invocation = process.argv.slice(2), milestoneIndex = invocation.indexOf('--milestone');
let explicitMilestone: string | undefined;
if (milestoneIndex !== -1) { explicitMilestone = invocation[milestoneIndex + 1]; if (!explicitMilestone) throw new Error('--milestone requires M0–M10'); invocation.splice(milestoneIndex, 2); }
const [command = 'report', argument, ...args] = invocation;
const tasks = JSON.parse(await readFile('delivery/tasks.json', 'utf8')) as { milestone: string; tasks: Task[] };
const requirements = parse(await readFile('specs/requirements.yaml', 'utf8')).requirements as { id: string; text: string; source: { section: string }; implementation: { milestone: string } }[];
validateTasks(tasks.tasks, new Set(requirements.map(r => r.id)));
const milestone = explicitMilestone ?? tasks.milestone;
validatePhaseCoverage(milestone, tasks.tasks, requirements);
const record = JSON.parse(await readFile(releaseLedgerPath(milestone), 'utf8')) as Release;
if (record.milestone !== milestone) throw new Error('Release ledger belongs to another milestone');
const remaining = validateRelease(record, args.includes('--require-complete') || argument === '--require-complete');
if (command === 'check' || command === 'release') {
  for (const task of tasks.tasks) {if(task.deferral)await access(task.deferral.evidence);for (const acceptance of task.acceptance) for (const path of acceptance.evidence) await access(path);}
  for (const gate of record.gates) for (const proof of gate.evidence) if (proof.kind === 'file' && createHash('sha256').update(await readFile(proof.value)).digest('hex') !== proof.sha256) throw new Error(`Changed evidence file: ${proof.value}`);
  console.log(`${tasks.tasks.length} tasks validated; ${record.milestone} has ${remaining.length} open release gates.`);
} else if (command === 'task') {
  const task = tasks.tasks.find(t => t.id === argument); if (!task) throw new Error('Unknown task');
  const [action, ...rest] = args, now = new Date().toISOString();
  if (action === 'start') { if (task.status === 'done') throw new Error('Cannot restart completed task'); requireCompletedDependencies(task, tasks.tasks); task.startedAt ??= now; task.status = 'in-progress'; delete task.blockedReason; }
  else if (action === 'block') { if (!rest.length || task.status !== 'in-progress') throw new Error('Block requires an active task and reason'); task.status = 'blocked'; task.blockedReason = rest.join(' '); }
  else if(action==='defer'){if(task.status==='done'||!rest[0]||!rest.slice(1).join(' ').trim())throw new Error('Defer requires unfinished task, evidence path and reason');await access(rest[0]);task.deferral={at:now,evidence:rest[0],reason:rest.slice(1).join(' ')};task.status='deferred';delete task.blockedReason;}
  else if (action === 'accept') { if(task.status==='deferred')throw new Error('Resume deferred task before accepting work');const index = Number(rest[0]); if (!Number.isInteger(index) || !task.acceptance[index] || !rest[1]) throw new Error('accept needs criterion index and evidence path'); await access(rest[1]); task.acceptance[index]!.status = 'passed'; task.acceptance[index]!.evidence = [rest[1]]; }
  else if (action === 'done') { if (task.status !== 'in-progress' || task.acceptance.some(a => a.status !== 'passed')) throw new Error('Complete acceptance before marking done'); requireCompletedDependencies(task, tasks.tasks); task.status = 'done'; task.completedAt = now; }
  else if (action === 'reopen') { if (task.status !== 'done' || !rest.length) throw new Error('Reopen requires a completed task and reason'); requireCompletedDependencies(task, tasks.tasks); task.status = 'in-progress'; task.startedAt = now; task.completedAt = null; task.acceptance = task.acceptance.map(a=>({...a,status:'pending',evidence:[]})); }
  else throw new Error('Task action: start, block, defer, accept, done, reopen');
  validateTasks(tasks.tasks, new Set(requirements.map(r => r.id)));
  await writeFile('delivery/tasks.json', JSON.stringify(tasks, null, 2) + '\n');
  const event = { at: now, task: task.id, action, sourceCommit: execFileSync('git', ['rev-parse','HEAD'], {encoding:'utf8'}).trim(), details: action === 'defer'?task.deferral:action === 'block' ? task.blockedReason : action === 'reopen' ? rest.join(' ') : null };
  const { appendFile } = await import('node:fs/promises'); await appendFile('delivery/task-events.jsonl', JSON.stringify(event) + '\n');
  console.log(`${task.id}: ${task.status}`);
} else if (command === 'quality') {
  if (!['escaped-defect','dogfood-defect'].includes(argument ?? '') || !args[0] || !requirements.some(r=>r.id===args[0]) || !args[1]) throw new Error('quality needs escaped-defect/dogfood-defect, requirement ID and evidence path');
  await access(args[1]);
  const {appendFile}=await import('node:fs/promises');await appendFile('delivery/quality-events.jsonl',JSON.stringify({at:new Date().toISOString(),kind:argument,requirementId:args[0],evidence:args[1],sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()})+'\n');
  console.log('Quality event recorded; add the regression fixture and task.');
} else if (command === 'collect-ci') {
  if (!/^\d+$/.test(argument ?? '')) throw new Error('Provide a CI run ID');
  const runInfo = JSON.parse(execFileSync('gh', ['api', `repos/alimobrem/agentci/actions/runs/${argument}`], {encoding:'utf8'}));
  const attempt = args[2] ? Number(args[2]) : runInfo.run_attempt;
  if (!Number.isSafeInteger(attempt) || attempt < 1) throw new Error('Invalid run attempt');
  const run = attempt === runInfo.run_attempt ? runInfo : JSON.parse(execFileSync('gh', ['api', `repos/alimobrem/agentci/actions/runs/${argument}/attempts/${attempt}`], {encoding:'utf8'}));
  if (run.status !== 'completed') throw new Error('Only completed attempts can be recorded');
  const pages = JSON.parse(execFileSync('gh', ['api', '--paginate', '--slurp', `repos/alimobrem/agentci/actions/runs/${argument}/attempts/${attempt}/jobs?per_page=100`], {encoding:'utf8'}));
  const seconds = (a: string,b: string) => (Date.parse(b)-Date.parse(a))/1000;
  const sample = { runId: Number(argument), attempt, conclusion:run.conclusion, cohort: args[0] ?? 'optimized', cache: args[1] ?? 'unknown', collectedAt: new Date().toISOString(), sourceCommit: run.head_sha, url: run.html_url, event: run.event, jobs: pages.flatMap((p:any)=>p.jobs).map((j: any) => ({name:j.name,seconds:seconds(j.started_at,j.completed_at),steps:j.steps.map((s: any)=>({name:s.name,seconds:seconds(s.started_at,s.completed_at),conclusion:s.conclusion}))})) };
  await mkdir('delivery/runs',{recursive:true}); await writeFile(`delivery/runs/${argument}-attempt-${attempt}.json`,JSON.stringify(sample,null,2)+'\n');console.log(`Recorded ${run.html_url}, attempt ${attempt}`);
} else if (command === 'report') {
  const baseline = JSON.parse(await readFile('delivery/baseline.json','utf8'));
  const { readdir } = await import('node:fs/promises'); let files: string[] = []; try { files = await readdir('delivery/runs'); } catch {}
  const runs = await Promise.all(files.filter(f=>f.endsWith('.json')).map(async f=>JSON.parse(await readFile(`delivery/runs/${f}`,'utf8'))));
  let fast: any;try {fast=JSON.parse(await readFile('.agentci/artifacts/delivery/fast-latest.json','utf8'));}catch{}
  const events = async (path:string) => { try { return (await readFile(path,'utf8')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)); } catch(error:any) { if(error.code==='ENOENT')return [];throw error; } };
  const quality = await events('delivery/quality-events.jsonl'), taskEvents = await events('delivery/task-events.jsonl');
  const baselineCi = median(baseline.ci.map((r:any)=>r.jobSeconds));
  const optimizedCi = median(runs.filter(r=>r.cohort==='optimized'&&r.conclusion==='success').map(r=>Math.max(...r.jobs.map((j:any)=>j.seconds))));
  const ciByCache=Object.fromEntries(['cold','warm','unknown'].map(cache=>{
    const values=runs.filter(r=>r.cohort==='optimized'&&r.conclusion==='success'&&r.cache===cache).map(r=>Math.max(...r.jobs.map((j:any)=>j.seconds)));
    const seconds=median(values);return[cache,{samples:values.length,medianSeconds:seconds,reductionPercent:baselineCi&&seconds?100*(baselineCi-seconds)/baselineCi:null}];
  }));
  const report = { baselineCiSeconds: baselineCi, optimizedCiMedianSeconds: optimizedCi, optimizedSamples:runs.filter(r=>r.cohort==='optimized'&&r.conclusion==='success').length, firstPassAttempts:runs.filter(r=>r.attempt===1&&r.cohort==='optimized'&&['success','failure'].includes(r.conclusion)).length, firstPassFailures:runs.filter(r=>r.attempt===1&&r.cohort==='optimized'&&r.conclusion==='failure').length, preliminaryCiReductionPercent:baselineCi&&optimizedCi?100*(baselineCi-optimizedCi)/baselineCi:null, baselineLocalMedianSeconds:median(baseline.local.samples.map((s:any)=>s.seconds)), latestFastCheckSeconds:fast?.passed?fast.seconds:null, tasks:tasks.tasks.map(t=>({id:t.id,status:t.status,cycleSeconds:t.startedAt&&t.completedAt?(Date.parse(t.completedAt)-Date.parse(t.startedAt))/1000:null})), openReleaseGates:remaining, interpretation:'Feedback-loop timings only; no historical task-delivery baseline. Caches, suite size and runner conditions affect results; small samples do not prove causality.' };
  console.log(JSON.stringify({...report,ciByCache,tasks:report.tasks.map(t=>({...t,blockedSeconds:blockedSeconds(tasks.tasks.find(task=>task.id===t.id)!,taskEvents)})),quality:{firstPassFailures:report.firstPassFailures,reopenedTasks:taskEvents.filter(e=>e.action==='reopen').length,recordedEscapedDefects:quality.filter(e=>e.kind==='escaped-defect').length,recordedDogfoodDefects:quality.filter(e=>e.kind==='dogfood-defect').length,note:'Recorded events since tracking began; zero does not establish absence of unreported defects.'}},null,2));
} else throw new Error('Command: check, release, task, collect-ci, report');
