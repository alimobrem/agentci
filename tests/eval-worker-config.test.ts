import test from 'node:test';import assert from 'node:assert/strict';
import {evalWorkerConfig} from '../apps/eval-worker/config.ts';
const env={AGENTCI_REPOSITORY:'owner/repo',AGENTCI_ORGANIZATION_ID:'00000000-0000-4000-8000-000000000001',AGENTCI_EVAL_DATABASE_URL:'postgresql://127.0.0.1/agentci',AGENTCI_EVAL_RUNNER_IMAGE:'sha256:'+'f'.repeat(64),TEMPORAL_ADDRESS:'127.0.0.1:7233'};
test('eval worker refuses controller credentials and repository-defined mutable runner images',async()=>{
  for(const key of ['DATABASE_URL','GITHUB_APP_ID','GITHUB_INSTALLATION_ID','GITHUB_WEBHOOK_SECRET','GITHUB_PRIVATE_KEY_FILE','AGENTCI_APP_PRIVATE_KEY','AGENTCI_EVIDENCE_TOKEN','GITHUB_TOKEN','GH_TOKEN','GH_PAT'])await assert.rejects(evalWorkerConfig({...env,[key]:'synthetic'}),/must not receive/);
  await assert.rejects(evalWorkerConfig({...env,AGENTCI_EVAL_RUNNER_IMAGE:'runner:latest'}),/pinned digest/);
  const config=await evalWorkerConfig(env);assert.equal(config.taskQueue,'agentci-eval-v1');assert.equal(config.policyFor('command').image,env.AGENTCI_EVAL_RUNNER_IMAGE);
  assert.throws(()=>config.policyFor('promptfoo'),/not configured/);
  await assert.rejects(evalWorkerConfig({...env,AGENTCI_EVAL_DATABASE_URL:'invalid'}),/Invalid eval database URL/);
});
