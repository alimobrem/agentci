import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
// @ts-ignore Trusted temporary customer runtime supervisor.
import {customerRuntimeEnvironment,CustomerRuntimeProcesses} from '../scripts/lib/customer-runtime-processes.mjs';

const runnerImage='ghcr.io/alimobrem/agentci/eval-runner@sha256:'+'a'.repeat(64);
test('customer worker receives explicit policy and Check opt-in without widening other role credentials',()=>{
 const values={PATH:process.env.PATH,HOME:'/tmp',AGENTCI_EVAL_RUNNER_IMAGE:runnerImage,AGENTCI_MODEL_REVIEW_CHECKS:'true',DATABASE_URL:'postgresql://127.0.0.1/demo',AGENTCI_EVAL_DATABASE_URL:'postgresql://127.0.0.1/eval',GITHUB_PRIVATE_KEY_FILE:'/private/customer.pem',GITHUB_TOKEN:'raw-token-sentinel',AGENTCI_CUSTOMER_APP_PRIVATE_KEY:'raw-key-sentinel',OPENAI_API_KEY:'provider-sentinel',NODE_OPTIONS:'--require=/untrusted.js'};
 const worker=customerRuntimeEnvironment('worker',values);
 assert.equal(worker.AGENTCI_EVAL_RUNNER_IMAGE,runnerImage);
 assert.equal(worker.AGENTCI_MODEL_REVIEW_CHECKS,'true');
 assert.equal(worker.GITHUB_PRIVATE_KEY_FILE,'/private/customer.pem');
 for(const role of ['api','operator','evaluator','worker']){
  const env=customerRuntimeEnvironment(role,values);
  for(const key of ['GITHUB_TOKEN','AGENTCI_CUSTOMER_APP_PRIVATE_KEY','OPENAI_API_KEY','NODE_OPTIONS'])assert.equal(env[key],undefined);
  if(role!=='worker')assert.equal(env.AGENTCI_MODEL_REVIEW_CHECKS,undefined);
  if(role==='api'||role==='operator')assert.equal(env.AGENTCI_EVAL_RUNNER_IMAGE,undefined);
  if(role==='evaluator'){
   assert.equal(env.AGENTCI_EVAL_RUNNER_IMAGE,runnerImage);
   assert.equal(env.GITHUB_PRIVATE_KEY_FILE,undefined);
   assert.equal(env.DATABASE_URL,undefined);
  }
 }
 assert.equal(customerRuntimeEnvironment('worker',{}).AGENTCI_MODEL_REVIEW_CHECKS,undefined);
 assert.equal(customerRuntimeEnvironment('worker',{AGENTCI_MODEL_REVIEW_CHECKS:'false'}).AGENTCI_MODEL_REVIEW_CHECKS,'false');
});

test('actual supervised child receives the pinned worker settings and excludes ambient credential injection',async()=>{
 const root=await mkdtemp(join(tmpdir(),'customer-worker-env-'));
 const runtime=new CustomerRuntimeProcesses(root);
 try{
  const home=join(root,'owned-home');await mkdir(home);
  await mkdir(join(root,'dist/apps/worker'),{recursive:true});
  await writeFile(join(root,'dist/apps/worker/main.js'),`require('node:fs').writeFileSync(require('node:path').join(process.env.HOME,'observed.json'),JSON.stringify({image:process.env.AGENTCI_EVAL_RUNNER_IMAGE,checks:process.env.AGENTCI_MODEL_REVIEW_CHECKS,injected:['GITHUB_TOKEN','AGENTCI_CUSTOMER_APP_PRIVATE_KEY','OPENAI_API_KEY','NODE_OPTIONS'].some(key=>process.env[key]!==undefined)}));`);
  await runtime.start('worker',{PATH:process.env.PATH,HOME:home,AGENTCI_EVAL_RUNNER_IMAGE:runnerImage,AGENTCI_MODEL_REVIEW_CHECKS:'true',GITHUB_TOKEN:'sentinel',AGENTCI_CUSTOMER_APP_PRIVATE_KEY:'sentinel',OPENAI_API_KEY:'sentinel',NODE_OPTIONS:'--require=/untrusted.js'});
  const exited=await runtime.children.get('worker').exited;
  assert.equal(exited.code,0);
  assert.deepEqual(JSON.parse(await readFile(join(home,'observed.json'),'utf8')),{image:runnerImage,checks:'true',injected:false});
  assert.equal((await runtime.close()).ownedProcessesRemaining,0);
 }finally{await runtime.close();await rm(root,{recursive:true,force:true});}
});
