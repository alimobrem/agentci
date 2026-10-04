import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {Ajv} from 'ajv';
import type {FormatsPlugin} from 'ajv-formats';
import {canonical,digest} from '../review/engine.ts';
import {validateEvalRun,type EvalRun} from './contracts.ts';
import {compareRuns,type BehavioralDelta} from './execution.ts';
import type {SuiteChange} from './plan.ts';

export interface ComparisonUnit {
  id:string;suite:string;revision:string;side:'base'|'head';assertionSide:'base'|'head';model?:string;
  trials:number;passRate:number;maxCriticalFailures:number;scenarioIds:string[];runnerImage?:string;runnerProvider?:{id:string;revision:string};
  status:'queued'|'running'|'completed'|'cancelled';result?:EvalRun;
}
export interface ComparisonSummary {
  state:'queued'|'running'|'completed'|'cancelled';outcome:'pending'|'passed'|'failed'|'error'|'insufficient'|'no-evals';
  executionGaps:string[];
  comparisons:{suite:string;model?:string;baseRunId:string;headRunId:string;deltas:BehavioralDelta[];regressions:string[]}[];
}
export interface EvalComparison {
  apiVersion:'agentci.io/v1alpha1';kind:'EvalComparison';id:string;reviewId:string;attemptId:string;organizationId:string;
  subject:{repository:string;pullRequest:number;baseSha:string;headSha:string};cancelRequested:boolean;
  units:ComparisonUnit[];suiteChanges:SuiteChange[];coverageGaps:string[];selectionGaps:string[];summary:ComparisonSummary;
}
export type ComparisonInput=Omit<EvalComparison,'apiVersion'|'kind'|'summary'>;
export interface ComparisonRecord {id:string;digest:string;comparison:EvalComparison}
const ajv=new Ajv({strict:true,allErrors:true});
(createRequire(import.meta.url)('ajv-formats') as FormatsPlugin)(ajv);
const shape=ajv.compile(JSON.parse(readFileSync(new URL('./json/eval-comparison.schema.json',import.meta.url),'utf8')));
const key=(unit:ComparisonUnit)=>JSON.stringify([unit.suite,unit.model??null]);
function summarize(input:ComparisonInput):ComparisonSummary {
  if(input.subject.baseSha===input.subject.headSha)throw new Error('Distinct comparison commits required');
  if(new Set(input.suiteChanges.map(c=>c.suite)).size!==input.suiteChanges.length)throw new Error('Duplicate suite change');
  for(const change of input.suiteChanges){
    if(change.kind==='added'?change.baseRevision!==undefined||change.headRevision===undefined:change.kind==='removed'?change.baseRevision===undefined||change.headRevision!==undefined:change.baseRevision===undefined||change.headRevision===undefined||change.baseRevision===change.headRevision)throw new Error('Suite change provenance mismatch');
  }
  if(new Set(input.units.map(u=>u.id)).size!==input.units.length||new Set(input.units.map(u=>JSON.stringify([key(u),u.side]))).size!==input.units.length)throw new Error('Duplicate comparison unit');
  const executionGaps:string[]=[],comparisons:ComparisonSummary['comparisons']=[];
  for(const change of input.suiteChanges)if(!input.units.some(u=>u.suite===change.suite))executionGaps.push(`missing-suite-unit:${change.suite}`);
  for(const unit of input.units){
    if(unit.maxCriticalFailures>unit.trials)throw new Error('Invalid planned critical threshold');
    if(unit.assertionSide==='head'&&(unit.side!=='head'||!input.suiteChanges.some(c=>c.suite===unit.suite&&c.kind==='added')))throw new Error('Head assertions require an explicit added suite');
    if((unit.status==='completed')!==(unit.result!==undefined))throw new Error('Completion requires exactly one retained result');
    if(unit.result){
      const run=validateEvalRun(unit.result);
      if(run.id!==unit.id||run.suite!==unit.suite||run.revision!==unit.revision||run.model!==unit.model||run.trials!==unit.trials||run.subject.repository!==input.subject.repository||run.subject.gitSha!==input.subject[unit.side==='base'?'baseSha':'headSha']||run.subject.assertionGitSha!==input.subject[unit.assertionSide==='base'?'baseSha':'headSha']||run.runnerImage!==unit.runnerImage||canonical(run.runnerProvider??null)!==canonical(unit.runnerProvider??null)||canonical(run.scenarios.map(s=>s.id).sort())!==canonical([...unit.scenarioIds].sort()))throw new Error('Comparison unit provenance mismatch');
      for(const scenario of run.scenarios){
        const count=scenario.passed+scenario.failed+scenario.errors+scenario.skipped,n=scenario.passed+scenario.failed;
        const expected=scenario.errors?'error':count<unit.trials||scenario.skipped?'insufficient':n&&scenario.passed/n>=unit.passRate&&scenario.criticalFailures<=unit.maxCriticalFailures?'passed':'failed';
        if(scenario.status!==expected)throw new Error('Result contradicts planned trial thresholds');
      }
    }
    if(unit.status==='cancelled')executionGaps.push(`cancelled-unit:${unit.id}`);
  }
  for(const unit of input.units.filter(u=>u.assertionSide==='base')){
    const other=input.units.find(u=>key(u)===key(unit)&&u.side!==unit.side&&u.assertionSide==='base');
    if(!other){executionGaps.push(`missing-${unit.side==='base'?'head':'base'}-unit:${unit.suite}${unit.model===undefined?'':':'+unit.model}`);continue;}
    if(unit.revision!==other.revision||unit.trials!==other.trials||unit.passRate!==other.passRate||unit.maxCriticalFailures!==other.maxCriticalFailures||canonical([...unit.scenarioIds].sort())!==canonical([...other.scenarioIds].sort())||unit.runnerImage!==other.runnerImage||canonical(unit.runnerProvider??null)!==canonical(other.runnerProvider??null))throw new Error('Comparison plan provenance mismatch');
    if(unit.side==='base'&&unit.result&&other.result){
      const result=compareRuns(unit.result,other.result);
      comparisons.push({suite:unit.suite,...(unit.model===undefined?{}:{model:unit.model}),baseRunId:unit.id,headRunId:other.id,deltas:result.deltas,regressions:result.regressions});
    }
  }
  const state:ComparisonSummary['state']=input.cancelRequested||input.units.some(u=>u.status==='cancelled')?'cancelled':input.units.some(u=>u.status==='running')?'running':input.units.some(u=>u.status==='queued')?'queued':'completed';
  const runs=input.units.flatMap(u=>u.result?[u.result]:[]);
  const outcome:ComparisonSummary['outcome']=state==='cancelled'?'insufficient':state!=='completed'?'pending':runs.some(r=>r.status==='error')?'error':input.coverageGaps.length||input.selectionGaps.length||executionGaps.length||runs.some(r=>r.status==='insufficient')?'insufficient':!input.units.length?'no-evals':runs.some(r=>r.status==='failed')||comparisons.some(c=>c.regressions.length)?'failed':'passed';
  return {state,outcome,executionGaps:[...new Set(executionGaps)].sort(),comparisons:comparisons.sort((a,b)=>JSON.stringify([a.suite,a.model??null]).localeCompare(JSON.stringify([b.suite,b.model??null])))};
}
export function createEvalComparison(input:ComparisonInput):EvalComparison {
  const value={...structuredClone(input),apiVersion:'agentci.io/v1alpha1',kind:'EvalComparison',summary:{state:'queued',outcome:'pending',executionGaps:[],comparisons:[]}};
  if(!shape(value))throw new Error('Invalid EvalComparison contract');
  return {...value,summary:summarize(input)} as EvalComparison;
}
export function validateEvalComparison(value:unknown):EvalComparison {
  if(!shape(value))throw new Error('Invalid EvalComparison contract');
  const comparison=value as EvalComparison;
  if(canonical(comparison.summary)!==canonical(summarize(comparison)))throw new Error('Comparison summary contradicts retained evidence');
  return structuredClone(comparison);
}
export function comparisonRecord(value:EvalComparison):ComparisonRecord {
  const comparison=validateEvalComparison(value);return {id:comparison.id,digest:digest(canonical(comparison)),comparison};
}
export function validateComparisonRecord(value:unknown):ComparisonRecord {
  const record=value as ComparisonRecord;
  if(!record||typeof record!=='object'||Object.keys(record).sort().join(',')!=='comparison,digest,id')throw new Error('Invalid comparison record');
  const comparison=validateEvalComparison(record.comparison);
  if(record.id!==comparison.id||record.digest!==digest(canonical(comparison)))throw new Error('Comparison record identity or digest mismatch');
  return structuredClone(record);
}
