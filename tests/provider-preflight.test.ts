import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,chmod,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateProviderPreflight,preflightProviders,checkCredentialReference} from '../packages/onboarding/preflight.ts';
const config=()=>({providers:[{provider:'openai',endpoint:'https://api.openai.com',credentialFile:'/private/fixture-key'}],liveTests:{authorized:true,maxSpendUsdMicros:10_000_000}});
test('provider preflight rejects unauthorized budgets and endpoint overrides before I/O',async()=>{
 let calls=0;const options={request:async()=>{calls++;return new Response();},credentialCheck:async()=>{calls++;return true;}};
 for(const endpoint of ['http://api.openai.com','https://api.openai.com.evil.test','https://user:secret@api.openai.com','https://api.openai.com/v1/responses','https://api.openai.com?key=secret','https://127.0.0.1','https://api.openai.com:444']){
  const value=config();value.providers[0]!.endpoint=endpoint;await assert.rejects(preflightProviders(value,options),/endpoint-not-authorized/);
 }
 for(const budget of [{authorized:false,maxSpendUsdMicros:10},{authorized:true,maxSpendUsdMicros:0},{authorized:true,maxSpendUsdMicros:1.5},{authorized:true,maxSpendUsdMicros:Infinity}])await assert.rejects(preflightProviders({...config(),liveTests:budget},options),/budget-not-authorized/);
 assert.throws(()=>validateProviderPreflight({...config(),secret:'do-not-read'}),/invalid-preflight-config/);
 assert.equal(calls,0);
});
test('missing credentials block all connectivity and errors never expose private paths or contents',async()=>{
 let calls=0;const result=await preflightProviders(config(),{credentialCheck:async()=>{throw new Error('private-fixture-secret');},request:async()=>{calls++;return new Response();}});
 assert.equal(calls,0);assert.equal(result.passed,false);assert.equal(result.paidRequestsMade,false);
 assert.ok(!JSON.stringify(result).includes('fixture'));
});
test('connectivity uses unauthenticated bounded HEAD requests and records no authentication claim',async()=>{
 const calls:any[]=[];
 const result=await preflightProviders(config(),{credentialCheck:async()=>true,request:async(url,options)=>{calls.push({url,options});return new Response(null,{status:401});}});
 assert.equal(result.passed,true);assert.equal(result.paidRequestsMade,false);
 assert.equal(calls[0].url,'https://api.openai.com');assert.equal(calls[0].options.method,'HEAD');assert.equal(calls[0].options.redirect,'error');assert.equal(calls[0].options.headers,undefined);assert.equal(calls[0].options.body,undefined);assert.ok(calls[0].options.signal);
 assert.equal(result.checks[1]!.code,'endpoint-reachable-authentication-unverified');
 for(const status of [429,500,503])assert.equal((await preflightProviders(config(),{credentialCheck:async()=>true,request:async()=>new Response(null,{status})})).passed,false);
 const failure=await preflightProviders(config(),{credentialCheck:async()=>true,request:async()=>{throw new Error('private-fixture-secret');}});assert.equal(failure.passed,false);assert.ok(!JSON.stringify(failure).includes('fixture'));
});
test('credential references require nonempty private regular files and reject symlinks',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'agentci-preflight-'));
 try{
  const path=join(directory,'key');await writeFile(path,'fixture-only',{mode:0o600});assert.equal(await checkCredentialReference(path),true);
  await chmod(path,0o644);assert.equal(await checkCredentialReference(path),false);await chmod(path,0o600);
  const link=join(directory,'link');await symlink(path,link);assert.equal(await checkCredentialReference(link),false);
  await writeFile(path,'');assert.equal(await checkCredentialReference(path),false);assert.equal(await checkCredentialReference(directory),false);
 }finally{await rm(directory,{recursive:true,force:true});}
});
