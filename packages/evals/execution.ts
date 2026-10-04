import {randomUUID} from 'node:crypto';
import {validateEvalSuite,validateEvalRun,safeEvalPath,type EvalSuite,type EvalRun} from './contracts.ts';
import {runIsolated,validateRunnerPolicy,projectEvalInputs,protectedEvalInput,type RunnerPolicy,type RunnerResult,type EvalOwnership} from './runner.ts';
import {normalizeTrial} from './adapters.ts';
import {aggregateScenario,combinedStatus,type TrialResult} from './statistics.ts';
import type {Snapshot} from '../review/types.ts';
import {baselineHarness} from './harness.ts';
import {canonical,digest} from '../review/engine.ts';
import {runHttpTrial,validateHttpProvider} from './http.ts';

export interface TrialCheckpoint {results:Record<string,TrialResult>;diagnostic?:string}
const diagnostics=new Set(['timeout','cancelled','error','missing-exit-code','command-execution-error','missing-report','report-limit','promptfoo-execution-error','pytest-execution-error','adapter-not-implemented','invalid-report']);
export function validateTrialCheckpoint(suite:EvalSuite,value:unknown):TrialCheckpoint {
  const checkpoint=value as TrialCheckpoint;
  if(!checkpoint||typeof checkpoint!=='object'||Array.isArray(checkpoint)||Object.keys(checkpoint).some(k=>!['results','diagnostic'].includes(k))||!checkpoint.results||typeof checkpoint.results!=='object'||Array.isArray(checkpoint.results)||(checkpoint.diagnostic!==undefined&&!diagnostics.has(checkpoint.diagnostic)))throw new Error('Invalid trial checkpoint');
  if(Object.keys(checkpoint.results).length!==suite.spec.scenarios.length)throw new Error('Invalid checkpoint scenario coverage');
  for(const scenario of suite.spec.scenarios){
    const trial=Object.hasOwn(checkpoint.results,scenario.id)?checkpoint.results[scenario.id]:undefined;
    if(!trial||typeof trial!=='object'||Array.isArray(trial)||Object.keys(trial).some(k=>!['status','critical','latencyMs','costUsd','totalTokens'].includes(k))||!['passed','failed','error','skipped'].includes(trial.status)||(trial.critical!==undefined&&typeof trial.critical!=='boolean'))throw new Error('Invalid checkpoint scenario');
    for(const key of ['latencyMs','costUsd','totalTokens'] as const){const metric=trial[key];if(metric!==undefined&&(!Number.isFinite(metric)||typeof metric!=='number'||metric<0||(key==='totalTokens'&&!Number.isSafeInteger(metric))))throw new Error('Invalid checkpoint metric');}
  }
  if(checkpoint.diagnostic!==undefined&&Object.values(checkpoint.results).some(trial=>trial.status!=='error'))throw new Error('Checkpoint diagnostic contradicts outcomes');
  return structuredClone(checkpoint);
}
export interface ExecutionOptions {
  signal?:AbortSignal;model?:string;maxTrials?:number;assertionSnapshot?:Snapshot;
  runId?:string;priorOmittedInputs?:string[];
  ownership?:EvalOwnership;
  loadTrial?:(index:number)=>Promise<TrialCheckpoint|undefined>;
  saveTrial?:(index:number,checkpoint:TrialCheckpoint)=>Promise<void>;
}
type TrialExecutor=(snapshot:Snapshot,suite:EvalSuite,policy:RunnerPolicy,options:ExecutionOptions)=>Promise<RunnerResult>;
function httpProvider(suite:EvalSuite,policy:RunnerPolicy){
  const providerId=suite.spec.runner.adapter==='http'?suite.spec.runner.provider:undefined;
  const matches=policy.httpProviders?.filter(p=>p.id===providerId)??[];
  if(matches.length!==1)throw new Error('HTTP suite requires exactly one configured operator provider');
  validateHttpProvider(matches[0]!);return matches[0]!;
}
const executeTrial:TrialExecutor=async(snapshot,suite,policy,options)=>{
  if(suite.spec.runner.adapter!=='http')return runIsolated(snapshot,suite,policy,options);
  const result=await runHttpTrial(snapshot,suite,httpProvider(suite,policy),options);
  const failure=result.report===undefined?false:JSON.parse(result.report).results.some((row:{status?:string}|null)=>row?.status==='failed'||row?.status==='error');
  return {sourceSha:result.sourceSha,provider:result.provider,status:result.status,exitCode:result.status==='completed'?(failure?1:0):null,...(result.report===undefined?{}:{report:result.report}),...(result.error===undefined?{}:{error:result.error})};
};
/** Sequential, bounded trials. The default executor always uses the isolated container boundary. */
export async function executeSuite(repository:string,snapshot:Snapshot,value:EvalSuite,policy:RunnerPolicy,options:ExecutionOptions={},executor:TrialExecutor=executeTrial):Promise<EvalRun> {
  const suite=validateEvalSuite(value),maxTrials=options.maxTrials??100;
  if(options.runId!==undefined&&!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(options.runId))throw new Error('Invalid stable eval run UUID');
  validateRunnerPolicy(policy);
  const provider=suite.spec.runner.adapter==='http'?httpProvider(suite,policy):undefined;
  if(!Number.isSafeInteger(maxTrials)||maxTrials<1||maxTrials>1000||suite.spec.trials.count>maxTrials)throw new Error('Suite exceeds operator trial budget');
  if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)||!/^[a-f0-9]{40}$/.test(snapshot.sha))throw new Error('Exact repository/snapshot identity required');
  if(suite.spec.models?.length&&!options.model)throw new Error('Model matrix requires an explicit variant');
  if(options.model!==undefined&&!suite.spec.models?.includes(options.model))throw new Error('Unconfigured model variant');
  const assertions=options.assertionSnapshot??snapshot,harness=baselineHarness(suite,assertions,snapshot);
  const projected=projectEvalInputs(harness.snapshot);
  if(harness.paths.some(path=>projected.omitted.includes(path)))throw new Error('Baseline harness includes a protected input');
  const prior=options.priorOmittedInputs??[];
  if(prior.some(path=>!safeEvalPath(path)||!protectedEvalInput(path)||Object.hasOwn(projected.snapshot.files,path)))throw new Error('Invalid prior protected-input provenance');
  const omittedInputs=[...new Set([...prior,...projected.omitted])].sort();
  const observations:Record<string,TrialResult[]>=Object.fromEntries(suite.spec.scenarios.map(s=>[s.id,[]]));
  for(let trial=0;trial<suite.spec.trials.count;trial++){
    if(options.signal?.aborted)break;
    let normalized=await options.loadTrial?.(trial),cancelled=false;
    if(!normalized){
      const result=await executor(projected.snapshot,suite,policy,options);
      if(result.sourceSha!==snapshot.sha||(provider?(result.image!==undefined||result.provider?.id!==provider.id||result.provider?.revision!==provider.revision):(result.image!==policy.image||result.provider!==undefined)))throw new Error('Runner result identity mismatch');
      const value=normalizeTrial(suite,result);normalized={results:value.results,...(value.error===undefined?{}:{diagnostic:value.error})};cancelled=result.status==='cancelled';
      normalized=validateTrialCheckpoint(suite,normalized);
      if(!cancelled)await options.saveTrial?.(trial,normalized);
    }
    normalized=validateTrialCheckpoint(suite,normalized);
    for(const scenario of suite.spec.scenarios)observations[scenario.id]!.push(normalized.results[scenario.id]!);
    // Cancellation ends scheduling; missing observations remain insufficient, never successful.
    if(cancelled)break;
  }
  const scenarios=suite.spec.scenarios.map(s=>aggregateScenario(suite,s.id,observations[s.id]!));
  return validateEvalRun({apiVersion:'agentci.io/v1alpha1',kind:'EvalRun',id:options.runId??randomUUID(),suite:suite.metadata.id,revision:harness.revision,subject:{repository,gitSha:snapshot.sha,assertionGitSha:assertions.sha,inputDigest:digest(canonical(projected.snapshot.files)),omittedInputs},...(provider?{runnerProvider:{id:provider.id,revision:provider.revision}}:{runnerImage:policy.image}),...(options.model===undefined?{}:{model:options.model}),trials:suite.spec.trials.count,status:combinedStatus(scenarios),scenarios,artifacts:[]});
}
export interface BehavioralDelta {scenario:string;baseStatus:string;headStatus:string;passRateDelta?:number;regression:boolean;criticalFailureDelta:number}
export function compareRuns(baseValue:EvalRun,headValue:EvalRun):{base:EvalRun;head:EvalRun;deltas:BehavioralDelta[];regressions:string[]} {
  const base=validateEvalRun(baseValue),head=validateEvalRun(headValue);
  if(base.subject.repository!==head.subject.repository||base.subject.gitSha===head.subject.gitSha||base.subject.assertionGitSha!==head.subject.assertionGitSha||base.runnerImage!==head.runnerImage||canonical(base.runnerProvider??null)!==canonical(head.runnerProvider??null)||base.suite!==head.suite||base.revision!==head.revision||base.trials!==head.trials||base.model!==head.model)throw new Error('Comparison requires exact base/head identities and the same baseline suite configuration');
  if(base.scenarios.length!==head.scenarios.length||base.scenarios.some(s=>!head.scenarios.some(h=>h.id===s.id)))throw new Error('Comparison scenario coverage mismatch');
  const deltas=base.scenarios.map(b=>{
    const h=head.scenarios.find(s=>s.id===b.id)!;
    const passRateDelta=b.passRate===undefined||h.passRate===undefined?undefined:h.passRate-b.passRate;
    // Infrastructure/insufficient outcomes remain visible without being mislabeled behavioral regressions.
    const behavioral=['passed','failed'].includes(b.status)&&['passed','failed'].includes(h.status);
    return {scenario:b.id,baseStatus:b.status,headStatus:h.status,...(passRateDelta===undefined?{}:{passRateDelta}),criticalFailureDelta:h.criticalFailures-b.criticalFailures,regression:behavioral&&((b.status==='passed'&&h.status==='failed')||(passRateDelta??0)<0||h.criticalFailures>b.criticalFailures)};
  });
  return {base,head,deltas,regressions:deltas.filter(d=>d.regression).map(d=>d.scenario)};
}
/** Use the baseline definition for BOTH subjects; head manifests cannot remove assertions. */
export async function executeComparison(repository:string,base:Snapshot,head:Snapshot,baselineSuite:EvalSuite,policy:RunnerPolicy,options:ExecutionOptions={},executor:TrialExecutor=executeTrial) {
  if(options.runId||options.loadTrial||options.saveTrial||options.ownership)throw new Error('Durable execution requires a separate context for each eval unit');
  if(base.sha===head.sha)throw new Error('Distinct base and head commits required');
  const shared={...options,assertionSnapshot:base};
  const baseRun=await executeSuite(repository,base,baselineSuite,policy,shared,executor);
  const headRun=await executeSuite(repository,head,baselineSuite,policy,shared,executor);
  return compareRuns(baseRun,headRun);
}
export async function executeModelMatrix(repository:string,base:Snapshot,head:Snapshot,value:EvalSuite,policy:RunnerPolicy,options:Omit<ExecutionOptions,'model'>&{maxTotalTrials?:number}={},executor:TrialExecutor=executeTrial) {
  const suite=validateEvalSuite(value),variants=suite.spec.models??[undefined],budget=options.maxTotalTrials??200;
  if(!Number.isSafeInteger(budget)||budget<1||budget>64000||variants.length*suite.spec.trials.count*2>budget)throw new Error('Model matrix exceeds operator total trial budget');
  const comparisons:Awaited<ReturnType<typeof executeComparison>>[]=[];
  for(const model of variants){
    if(options.signal?.aborted)break;
    comparisons.push(await executeComparison(repository,base,head,suite,policy,{...options,...(model===undefined?{}:{model})},executor));
  }
  return {comparisons,expectedVariants:variants.length,completedVariants:comparisons.length,complete:comparisons.length===variants.length&&!options.signal?.aborted};
}
