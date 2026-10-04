import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const directory=await mkdtemp(join(tmpdir(),'agentci-deployment-config-'));
try {
  const providers=join(directory,'providers.json');await writeFile(providers,'[]\n',{mode:0o600});
  const pin='example.invalid/agentci@sha256:'+'a'.repeat(64);
  const env={...process.env,AGENTCI_EVAL_WORKER_IMAGE:pin,AGENTCI_EVAL_RUNNER_IMAGE:pin,AGENTCI_EVAL_ENGINES_IMAGE:'',AGENTCI_REPOSITORY:'example/repo',AGENTCI_ORGANIZATION_ID:'00000000-0000-4000-8000-000000000001',AGENTCI_EVAL_DATABASE_URL:'postgresql://postgres:5432/agentci',AGENTCI_EVAL_PGUSER:'restricted_fixture',AGENTCI_EVAL_PGPASSWORD:'disposable-render-fixture',AGENTCI_EVAL_TEMPORAL_ADDRESS:'temporal:7233',AGENTCI_DOCKER_SOCKET_GID:'998',AGENTCI_EVAL_PROVIDERS_FILE:providers,AGENTCI_CONTROLLER_NETWORK:'agentci_fixture_default',GITHUB_APP_ID:'must-not-inherit',GITHUB_PRIVATE_KEY_FILE:'/must-not-mount.pem',DATABASE_URL:'must-not-inherit',AGENTCI_EVIDENCE_TOKEN:'must-not-inherit'};
  const executable=process.env.AGENTCI_COMPOSE_BINARY??'docker',prefix=process.env.AGENTCI_COMPOSE_BINARY?[]:['compose'];
  const render=(files)=>JSON.parse(execFileSync(executable,[...prefix,...files.flatMap(file=>['-f',file]),'config','--format','json'],{env,encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  const standalone=render(['deploy/eval-worker.compose.yaml']),local=render(['deploy/eval-worker.compose.yaml','deploy/local-eval-network.compose.yaml']);
  for(const config of [standalone,local]){
    assert.deepEqual(Object.keys(config.services),['eval-worker']);const worker=config.services['eval-worker'];assert.equal(worker.image,pin);assert.equal(worker.read_only,true);assert.equal(worker.user,'1001:0');assert.deepEqual(worker.group_add,['998']);assert.deepEqual(worker.cap_drop,['ALL']);assert.ok(worker.security_opt.includes('no-new-privileges:true'));assert.equal(worker.environment.PGUSER,'restricted_fixture');assert.equal(worker.environment.PGPASSWORD,'disposable-render-fixture');
    const allowed=new Set(['AGENTCI_REPOSITORY','AGENTCI_ORGANIZATION_ID','AGENTCI_EVAL_DATABASE_URL','PGUSER','PGPASSWORD','TEMPORAL_ADDRESS','TEMPORAL_NAMESPACE','AGENTCI_EVAL_RUNNER_IMAGE','AGENTCI_EVAL_ENGINES_IMAGE','AGENTCI_EVAL_PROVIDERS_FILE']);assert.ok(Object.keys(worker.environment).every(key=>allowed.has(key)));assert.equal(worker.env_file,undefined);assert.equal(worker.ports,undefined);
    assert.equal(worker.volumes.length,2);assert.ok(worker.volumes.some(v=>v.target==='/run/secrets/eval-providers.json'&&v.read_only));assert.ok(worker.volumes.some(v=>v.target==='/var/run/docker.sock'));assert.ok(!JSON.stringify(config).includes('must-not'));
  }
  assert.equal(local.networks.controller.external,true);assert.equal(local.networks.controller.name,'agentci_fixture_default');
  console.log('Evaluator Compose boundary passed: explicit environment, restricted login, private provider mount, read-only service and separate/local network modes. No services started.');
} finally {await rm(directory,{recursive:true,force:true});}
