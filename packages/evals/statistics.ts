import type { EvalStatus, EvalSuite, ScenarioResult } from './contracts.ts';
export interface TrialResult {
  status: 'passed'|'failed'|'error'|'skipped'; critical?: boolean;
  latencyMs?: number; costUsd?: number; totalTokens?: number;
}
export function wilsonInterval(passed:number,total:number,level:0.9|0.95|0.99=0.95):{lower:number;upper:number;level:number;method:'wilson'} {
  if(!Number.isSafeInteger(total)||total<1||!Number.isSafeInteger(passed)||passed<0||passed>total)throw new Error('Invalid statistical sample');
  const z={0.9:1.6448536269514722,0.95:1.959963984540054,0.99:2.5758293035489004}[level];
  if(!z)throw new Error('Unsupported confidence level');
  const p=passed/total,z2=z*z,denominator=1+z2/total;
  const center=(p+z2/(2*total))/denominator,half=z*Math.sqrt(p*(1-p)/total+z2/(4*total*total))/denominator;
  return {lower:Math.max(0,center-half),upper:Math.min(1,center+half),level,method:'wilson'};
}
export function aggregateScenario(suite:EvalSuite,id:string,trials:TrialResult[]):ScenarioResult {
  const scenario=suite.spec.scenarios.find(s=>s.id===id);if(!scenario)throw new Error('Unknown scenario');
  if(trials.length>suite.spec.trials.count)throw new Error('More results than configured trials');
  const counts={passed:0,failed:0,errors:0,skipped:0,criticalFailures:0};
  for(const trial of trials){
    if(!['passed','failed','error','skipped'].includes(trial.status))throw new Error('Invalid trial status');
    for(const [name,value] of Object.entries(trial))if(['latencyMs','costUsd','totalTokens'].includes(name)&&(typeof value!=='number'||!Number.isFinite(value)||value<0||(name==='totalTokens'&&!Number.isSafeInteger(value))))throw new Error('Invalid observed metric');
    if(trial.status==='error')counts.errors++;else counts[trial.status]++;
    if(trial.status==='failed'&&((scenario.critical??(suite.spec.class==='safety'))||trial.critical))counts.criticalFailures++;
  }
  const n=counts.passed+counts.failed,rate=n?1:undefined;
  const status:EvalStatus=counts.errors?'error':trials.length<suite.spec.trials.count||counts.skipped?'insufficient':
    (rate!==undefined&&rate>=suite.spec.trials.passRate&&counts.criticalFailures<=(suite.spec.trials.maxCriticalFailures??0))?'passed':'failed';
  const result:ScenarioResult={id,...counts,status};
  if(rate!==undefined){result.passRate=rate;result.confidenceInterval=wilsonInterval(counts.passed,n,suite.spec.trials.confidenceLevel??0.95);}
  // Partial/missing measurements remain absent instead of being invented as zero.
  if(trials.length&&trials.every(t=>t.latencyMs!==undefined)){const values=trials.map(t=>t.latencyMs!).sort((a,b)=>a-b);result.metrics={p95LatencyMs:values[Math.ceil(0.95*values.length)-1]!};}
  if(trials.length&&trials.every(t=>t.costUsd!==undefined))result.metrics={...result.metrics,avgCostUsd:trials.reduce((sum,t)=>sum+t.costUsd!,0)/trials.length};
  if(trials.length&&trials.every(t=>t.totalTokens!==undefined))result.metrics={...result.metrics,totalTokens:trials.reduce((sum,t)=>sum+t.totalTokens!,0)};
  return result;
}
export function combinedStatus(results:ScenarioResult[]):EvalStatus {
  if(!results.length)throw new Error('No scenario results');
  if(results.some(r=>r.status==='error'))return 'error';
  if(results.some(r=>r.status==='insufficient'))return 'insufficient';
  if(results.some(r=>r.status==='failed'))return 'failed';
  return 'passed';
}
