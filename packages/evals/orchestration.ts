import {validateRunnerPolicy} from './runner.ts';
import {suiteCatalog} from './plan.ts';
import {suiteRevision,validateEvalSuite} from './contracts.ts';
import type {planComparison} from './plan.ts';
import type {Snapshot} from '../review/types.ts';
import type {EvalUnitDefinition} from '../storage/evals.ts';
export interface EvalPlanPolicy {
  image:string;enginesImage?:string;providers:{id:string;revision:string}[];maxUnits:number;maxTotalTrials:number;
}
export class EvalPlanConfigurationError extends Error {}
export function controllerEvalPolicy(env:NodeJS.ProcessEnv=process.env):EvalPlanPolicy{
  try{
    const image=env.AGENTCI_EVAL_RUNNER_IMAGE??'',enginesImage=env.AGENTCI_EVAL_ENGINES_IMAGE;
    validateRunnerPolicy({image});if(enginesImage)validateRunnerPolicy({image:enginesImage});
    const raw=env.AGENTCI_EVAL_PROVIDER_IDENTITIES??'[]';if(Buffer.byteLength(raw)>65536)throw new Error();
    const providers=JSON.parse(raw);
    if(!Array.isArray(providers)||providers.length>32||providers.some(p=>!p||typeof p!=='object'||Object.keys(p).sort().join(',')!=='id,revision'||typeof p.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(p.id)||typeof p.revision!=='string'||!/^sha256:[a-f0-9]{64}$/.test(p.revision))||new Set(providers.map(p=>p.id)).size!==providers.length)throw new Error();
    const maxUnits=Number(env.AGENTCI_EVAL_MAX_UNITS??128),maxTotalTrials=Number(env.AGENTCI_EVAL_MAX_TOTAL_TRIALS??2000);
    if(!Number.isSafeInteger(maxUnits)||maxUnits<1||maxUnits>512||!Number.isSafeInteger(maxTotalTrials)||maxTotalTrials<1||maxTotalTrials>100000)throw new Error();
    return {image,...(enginesImage?{enginesImage}:{}),providers,maxUnits,maxTotalTrials};
  }catch{throw new EvalPlanConfigurationError('Invalid operator eval provenance or budget');}
}
/** No execution here: reviewed manifests choose adapters, never image pins, access credentials or privileges. */
export function compileEvalUnits(plan:ReturnType<typeof planComparison>,base:Snapshot,head:Snapshot,policy:EvalPlanPolicy):EvalUnitDefinition[]{
  try{
    const checked=controllerEvalPolicy({AGENTCI_EVAL_RUNNER_IMAGE:policy.image,...(policy.enginesImage?{AGENTCI_EVAL_ENGINES_IMAGE:policy.enginesImage}:{}),AGENTCI_EVAL_PROVIDER_IDENTITIES:JSON.stringify(policy.providers),AGENTCI_EVAL_MAX_UNITS:String(policy.maxUnits),AGENTCI_EVAL_MAX_TOTAL_TRIALS:String(policy.maxTotalTrials)});
    if(plan.baseSha!==base.sha||plan.headSha!==head.sha||base.sha===head.sha)throw new Error();
    const before=new Map(suiteCatalog(base).map(e=>[e.suite.metadata.id,e.suite])),after=new Map(suiteCatalog(head).map(e=>[e.suite.metadata.id,e.suite]));
    const units:EvalUnitDefinition[]=[];let trials=0;
    for(const value of plan.suites){
      const suite=validateEvalSuite(value),existing=before.has(suite.metadata.id),reference=existing?before.get(suite.metadata.id):after.get(suite.metadata.id);
      if(!reference||suiteRevision(suite)!==suiteRevision(reference)||(!existing&&!plan.suiteChanges.some(c=>c.suite===suite.metadata.id&&c.kind==='added')))throw new Error();
      const configuredRunner=suite.spec.runner,adapter=configuredRunner.adapter,provider=configuredRunner.adapter==='http'?checked.providers.find(p=>p.id===configuredRunner.provider):undefined;
      if(adapter==='http'&&!provider||['promptfoo','deepeval'].includes(adapter)&&!checked.enginesImage)throw new Error();
      const runner=provider?{runnerProvider:{...provider}}:{runnerImage:['promptfoo','deepeval'].includes(adapter)?checked.enginesImage!:checked.image};
      for(const model of suite.spec.models??[undefined])for(const side of existing?['base','head'] as const:['head'] as const){
        trials+=suite.spec.trials.count;if(trials>checked.maxTotalTrials||units.length>=checked.maxUnits)throw new Error();
        units.push({suite,side,assertionSide:existing?'base':'head',...(model===undefined?{}:{model}),runner});
      }
    }
    return units;
  }catch{throw new EvalPlanConfigurationError('Eval plan exceeds operator budget or immutable provenance');}
}
