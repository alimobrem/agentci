import {readFile,stat} from 'node:fs/promises';
import {validateRunnerPolicy,containerEngine,type RunnerPolicy} from '../../packages/evals/runner.ts';
import {validateHttpProvider,type HttpProviderPolicy} from '../../packages/evals/http.ts';
/** Deliberately independent of the controller runtime configuration and its App credentials. */
export async function evalWorkerConfig(env:NodeJS.ProcessEnv=process.env){
  const forbidden=['DATABASE_URL','GITHUB_APP_ID','GITHUB_INSTALLATION_ID','GITHUB_WEBHOOK_SECRET','GITHUB_PRIVATE_KEY_FILE','AGENTCI_APP_PRIVATE_KEY','AGENTCI_EVIDENCE_TOKEN','GITHUB_TOKEN','GH_TOKEN','GH_PAT'];
  if(forbidden.some(key=>env[key]!==undefined))throw new Error('Eval worker must not receive controller/GitHub credentials');
  const required=(key:string)=>{if(!env[key])throw new Error(`Missing ${key}`);return env[key]!;};
  const repository=required('AGENTCI_REPOSITORY'),organizationId=required('AGENTCI_ORGANIZATION_ID');
  if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(organizationId))throw new Error('Invalid eval deployment scope');
  const databaseUrl=required('AGENTCI_EVAL_DATABASE_URL');
  let url:URL;try{url=new URL(databaseUrl);}catch{throw new Error('Invalid eval database URL');}
  if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||url.hash)throw new Error('Invalid eval database URL');
  const engine=containerEngine(env.AGENTCI_CONTAINER_ENGINE??'docker');
  const image=required('AGENTCI_EVAL_RUNNER_IMAGE'),enginesImage=env.AGENTCI_EVAL_ENGINES_IMAGE;
  validateRunnerPolicy({image});if(enginesImage)validateRunnerPolicy({image:enginesImage});
  let providers:HttpProviderPolicy[]=[];
  if(env.AGENTCI_EVAL_PROVIDERS_FILE){
    const metadata=await stat(env.AGENTCI_EVAL_PROVIDERS_FILE);
    if(!metadata.isFile()||metadata.size>1024*1024||(metadata.mode&0o077))throw new Error('Provider configuration must be a private bounded file');
    try{providers=JSON.parse(await readFile(env.AGENTCI_EVAL_PROVIDERS_FILE,'utf8'));}catch{throw new Error('Invalid operator provider configuration');}
    if(!Array.isArray(providers)||providers.length>32)throw new Error('Invalid operator provider count');
    for(const provider of providers){validateHttpProvider(provider);if(provider.allowInsecureLoopbackForTests)throw new Error('Eval worker providers require HTTPS');}
    if(new Set(providers.map(p=>p.id)).size!==providers.length)throw new Error('Duplicate operator provider ID');
  }
  const policyFor=(adapter:string):RunnerPolicy=>{
    if(['promptfoo','deepeval'].includes(adapter)&&!enginesImage)throw new Error('Optional engine runner is not configured');
    return {engine,image:['promptfoo','deepeval'].includes(adapter)?enginesImage!:image,httpProviders:providers};
  };
  return {repository,organizationId,databaseUrl,temporalAddress:required('TEMPORAL_ADDRESS'),namespace:env.TEMPORAL_NAMESPACE??'default',taskQueue:'agentci-eval-v1',policyFor};
}
