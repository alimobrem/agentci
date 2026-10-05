import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {preflightMount,type MountPreflightConfig} from '../packages/onboarding/mount-preflight.ts';
test('mount preflight verifies daemon-visible bytes with restricted execution and owned cleanup',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'agentci-mount-'));
 try{
  await writeFile(join(directory,'001.sql'),'SELECT 1;');const calls:{args:string[];options:any}[]=[];
  const config:MountPreflightConfig={engine:'docker',image:'sha256:'+'a'.repeat(64),directory,files:['001.sql']};
  const result=await preflightMount(config,async(_engine,args,options)=>{calls.push({args,options});return {stdout:args[0]==='run'?JSON.stringify({'001.sql':createHash('sha256').update('SELECT 1;').digest('hex')}):''};});
  assert.equal(result.passed,true);
  for(const flag of ['--pull=never','--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges'])assert.ok(calls[0]!.args.includes(flag));
  assert.ok(calls[0]!.args.some(a=>a===`type=bind,src=${directory},dst=/probe,readonly`));
  const name=calls[0]!.args[calls[0]!.args.indexOf('--name')+1];assert.match(name!,/^agentci-preflight-/);assert.deepEqual(calls[1]!.args,['rm','--force',name]);assert.ok(calls.every(c=>c.options.timeout<=30000));
  for(const mode of ['unshared','wrong-bytes','cleanup']){
   const failed=await preflightMount(config,async(_engine,args)=>{if(args[0]==='run'){if(mode==='unshared')throw new Error('private-path');return {stdout:JSON.stringify({'001.sql':mode==='wrong-bytes'?'bad':createHash('sha256').update('SELECT 1;').digest('hex')})};}return {stdout:args[0]==='ps'&&mode==='cleanup'?'remaining-container':''};});
   assert.equal(failed.passed,false);assert.ok(!JSON.stringify(failed).includes(directory));
  }
  let executed=false;const invalid=await preflightMount({...config,files:['../secret']},async()=>{executed=true;return {stdout:''};});assert.equal(invalid.passed,false);assert.equal(executed,false);
 }finally{await rm(directory,{recursive:true,force:true});}
});
