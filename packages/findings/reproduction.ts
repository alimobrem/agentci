import {canonical,digest} from '../review/engine.ts';
import type {Snapshot} from '../review/types.ts';
import {validateModelFinding,type ModelFinding} from './model.ts';
import type {FindingReceipt} from './lifecycle.ts';
import {validateEvalSuite,validateEvalRun,type EvalSuite} from '../evals/contracts.ts';
import {baselineHarness} from '../evals/harness.ts';
import {projectEvalInputs,validateRunnerPolicy,type RunnerPolicy} from '../evals/runner.ts';
import type {EvalUnit,EvalUnitDefinition} from '../storage/evals.ts';

const fail=():never=>{throw new Error('invalid-finding-reproduction');};
const uuid=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const sha=(value:unknown)=>typeof value==='string'&&/^sha256:[a-f0-9]{64}$/.test(value);
/** Loaded by the controller from authenticated policy, never from model output.
 * The approval authorizes the meaning of this particular assertion for this claim. */
export interface ReproductionApproval {
 id:string;policyDigest:string;findingDigest:string;reviewId:string;
 targetSide:'base'|'head';assertionSide:'base'|'head';suite:EvalSuite;
 scenarioId:string;reproducedStatus:'passed'|'failed';reason:string;
}
export interface ReproductionLimits {maxAttempts:number;maxTrials:number;maxTimeoutMs:number;maxOutputBytes:number}
export interface ReproductionPlan {
 schemaVersion:'v1alpha1';id:string;approval:ReproductionApproval;finding:ModelFinding;
 inputs:{base:string;head:string};assertionDigest:string;runner:Required<Omit<RunnerPolicy,'httpProviders'>>;
 limits:ReproductionLimits;definition:EvalUnitDefinition;
}
function limits(value:ReproductionLimits):ReproductionLimits{
 if(!value||Object.keys(value).sort().join(',')!=='maxAttempts,maxOutputBytes,maxTimeoutMs,maxTrials'||
  !Number.isSafeInteger(value.maxAttempts)||value.maxAttempts<1||value.maxAttempts>20||
  !Number.isSafeInteger(value.maxTrials)||value.maxTrials<1||value.maxTrials>100||
  !Number.isSafeInteger(value.maxTimeoutMs)||value.maxTimeoutMs<100||value.maxTimeoutMs>300000||
  !Number.isSafeInteger(value.maxOutputBytes)||value.maxOutputBytes<1024||value.maxOutputBytes>1024*1024)fail();
 return structuredClone(value);
}
/** Pure compilation only. Persistence must reserve an attempt before staging any
 * execution and must authenticate approval and snapshot readers. */
export function compileFindingReproduction(value:ModelFinding,approvalValue:ReproductionApproval,baseValue:Snapshot,headValue:Snapshot,policy:RunnerPolicy,budget:ReproductionLimits):ReproductionPlan{
 try{
  const finding=validateModelFinding(value,value.subject),approval=structuredClone(approvalValue),cap=limits(budget);
  if(finding.state!=='reproduction-pending')fail();
  if(!approval||Object.keys(approval).sort().join(',')!=='assertionSide,findingDigest,id,policyDigest,reason,reproducedStatus,reviewId,scenarioId,suite,targetSide'||!uuid(approval.id)||!uuid(approval.reviewId)||!sha(approval.policyDigest)||approval.findingDigest!==digest(canonical(finding))||
   !['base','head'].includes(approval.targetSide)||!['base','head'].includes(approval.assertionSide)||!['passed','failed'].includes(approval.reproducedStatus)||typeof approval.reason!=='string'||!approval.reason.trim()||Buffer.byteLength(approval.reason)>4096)fail();
  const suite=validateEvalSuite(approval.suite),runner=validateRunnerPolicy(policy);
  if(['command','http'].includes(suite.spec.runner.adapter)||!suite.spec.runner.report||!suite.spec.runner.harness?.length||suite.spec.models?.length||
   suite.spec.trials.count>cap.maxTrials||suite.spec.runner.timeoutMs>cap.maxTimeoutMs||(suite.spec.runner.maxOutputBytes??1024*1024)>cap.maxOutputBytes||!suite.spec.scenarios.some(s=>s.id===approval.scenarioId))fail();
  approval.suite=suite;
  if(baseValue.sha!==finding.subject.baseSha||headValue.sha!==finding.subject.headSha)fail();
  const snapshots={base:projectEvalInputs(baseValue).snapshot,head:projectEvalInputs(headValue).snapshot};
  if(!finding.evidence.some(ref=>ref.side===approval.targetSide))fail();
  for(const ref of finding.evidence){const text=snapshots[ref.side].files[ref.path];if(text===undefined||digest(text)!==ref.digest||ref.endLine>text.split('\n').length)fail();}
  const harness=baselineHarness(suite,snapshots[approval.assertionSide],snapshots[approval.targetSide]);
  // An assertion overlay must not replace the source evidence it purports to test.
  if(finding.evidence.some(ref=>ref.side===approval.targetSide&&harness.paths.includes(ref.path)))fail();
  const plan:ReproductionPlan={schemaVersion:'v1alpha1',id:approval.id,approval,finding,inputs:{base:digest(canonical(snapshots.base.files)),head:digest(canonical(snapshots.head.files))},assertionDigest:harness.revision,runner,limits:cap,definition:{suite,side:approval.targetSide,assertionSide:approval.assertionSide,runner:{runnerImage:runner.image},executionLimits:{engine:runner.engine,memoryMb:runner.memoryMb,cpus:runner.cpus,pids:runner.pids,maxTrials:cap.maxTrials}}};
  if(Buffer.byteLength(canonical(plan))>4*1024*1024)fail();
  return plan;
 }catch{return fail();}
}
/** Recheck stored metadata against the immutable evaluator inputs before trusting
 * a terminal observation. Hashes alone do not authenticate an approval writer. */
export function verifyReproductionUnit(plan:ReproductionPlan,unit:EvalUnit):void{
 try{
  const compiled=compileFindingReproduction(plan.finding,plan.approval,unit.inputs.base.snapshot,unit.inputs.head.snapshot,plan.runner,plan.limits);
  if(canonical(compiled)!==canonical(plan)||canonical(unit.definition)!==canonical(plan.definition))fail();
 }catch{fail();}
}
/** A structured assertion result, not process success or reviewer consensus,
 * determines the outcome. Pending/running work cannot become a receipt. */
export function reproductionReceipt(plan:ReproductionPlan,unit:EvalUnit):FindingReceipt{
 verifyReproductionUnit(plan,unit);
 if(!uuid(unit.id)||!uuid(unit.jobId))fail();
 let outcome:FindingReceipt['outcome']='error',reason='Reproduction was cancelled';
 if(unit.status==='cancelled'){
  if(unit.result||!unit.cancelRequested)fail();
 }else{
  if(unit.status!=='completed'||!unit.result)fail();
  let run;try{run=validateEvalRun(unit.result);}catch{fail();}
  const snapshot=unit.inputs[plan.approval.targetSide].snapshot,assertions=unit.inputs[plan.approval.assertionSide].snapshot;
  const expectedInput=projectEvalInputs(baselineHarness(plan.approval.suite,assertions,snapshot).snapshot).snapshot;
  if(run!.id!==unit.id||run!.subject.repository!==plan.finding.subject.repository||run!.subject.gitSha!==snapshot.sha||run!.subject.assertionGitSha!==assertions.sha||run!.subject.inputDigest!==digest(canonical(expectedInput.files))||run!.revision!==plan.assertionDigest||run!.suite!==plan.approval.suite.metadata.id||run!.runnerImage!==plan.runner.image||run!.runnerProvider||run!.model||run!.trials!==plan.approval.suite.spec.trials.count)fail();
  const scenario=run!.scenarios.find(s=>s.id===plan.approval.scenarioId);
  if(!scenario||run!.scenarios.length!==plan.approval.suite.spec.scenarios.length||run!.scenarios.some(s=>!plan.approval.suite.spec.scenarios.some(expected=>expected.id===s.id)))fail();
  const complete=scenario!.passed+scenario!.failed===run!.trials&&scenario!.errors===0&&scenario!.skipped===0;
  if(!complete||run!.status==='error'||run!.status==='insufficient'){reason='Reproduction did not produce complete valid observations';}
  else{
   const reproduced=scenario![plan.approval.reproducedStatus]===run!.trials;
   outcome=reproduced?'reproduced':'not-reproduced';reason=reproduced?'Approved assertion reproduced the exact finding':'Approved assertion did not reproduce the finding';
  }
 }
 // Completion and cancellation are fenced by the unit row: cancellation only
 // changes queued/running units. A later job-wide request cannot change a
 // completed unit's evidence or invalidate its retained receipt.
 const evidenceDigest=digest(canonical({planDigest:digest(canonical(plan)),unitId:unit.id,jobId:unit.jobId,status:unit.status,cancelRequested:unit.status==='cancelled',result:unit.result??null}));
 return {findingId:plan.finding.id,subjectDigest:digest(canonical(plan.finding.subject)),assertionDigest:plan.assertionDigest,evidenceDigest,actor:'reproduction',outcome,reason};
}
