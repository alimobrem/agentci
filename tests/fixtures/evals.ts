import type { EvalSuite } from '../../packages/evals/contracts.ts';
export function evalSuite(overrides: Partial<EvalSuite['spec']> = {}, id='behavior'): EvalSuite {
  return {apiVersion:'agentci.io/v1alpha1',kind:'EvalSuite',metadata:{id},spec:{class:'golden',requirements:['REQ-001'],impact:{categories:['prompt'],include:['prompts/**']},runner:{adapter:'command',command:['node','check.mjs'],timeoutMs:1000},scenarios:[{id:'safe-response',critical:true}],trials:{count:20,passRate:0.95,confidenceMethod:'wilson'},...overrides}};
}
