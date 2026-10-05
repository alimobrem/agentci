import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,chmod,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {validatePreflightConfig,loadPreflightConfig,runPreflight,checkReadiness} from '../packages/onboarding/preflight-command.ts';
const config=()=>({deployment:{engine:'docker',image:'sha256:'+'a'.repeat(64),directory:'/operator/migrations',files:['001.sql'],url:'http://127.0.0.1:3000'},providers:[],liveTests:null});
test('combined preflight validates all configuration before probes and stops after failed mount',async()=>{
 let calls=0;const value=config();value.deployment.url='http://private-service';
 await assert.rejects(runPreflight(value,{mount:async()=>{calls++;throw Error();}}),/readiness-origin/);assert.equal(calls,0);
 assert.throws(()=>validatePreflightConfig({...config(),providers:[{provider:'openai',endpoint:'https://api.openai.com',credentialFile:'/operator/key'}]}),/preflight-config/);
 const result=await runPreflight(config(),{mount:async()=>({id:'deployment:mount',passed:false,code:'unavailable'}),readiness:async()=>{calls++;throw Error();}});
 assert.equal(result.passed,false);assert.equal(calls,0);assert.deepEqual(result.requestedScope,{deployment:true,providers:[]});
 const good=await runPreflight(config(),{mount:async()=>({id:'deployment:mount',passed:true,code:'match'}),readiness:async()=>({id:'deployment:readiness',passed:true,code:'ready'})});assert.equal(good.passed,true);assert.equal(good.paidRequestsMade,false);
});
test('readiness rejects unavailable, malformed and oversized responses without exposing errors',async()=>{
 const requests:any[]=[];
 const passed=await checkReadiness('http://127.0.0.1:3000',async(url,options)=>{requests.push({url:String(url),options});return Response.json({status:'ready'});});assert.equal(passed.passed,true);
 assert.equal(requests[0].url,'http://127.0.0.1:3000/readyz');assert.equal(requests[0].options.headers,undefined);assert.equal(requests[0].options.redirect,'error');
 for(const response of [Response.json({status:'unavailable'},{status:503}),new Response('invalid'),new Response('x'.repeat(1025)),Response.json({status:'unknown'})])assert.equal((await checkReadiness('https://operator.example',async()=>response)).passed,false);
 const result=await checkReadiness('https://operator.example',async()=>{throw Error('private-secret');});assert.equal(result.passed,false);assert.ok(!JSON.stringify(result).includes('private'));
});
test('private CLI config rejects permissive files, symlinks, oversized data and invalid arguments',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'agentci-preflight-config-'));
 try{
  const file=join(directory,'config.json');await writeFile(file,JSON.stringify(config()),{mode:0o600});assert.deepEqual(await loadPreflightConfig(file),config());
  await chmod(file,0o644);await assert.rejects(loadPreflightConfig(file),/invalid-private/);await chmod(file,0o600);
  const link=join(directory,'link');await symlink(file,link);await assert.rejects(loadPreflightConfig(link),/invalid-private/);
  await writeFile(file,'x'.repeat(65537));await assert.rejects(loadPreflightConfig(file),/invalid-private/);
  for(const args of [['preflight'],['preflight','--config',join(directory,'missing')]]){
   const child=spawnSync(process.execPath,['--import','tsx','cmd/agentci/main.ts',...args],{encoding:'utf8'});assert.equal(child.status,2);const error=JSON.parse(child.stderr).error;assert.match(error.code,/invalid-(preflight-arguments|private-preflight-config)/);assert.ok(!child.stderr.includes(directory));
  }
 }finally{await rm(directory,{recursive:true,force:true});}
});
