import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { EvalSuite } from './contracts.ts';
import type { RunnerResult } from './runner.ts';
import type { TrialResult } from './statistics.ts';

export function adapterCommand(suite:EvalSuite):string[] {
  const args=[...suite.spec.runner.command];
  if(suite.spec.runner.adapter==='pytest'){
    if(args.some(arg=>/^--junit(?:xml|-xml)(?:=|$)/.test(arg)||arg.includes('junit_family')))throw new Error('Pytest report configuration is managed by the adapter');
    args.push(`--junitxml=/workspace/${suite.spec.runner.report}`,'-o','junit_family=xunit2');
  }
  return args;
}
type Normalized={results:Record<string,TrialResult>;error?:string};
const list=(value:unknown):Record<string,unknown>[]=>value===undefined?[]:(Array.isArray(value)?value:[value]) as Record<string,unknown>[];
/** Report content is untrusted. Failure to account for every declared assertion is an error. */
export function normalizeTrial(suite:EvalSuite,run:RunnerResult):Normalized {
  const fail=(error:string):Normalized=>({results:Object.fromEntries(suite.spec.scenarios.map(s=>[s.id,{status:'error'}])),error});
  if(run.status!=='completed')return fail(run.status);
  if(run.exitCode===null)return fail('missing-exit-code');
  if(suite.spec.runner.adapter==='command')return [0,1].includes(run.exitCode)?{results:{[suite.spec.scenarios[0]!.id]:{status:run.exitCode===0?'passed':'failed',latencyMs:run.latencyMs}}}:fail('command-execution-error');
  if(run.reportError||run.report===undefined)return fail('missing-report');
  if(Buffer.byteLength(run.report)>(suite.spec.runner.maxOutputBytes??1048576))return fail('report-limit');
  try{
    const results:Record<string,TrialResult>={};
    if(suite.spec.runner.adapter==='native'){
      const report=JSON.parse(run.report);
      if(!report||report.schemaVersion!=='v1alpha1'||Object.keys(report).some(k=>!['schemaVersion','results'].includes(k))||!Array.isArray(report.results))throw Error('native schema');
      for(const row of report.results){
        if(!row||Object.keys(row).some(k=>!['scenario','status','critical','latencyMs','costUsd','totalTokens'].includes(k))||typeof row.scenario!=='string'||!suite.spec.scenarios.some(s=>s.id===row.scenario)||Object.hasOwn(results,row.scenario)||!['passed','failed','error','skipped'].includes(row.status))throw Error('native result');
        if(row.critical!==undefined&&typeof row.critical!=='boolean')throw Error('critical');
        for(const key of ['latencyMs','costUsd','totalTokens'])if(row[key]!==undefined&&(typeof row[key]!=='number'||!Number.isFinite(row[key])||row[key]<0||(key==='totalTokens'&&!Number.isSafeInteger(row[key]))))throw Error('metric');
        const {scenario,...trial}=row;results[scenario]=trial;
      }
    }else if(suite.spec.runner.adapter==='pytest'){
      if(![0,1].includes(run.exitCode))return fail('pytest-execution-error');
      if(/<!\s*(?:DOCTYPE|ENTITY)/i.test(run.report)||XMLValidator.validate(run.report)!==true)throw Error('unsafe xml');
      const xml=new XMLParser({ignoreAttributes:false,processEntities:false,parseAttributeValue:false,parseTagValue:false}).parse(run.report);
      if(Object.keys(xml).some(k=>!['testsuites','testsuite','?xml'].includes(k))||!!xml.testsuites===!!xml.testsuite)throw Error('xml root');
      const suites=list(xml.testsuite??xml.testsuites?.testsuite);
      if(!suites.length)throw Error('no tests');
      const walk=(nodes:Record<string,unknown>[])=>{
        for(const node of nodes){
          for(const row of list(node.testcase)){
            const selector=`${row['@_classname']}.${row['@_name']}`;
            const scenario=suite.spec.scenarios.find(s=>(s.selector??s.id)===selector);
            if(!scenario||Object.hasOwn(results,scenario.id))throw Error('unmapped test');
            const time=row['@_time'],latencyMs=time===undefined?undefined:Number(time)*1000;
            if(latencyMs!==undefined&&(!Number.isFinite(latencyMs)||latencyMs<0))throw Error('time');
            const statuses=['error','failure','skipped'].filter(k=>Object.hasOwn(row,k));
            if(statuses.length>1)throw Error('conflicting outcome');
            results[scenario.id]={status:statuses[0]==='error'?'error':statuses[0]==='failure'?'failed':statuses[0]==='skipped'?'skipped':'passed',...(latencyMs===undefined?{}:{latencyMs})};
          }
          if(node.testsuite!==undefined)walk(list(node.testsuite));
        }
      };walk(suites);
    }else return fail('adapter-not-implemented');
    if(Object.keys(results).length!==suite.spec.scenarios.length)throw Error('missing scenario');
    const failure=Object.values(results).some(r=>r.status==='failed'||r.status==='error');
    if(![0,1].includes(run.exitCode)||(run.exitCode===0&&failure)||(run.exitCode===1&&!failure))throw Error('exit/report mismatch');
    return {results};
  }catch{return fail('invalid-report');}
}
