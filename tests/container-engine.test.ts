import test from 'node:test';
import assert from 'node:assert/strict';
import {containerEngine,validateRunnerPolicy} from '../packages/evals/runner.ts';
test('operator container selection defaults to Podman and rejects arbitrary executables before execution',()=>{
  const previous=process.env.AGENTCI_CONTAINER_ENGINE;
  try{
    delete process.env.AGENTCI_CONTAINER_ENGINE;
    assert.equal(containerEngine(),'podman');
    assert.equal(validateRunnerPolicy({image:'sha256:'+'f'.repeat(64)}).engine,'podman');
    process.env.AGENTCI_CONTAINER_ENGINE='docker';assert.equal(containerEngine(),'docker');
    assert.equal(validateRunnerPolicy({image:'sha256:'+'f'.repeat(64),engine:'podman'}).engine,'podman');
    for(const value of ['','/usr/bin/docker','docker; sh','PODMAN',{},null])assert.throws(()=>containerEngine(value),/operator container engine/);
    process.env.AGENTCI_CONTAINER_ENGINE='/tmp/executable';assert.throws(()=>validateRunnerPolicy({image:'sha256:'+'f'.repeat(64)}),/operator container engine/);
  }finally{if(previous===undefined)delete process.env.AGENTCI_CONTAINER_ENGINE;else process.env.AGENTCI_CONTAINER_ENGINE=previous;}
});
