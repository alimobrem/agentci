import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {canonical,digest} from '../../packages/review/engine.ts';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {containerEngine} from '../../packages/evals/runner.ts';
import {runReproductionWorkflow} from '../fixtures/reproduction-temporal.ts';
import {reproductionFixture} from '../fixtures/reproduction.ts';
import {compileFindingReproduction} from '../../packages/findings/reproduction.ts';
import {FindingReproductionStore} from '../../packages/storage/finding-reproduction.ts';
import {FindingHistoryStore} from '../../packages/storage/finding-history.ts';
import {Store} from '../../packages/storage/postgres.ts';
import {EvalStore} from '../../packages/storage/evals.ts';
import {createReproductionActivities} from '../../apps/worker/reproduction-activities.ts';
import {executeStoredUnit,cleanupCancelledUnit} from '../../apps/eval-worker/unit.ts';
const url=process.env.AGENTCI_TEST_DATABASE_URL,image=process.env.AGENTCI_TEST_RUNNER_IMAGE;
if(!url||!image)throw Error('Durable reproduction integration requires PostgreSQL and immutable runner image; never silently skip');
for(const mode of ['positive','negative','crash','cancelled','live-cancelled','report-escape','temporal-positive','temporal-cancelled','cancel-before-stage','cancel-during-stage'] as const)test(`durable ${mode} reproduction fences authorization, execution and confirmation across restart`,{timeout:90000},async()=>{
 const schema=`repro_${randomUUID().replaceAll('-','')}`,admin=new Pool({connectionString:url});
 await admin.query(`CREATE SCHEMA ${schema}`);
 const pool=new Pool({connectionString:url,options:`-c search_path=${schema}`});
 try{
  for(const name of ['001_m1.sql','002_m2.sql','006_m3_finding_history.sql','007_m3_reproduction.sql'])await pool.query(await readFile(new URL(`../../deploy/migrations/${name}`,import.meta.url),'utf8'));
  await pool.query(await readFile(new URL('../../deploy/migrations/007_m3_reproduction.sql',import.meta.url),'utf8'));
  const options=mode==='report-escape'?{script:"import{symlinkSync}from'node:fs';symlinkSync('/etc/passwd','repro.json');"}:mode==='negative'?{source:"export function allowed(ns){return ns==='safe';}"}:(mode==='live-cancelled'||mode==='temporal-cancelled')?{script:'setInterval(()=>{},1000)'}:mode==='crash'?{script:"throw Error('fixture crash')"}:{};
  const f=reproductionFixture(image,options),subject=f.finding.subject,scope={organizationId:subject.organizationId,repository:subject.repository};
  const reviews=new Store(pool,scope.organizationId,scope.repository);await reviews.ready();
  const review=await reviews.save({schemaVersion:'v1alpha1',repository:subject.repository,baseSha:subject.baseSha,headSha:subject.headSha,changes:[],findings:[],risk:'low',advisory:true,evals:{status:'not-applicable',reason:'Reproduction fixture'}},subject.pullRequest);
  const approval={...f.approval,reviewId:review.id};
  const plan=compileFindingReproduction(f.finding,approval,f.base,f.head,f.policy,{...f.limits,maxAttempts:1});
  const evals=new EvalStore(pool,scope.organizationId,scope.repository);
  let reproduction:FindingReproductionStore;
  const readers={reviewer:async()=>({result:f.reviewer,documents:f.documents}),receipt:(id:string,s:typeof subject)=>reproduction.readReceipt(id,s)};
  const history=new FindingHistoryStore(pool,scope,readers);
  reproduction=new FindingReproductionStore(pool,scope,history,evals,{approvedPlan:async()=>plan});
  await history.create(f.initial,subject,randomUUID());
  await history.transition(f.finding.id,subject,{type:'queue'},1,randomUUID());
  const changed=compileFindingReproduction(f.finding,{...approval,reason:'Unapproved alteration'},f.base,f.head,f.policy,{...f.limits,maxAttempts:1});
  await assert.rejects(reproduction.reserve(changed,f.base,f.head),/finding-reproduction-conflict/);
  const reservations=await Promise.all(Array.from({length:3},()=>reproduction.reserve(plan,f.base,f.head)));
  assert.ok(reservations.every(p=>p.id===plan.id));
  if(mode==='cancel-during-stage'){
   const originalStage=evals.stage.bind(evals);
   let entered!:()=>void,release!:()=>void;
   const observed=new Promise<void>(resolve=>{entered=resolve;}),resume=new Promise<void>(resolve=>{release=resolve;});
   evals.stage=async(...args)=>{entered();await resume;return originalStage(...args);};
   const staging=reproduction.stage(plan.id,f.base,f.head);
   const rejected=assert.rejects(staging,/finding-reproduction-conflict/);
   try{await observed;assert.deepEqual(await reproduction.cancel(plan.id),{jobId:null,unitIds:[]});}
   finally{release();await rejected;evals.stage=originalStage;}
   const job=await evals.recoveryPlan(plan.id);assert.ok(job);
   const unit=await evals.unit(job.unitIds[0]!);assert.equal(unit!.status,'cancelled');assert.equal(unit!.result,undefined);
   assert.equal((await reproduction.finalize(plan.id)).event.finding.state,'unconfirmed');
   return;
  }
  if(mode==='cancel-before-stage'){
   assert.deepEqual(await reproduction.cancel(plan.id),{jobId:null,unitIds:[]});
   await assert.rejects(reproduction.stage(plan.id,f.base,f.head),/finding-reproduction-conflict/,'cancellation before dispatch must prevent later staging');
   assert.equal(await evals.recoveryPlan(plan.id),undefined);
   return;
  }
  const activities=createReproductionActivities(reproduction,async(repository,sha)=>{assert.equal(repository,subject.repository);if(sha===f.base.sha)return f.base;if(sha===f.head.sha)return f.head;throw Error('Unexpected revision');});
  const staged=await activities.stageFindingReproduction(plan.id);
  assert.deepEqual(await reproduction.stage(plan.id,f.base,f.head),staged);
  await assert.rejects(reproduction.finalize(plan.id),/finding-reproduction-conflict/);
  assert.equal((await history.get(f.finding.id,subject)).length,2);
  await assert.rejects(executeStoredUnit(evals,staged.unitId,{...f.policy,memoryMb:64}),/Approved execution limits exceed operator bounds/);
  await assert.rejects(executeStoredUnit(evals,staged.unitId,{...f.policy,engine:plan.runner.engine==='docker'?'podman':'docker'}),/Approved execution limits exceed operator bounds/);
  assert.equal((await evals.unit(staged.unitId))!.status,'queued');
  if(mode==='temporal-positive'||mode==='temporal-cancelled'){
   await runReproductionWorkflow(activities,evals,f.policy,plan.id,staged.unitId,mode==='temporal-cancelled');
  }else if(mode==='cancelled'){
   await reproduction.cancel(plan.id);
   await assert.rejects(executeStoredUnit(evals,staged.unitId,f.policy,{maxTrials:1}),/Eval unit cancelled/);
  }else if(mode==='live-cancelled'){
   const docker=async(args:string[])=>(await promisify(execFile)(containerEngine(),args)).stdout.trim();
   const running=executeStoredUnit(evals,staged.unitId,f.policy,{maxTrials:1,maintenanceMs:100}).then(()=>({ok:true,error:undefined}),error=>({ok:false,error}));
   try{
    let live='';
    for(let i=0;i<100;i++){live=await docker(['ps','--quiet','--filter',`label=agentci.eval.unit=${staged.unitId}`]);if(live)break;await delay(25);}
    assert.ok(live,'must observe the owned container running before cancelling');
    const inspected=JSON.parse(await docker(['inspect',live]))[0];
    assert.equal(inspected.HostConfig.NetworkMode,'none');
    assert.equal(inspected.HostConfig.ReadonlyRootfs,true);
    assert.equal(inspected.HostConfig.Memory,plan.runner.memoryMb*1024*1024);
    assert.equal(inspected.HostConfig.PidsLimit,plan.runner.pids);
    await reproduction.cancel(plan.id);
    const result=await running;assert.equal(result.ok,false);assert.match(result.error.message,/lease lost|cancelled/i);
    await cleanupCancelledUnit(evals,staged.unitId);
    assert.equal(await docker(['ps','--all','--quiet','--filter',`label=agentci.eval.unit=${staged.unitId}`]),'');
    assert.equal((await evals.unit(staged.unitId))!.result,undefined);
    assert.equal(await evals.claim(staged.unitId,30),undefined,'cancelled units cannot acquire a new lease');
   }finally{await reproduction.cancel(plan.id);await running;await cleanupCancelledUnit(evals,staged.unitId);}
  }else await executeStoredUnit(evals,staged.unitId,f.policy,{maxTrials:1});
  const disposition=await activities.finalizeFindingReproduction(plan.id);
  const confirmed=await reproduction.finalize(plan.id);
  assert.equal(disposition.state,confirmed.event.finding.state);
  assert.equal(confirmed.event.finding.state,(mode==='positive'||mode==='temporal-positive')?'confirmed':'unconfirmed');
  const receipt=await reproduction.readReceipt(plan.id,subject);assert.equal(receipt.outcome,(mode==='positive'||mode==='temporal-positive')?'reproduced':mode==='negative'?'not-reproduced':'error');
  assert.deepEqual(await reproduction.finalize(plan.id),confirmed);
  await reproduction.cancel(plan.id);
  assert.deepEqual(await reproduction.readReceipt(plan.id,subject),receipt,'late cancellation cannot rewrite terminal evidence');
  assert.deepEqual(await reproduction.finalize(plan.id),confirmed);
  const restarted=new Pool({connectionString:url,options:`-c search_path=${schema}`});
  try{
   const recoveredHistory=new FindingHistoryStore(restarted,scope,readers);
   reproduction=new FindingReproductionStore(restarted,scope,recoveredHistory,new EvalStore(restarted,scope.organizationId,scope.repository),{approvedPlan:async()=>plan});
   assert.deepEqual(await reproduction.readReceipt(plan.id,subject),receipt);
   assert.deepEqual(await reproduction.finalize(plan.id),confirmed);
   assert.equal((await recoveredHistory.get(f.finding.id,subject)).length,3);
  }finally{await restarted.end();}
  for(const table of ['agentci_reproduction_plans','agentci_reproduction_receipts','agentci_reproduction_cancellations']){
   await assert.rejects(pool.query(`UPDATE ${table} SET id=id`),/Immutable finding event/);
   await assert.rejects(pool.query(`DELETE FROM ${table}`),/Immutable finding event/);
   assert.equal((await pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count,'1');
  }
  if(mode==='negative'){
   const queued=await history.transition(f.finding.id,subject,{type:'queue'},3,randomUUID());
   const nextApproval={...approval,id:randomUUID(),findingDigest:digest(canonical(queued.event.finding))};
   const nextPlan=compileFindingReproduction(queued.event.finding,nextApproval,f.base,f.head,f.policy,{...f.limits,maxAttempts:1});
   const nextStore=new FindingReproductionStore(pool,scope,history,evals,{approvedPlan:async()=>nextPlan});
   await assert.rejects(nextStore.reserve(nextPlan,f.base,f.head),/finding-reproduction-conflict/,'requeue cannot reset the trusted finding attempt cap');
   assert.equal(await nextStore.get(nextPlan.id),undefined);
  }
 }finally{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
