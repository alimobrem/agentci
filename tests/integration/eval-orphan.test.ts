import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {reapPriorEvalContainers} from '../../packages/evals/runner.ts';
import {evalSuite} from '../fixtures/evals.ts';
const image=process.env.AGENTCI_TEST_RUNNER_IMAGE;
if(!image)throw new Error('Orphan recovery requires a real immutable runner image; never silently skip');
const execute=promisify(execFile);
const docker=async(args:string[])=>(await execute('docker',args,{encoding:'utf8',timeout:30000,maxBuffer:65536})).stdout.trim();
test('SIGKILL leaves a live eval container; recovery removes only prior owners of the exact unit',{timeout:60000},async()=>{
  const unitId=randomUUID(),oldToken=randomUUID(),newToken=randomUUID(),otherId=randomUUID();
  const suite=evalSuite({runner:{adapter:'command',command:['node','wait.mjs'],timeoutMs:30000},trials:{count:1,passRate:1,confidenceMethod:'wilson'}});
  const snapshot={sha:'a'.repeat(40),files:{'wait.mjs':'setTimeout(()=>process.exit(0),25000)'}};
  const start=(id:string,token:string)=>spawn(process.execPath,['--import','tsx','--input-type=module','-e',
    `import {runIsolated} from './packages/evals/runner.ts';await runIsolated(${JSON.stringify(snapshot)},${JSON.stringify(suite)},${JSON.stringify({image})},${JSON.stringify({ownership:{unitId:id,leaseToken:token}})});`],{stdio:'ignore'});
  const first=start(unitId,oldToken),other=start(otherId,randomUUID());
  const ids=async(id:string)=>docker(['ps','--quiet','--no-trunc','--filter',`label=agentci.eval.unit=${id}`]);
  const waitLive=async(id:string)=>{for(let i=0;i<100;i++){const value=await ids(id);if(value)return value;await delay(50);}throw new Error('Owned runner was never observed running');};
  try{
    const firstContainer=await waitLive(unitId),otherContainer=await waitLive(otherId);
    const firstExit=once(first,'exit'),otherExit=once(other,'exit');first.kill('SIGKILL');other.kill('SIGKILL');
    assert.equal((await firstExit)[1],'SIGKILL');assert.equal((await otherExit)[1],'SIGKILL');
    assert.equal(await ids(unitId),firstContainer,'process death must leave a live daemon container for this test');
    assert.equal(await reapPriorEvalContainers({unitId,leaseToken:newToken}),1);
    assert.equal(await ids(unitId),'');assert.equal(await ids(otherId),otherContainer,'recovery must preserve another unit');
    assert.equal(await reapPriorEvalContainers({unitId:otherId,leaseToken:JSON.parse(await docker(['inspect','--format','{{json .Config.Labels}}',otherContainer]))['agentci.eval.lease']}),0,'current lease is never reaped');
    await assert.rejects(reapPriorEvalContainers({unitId:'invalid',leaseToken:newToken}),/ownership/);
  }finally{
    first.kill('SIGKILL');other.kill('SIGKILL');
    for(const id of [unitId,otherId]){
      const remaining=await docker(['ps','--all','--quiet','--no-trunc','--filter',`label=agentci.eval.unit=${id}`]);
      if(remaining)await docker(['rm','--force','--volumes',...remaining.split('\n')]);
    }
  }
});
