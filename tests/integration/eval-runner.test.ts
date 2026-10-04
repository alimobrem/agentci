import test from 'node:test';import assert from 'node:assert/strict';
import {evalSuite} from '../fixtures/evals.ts';
import {runIsolated,snapshotInputs,validateRunnerPolicy} from '../../packages/evals/runner.ts';
import {normalizeTrial} from '../../packages/evals/adapters.ts';
import {execFileSync} from 'node:child_process';
const image=process.env.AGENTCI_TEST_RUNNER_IMAGE;
test('runner rejects mutable images and credential/escaping snapshot inputs',()=>{
  assert.throws(()=>validateRunnerPolicy({image:'runner:latest'}),/pinned/);
  for(const path of ['../escape','.env','.ssh/key','node_modules/exploit.js','x.pem'])assert.throws(()=>snapshotInputs({sha:'a'.repeat(40),files:{[path]:'text'}}));
});
test('real isolated UBI runner: boundaries, pytest failures, timeouts, cancellation and output limits',{skip:!image,timeout:120000},async()=>{
  const policy={image:image!};
  const containers=()=>execFileSync('docker',['ps','-aq','--filter','label=agentci.purpose=eval-runner'],{encoding:'utf8'}).trim();
  const before=containers();
  const run=(script:string,overrides:Parameters<typeof evalSuite>[0]={},signal?:AbortSignal)=>runIsolated({sha:'a'.repeat(40),files:{'check.mjs':script}},evalSuite({runner:{adapter:'command',command:['node','check.mjs'],timeoutMs:5000},...overrides}),policy,{signal});
  const boundary=await run(`import assert from 'node:assert/strict';import{existsSync,writeFileSync}from'node:fs';import{networkInterfaces}from'node:os';assert.equal(process.getuid(),1001);assert.equal(process.env.AGENTCI_EVIDENCE_TOKEN,undefined);assert.equal(process.env.GITHUB_TOKEN,undefined);assert.equal(existsSync('/var/run/docker.sock'),false);assert.equal(existsSync('/run/secrets/github-app.pem'),false);assert.ok(Object.keys(networkInterfaces()).every(n=>n==='lo'));assert.throws(()=>writeFileSync('/etc/agentci-test','x'));writeFileSync('writable','yes');`);
  assert.equal(boundary.status,'completed');assert.equal(boundary.exitCode,0);
  assert.equal((await run('process.exit(1)')).exitCode,1);
  const absent=await run('',{runner:{adapter:'command',command:['agentci-no-such-command'],timeoutMs:5000}});assert.equal(absent.status,'error');assert.equal(absent.error,'spawn-error');
  const timeout=await run('setInterval(()=>{},1000)',{runner:{adapter:'command',command:['node','check.mjs'],timeoutMs:100}});assert.equal(timeout.status,'timeout');
  const limit=await run(`while(true)process.stdout.write('x'.repeat(4096));`,{runner:{adapter:'command',command:['node','check.mjs'],timeoutMs:5000,maxOutputBytes:1024}});assert.equal(limit.status,'error');assert.equal(limit.error,'output-limit');
  const abort=new AbortController();const pending=run('setInterval(()=>{},1000)',{},abort.signal);setTimeout(()=>abort.abort(),500);assert.equal((await pending).status,'cancelled');
  const suite=evalSuite({runner:{adapter:'pytest',command:['python','-m','pytest','-q','test_example.py'],report:'junit.xml',timeoutMs:10000},scenarios:[{id:'one',selector:'test_example.test_one'}]});
  for(const [code,expected] of [['assert True','passed'],['assert False','failed'],['import pytest; pytest.skip("skip")','skipped']] as const){
    const raw=await runIsolated({sha:'b'.repeat(40),files:{'test_example.py':`def test_one():\n    ${code}\n`}},suite,policy);
    assert.equal(raw.status,'completed');assert.equal(normalizeTrial(suite,raw).results.one!.status,expected);
  }
  const empty=await runIsolated({sha:'b'.repeat(40),files:{'test_example.py':'# no tests\n'}},suite,policy);assert.equal(empty.exitCode,5);assert.equal(normalizeTrial(suite,empty).error,'pytest-execution-error');
  const broken=await runIsolated({sha:'b'.repeat(40),files:{'test_example.py':'this is invalid syntax !\n'}},suite,policy);assert.equal(broken.exitCode,2);assert.equal(normalizeTrial(suite,broken).error,'pytest-execution-error');
  const native=evalSuite({runner:{adapter:'native',command:['node','check.mjs'],report:'result.json',timeoutMs:5000}});
  for(const status of ['passed','failed'] as const){
    const raw=await run(`import{writeFileSync}from'node:fs';writeFileSync('result.json',JSON.stringify({schemaVersion:'v1alpha1',results:[{scenario:'safe-response',status:'${status}'}]}));process.exit(${status==='passed'?0:1});`,{runner:native.spec.runner});
    assert.equal(normalizeTrial(native,raw).results['safe-response']!.status,status);
  }
  for(const script of [`import{symlinkSync}from'node:fs';symlinkSync('/etc/passwd','result.json');`,`import{writeFileSync}from'node:fs';writeFileSync('result.json','x'.repeat(2000));`]){
    const raw=await run(script,{runner:{...native.spec.runner,maxOutputBytes:1024}});assert.equal(raw.reportError,'missing-or-invalid-report');assert.equal(normalizeTrial(native,raw).error,'missing-report');
  }
  assert.equal(containers(),before,'all created containers must be removed, including aborted runners');
});
