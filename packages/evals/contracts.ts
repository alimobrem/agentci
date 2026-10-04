import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Ajv, type ValidateFunction } from 'ajv';
import { minimatch } from 'minimatch';
import type { FormatsPlugin } from 'ajv-formats';
import { canonical, digest } from '../review/engine.ts';
export const evalClasses = ['unit','integration','contract','policy','golden','regression','adversarial','safety','tool-use','trajectory','latency','cost','model-comparison'] as const;
export type EvalClass = typeof evalClasses[number];
export type EvalStatus = 'passed' | 'failed' | 'error' | 'insufficient';
export interface EvalSuite {
  apiVersion: 'agentci.io/v1alpha1'; kind: 'EvalSuite'; metadata: { id: string; description?: string };
  spec: {
    class: EvalClass; requirements: string[];
    impact: { categories: string[]; include: string[] };
    runner: { adapter: 'command'|'native'|'pytest'|'promptfoo'|'deepeval'|'http'; command: string[]; report?: string; harness?: string[]; timeoutMs: number; maxOutputBytes?: number };
    scenarios: { id: string; critical?: boolean; selector?: string }[];
    trials: { count: number; passRate: number; maxCriticalFailures?: number; confidenceMethod: 'wilson'; confidenceLevel?: 0.9|0.95|0.99 };
    models?: string[]; representative?: boolean;
  };
}
export interface ScenarioResult {
  id: string; passed: number; failed: number; errors: number; skipped: number; criticalFailures: number; status: EvalStatus;
  passRate?: number; confidenceInterval?: { lower: number; upper: number; level: number; method: 'wilson' };
  metrics?: { p95LatencyMs?: number; avgCostUsd?: number; totalTokens?: number };
}
export interface EvalRun {
  apiVersion:'agentci.io/v1alpha1'; kind:'EvalRun'; id:string; suite:string; revision:string;
  subject:{repository:string;gitSha:string;assertionGitSha:string;inputDigest:string;omittedInputs:string[]}; runnerImage:string; model?:string; trials:number; status:EvalStatus;
  scenarios:ScenarioResult[]; artifacts:{digest:string;mediaType:string;uri:string}[];
}
const ajv = new Ajv({strict:true,allErrors:true});
(createRequire(import.meta.url)('ajv-formats') as FormatsPlugin)(ajv);
const validators = Object.fromEntries(['eval-suite','eval-run'].map(name=>[name,ajv.compile(JSON.parse(readFileSync(new URL(`./json/${name}.schema.json`,import.meta.url),'utf8')))])) as Record<string,ValidateFunction>;
export function safeEvalPath(value:string, glob=false):boolean {
  return !!value && !value.startsWith('/') && !value.startsWith('!') && !value.includes('\\') && !/[\x00-\x1f]/.test(value) && !value.split('/').some(part=>part==='..'||part==='.'||part==='') && !/^[A-Za-z]:/.test(value) && (glob || !/[*?{}[\]]/.test(value));
}
export function validateEvalSuite(value:unknown):EvalSuite {
  if (!validators['eval-suite']!(value)) throw new Error('Invalid EvalSuite contract');
  const suite=value as EvalSuite, spec=suite.spec;
  if (new Set(spec.scenarios.map(s=>s.id)).size!==spec.scenarios.length) throw new Error('Duplicate scenario identity');
  const selectors=spec.scenarios.map(s=>s.selector??s.id);
  if(new Set(selectors).size!==selectors.length)throw new Error('Duplicate scenario selector');
  if(spec.runner.command.some(arg=>arg.includes('\0'))||Buffer.byteLength(JSON.stringify(spec.runner.command))>65536)throw new Error('Invalid runner arguments');
  if (spec.impact.include.some(p=>!safeEvalPath(p,true))) throw new Error('Unsafe impact selector');
  if(spec.runner.harness?.some(path=>!safeEvalPath(path)))throw new Error('Unsafe harness input path');
  if (spec.runner.report && !safeEvalPath(spec.runner.report)) throw new Error('Unsafe result report path');
  if (['native','pytest','promptfoo','deepeval','http'].includes(spec.runner.adapter) && !spec.runner.report) throw new Error('Adapter requires a structured result report');
  if (spec.runner.adapter==='command' && spec.scenarios.length!==1) throw new Error('Exit-code adapter requires exactly one scenario');
  if (spec.class==='safety' && (spec.trials.maxCriticalFailures??0)!==0) throw new Error('Safety suite cannot tolerate critical failures');
  if (spec.trials.maxCriticalFailures!==undefined && spec.trials.maxCriticalFailures>spec.trials.count) throw new Error('Critical threshold exceeds trials');
  return structuredClone(suite);
}
export function suiteRevision(suite:EvalSuite):string { return digest(canonical(validateEvalSuite(suite))); }
export function validateEvalRun(value:unknown):EvalRun {
  if(!validators['eval-run']!(value)) throw new Error('Invalid EvalRun contract');
  const run=value as EvalRun;
  if(new Set(run.scenarios.map(s=>s.id)).size!==run.scenarios.length) throw new Error('Duplicate result scenario');
  for(const result of run.scenarios){
    const attempts=result.passed+result.failed+result.errors+result.skipped;
    if(attempts>run.trials || result.criticalFailures>result.failed || (result.confidenceInterval && result.confidenceInterval.lower>result.confidenceInterval.upper)) throw new Error('Inconsistent result counts or interval');
    if(result.errors && result.status!=='error') throw new Error('Infrastructure errors cannot be behavioral results');
    if(result.passRate!==undefined && (result.passed+result.failed===0 || Math.abs(result.passRate-result.passed/(result.passed+result.failed))>1e-12)) throw new Error('Inconsistent observed pass rate');
    if(result.status==='passed'&&(result.errors||result.skipped||attempts!==run.trials)) throw new Error('Incomplete execution cannot pass');
  }
  const expected=run.scenarios.some(s=>s.status==='error')?'error':run.scenarios.some(s=>s.status==='insufficient')?'insufficient':run.scenarios.some(s=>s.status==='failed')?'failed':'passed';
  if(run.status!==expected) throw new Error('Aggregate status contradicts scenario outcomes');
  return structuredClone(run);
}
export interface ChangeImpact { changes:{path:string;categories:string[]}[]; requirementIds:string[] }
export function selectSuites(values:unknown[],impact:ChangeImpact):{suites:EvalSuite[];coverageGaps:string[];selectionGaps:string[]} {
  const suites=values.map(validateEvalSuite);
  if(new Set(suites.map(s=>s.metadata.id)).size!==suites.length) throw new Error('Duplicate suite identity');
  if(impact.changes.some(c=>!safeEvalPath(c.path))) throw new Error('Unsafe changed path');
  const categories=new Set(impact.changes.flatMap(c=>c.categories)), reqs=new Set(impact.requirementIds);
  const selected=suites.filter(({spec})=>{
    const mapped=spec.requirements.some(r=>reqs.has(r));
    const explicit=impact.changes.some(c=>spec.impact.categories.some(v=>c.categories.includes(v))||spec.impact.include.some(p=>minimatch(c.path,p,{dot:true,nonegate:true,nocomment:true})));
    return categories.has('eval') || explicit || ((categories.has('specification')||categories.has('requirement'))&&mapped) || (categories.has('tool')&&['contract','tool-use'].includes(spec.class)) ||
      (categories.has('model')&&spec.representative===true) ||
      ((categories.has('permission')||categories.has('policy'))&&['policy','adversarial','safety'].includes(spec.class)) ||
      (['source','dependency','api','data-schema','deployment'].some(c=>categories.has(c))&&(['unit','integration','regression'].includes(spec.class)||mapped));
  }).sort((a,b)=>a.metadata.id.localeCompare(b.metadata.id));
  const selectionGaps:string[]=[];
  if(categories.has('model')){
    const representative=selected.filter(s=>s.spec.representative);
    if(!representative.length)selectionGaps.push('missing-representative-suite');
    for(const suite of representative)if(!suite.spec.models?.length)selectionGaps.push(`missing-model-matrix:${suite.metadata.id}`);
  }
  return {suites:selected,coverageGaps:[...reqs].filter(r=>!selected.some(s=>s.spec.requirements.includes(r))).sort(),selectionGaps:selectionGaps.sort()};
}
