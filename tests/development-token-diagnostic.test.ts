import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {parse} from 'yaml';
// @ts-expect-error operational ESM helper
import {redactedRepositoryCapability,redactedAuthentication} from '../scripts/lib/development-token-diagnostic.mjs';
import {Octokit} from '@octokit/rest';
test('real locked Octokit classification covers legacy, stateless installation, app and OAuth shapes without exposing bytes',async()=>{
 const encode=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
 const jwt=encode({alg:'RS256',typ:'JWT'})+'.'+encode({synthetic:true})+'.synthetic_signature';
 for(const [token,tokenType] of [['ghs_synthetic_installation','installation'],['ghs_123_'+jwt,'app'],[jwt,'app'],['synthetic_oauth','oauth']]as const){
  const auth=await new Octokit({auth:token}).auth();
  const result=redactedAuthentication(auth,token);
  assert.deepEqual(result,{authType:'token',authTokenType:tokenType,tokenPresent:true,tokenMatches:true});
  assert.ok(!JSON.stringify(result).includes(token));
 }
});
test('auth projection allows only classification enums and presence/exact-match booleans',()=>{
 const secret='sensitive-auth-sentinel';
 assert.deepEqual(redactedAuthentication({type:secret,tokenType:secret,token:secret,raw:secret},'different'),{authType:'unknown',authTokenType:'unknown',tokenPresent:true,tokenMatches:false});
 for(const auth of [undefined,null,{}, {type:null,tokenType:null,token:42},{type:'token',tokenType:'installation',token:''}]){
  const result=redactedAuthentication(auth,secret);assert.equal(result.tokenPresent,false);assert.equal(result.tokenMatches,false);assert.ok(!JSON.stringify(result).includes(secret));
 }
 assert.equal(redactedAuthentication({type:'token',tokenType:'installation',token:secret},undefined).tokenMatches,false);
 assert.deepEqual(Object.keys(redactedAuthentication({},secret)),['authType','authTokenType','tokenPresent','tokenMatches']);
});
test('redacted capability distinguishes absent false true null and wrong repository without raw values',()=>{
 for(const [permissions,present,type,value]of [[undefined,false,'absent',null],[{push:false},true,'boolean',false],[{push:true},true,'boolean',true],[{push:null},true,'null',null],[{push:'sensitive-sentinel'},true,'string',null]]as const){
  const result=redactedRepositoryCapability({full_name:'alimobrem/agentci',permissions,token:'sensitive-sentinel',private_response:'sensitive-sentinel'});
  assert.deepEqual(result,{permissionsObject:permissions!==undefined,pushFieldPresent:present,pushType:type,pushBoolean:value,repositoryMatches:true});assert.ok(!JSON.stringify(result).includes('sensitive-sentinel'));
 }
 assert.equal(redactedRepositoryCapability({full_name:'sensitive-sentinel',permissions:[]}).repositoryMatches,false);
});
test('standalone diagnostic uses existing preflight grants with no publication command or App credentials',async()=>{
 const workflow=parse(await readFile('.github/workflows/development-token-diagnostic.yaml','utf8'));
 assert.deepEqual(workflow.jobs.diagnostic.permissions,{contents:'write',packages:'read'});
 assert.deepEqual(workflow.on.push.paths,['.github/workflows/development-token-diagnostic.yaml']);
 const source=await readFile('scripts/development-token-diagnostic.mjs','utf8');
 assert.match(source,/github\.rest\.repos\.get\(\{owner:'alimobrem',repo:'agentci'\}\)/);
 assert.ok(!/publishDraftAssets|development-release|APP_PRIVATE_KEY|console\.log\(.*response|error\.message/.test(source));
});

test('actual diagnostic retains only allowlisted evidence for authenticated GET and API failure',async()=>{
 const {mkdtemp,mkdir,writeFile,copyFile,symlink,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join,resolve}=await import('node:path');const {execFileSync,spawnSync}=await import('node:child_process');
 const root=await mkdtemp(join(tmpdir(),'agentci-token-diagnostic-'));
 try{
  await mkdir(join(root,'scripts/lib'),{recursive:true});await mkdir(join(root,'.github/workflows'),{recursive:true});
  for(const path of ['scripts/development-token-diagnostic.mjs','scripts/lib/development-token-diagnostic.mjs','.github/workflows/development-token-diagnostic.yaml'])await copyFile(path,join(root,path));
  await writeFile(join(root,'package.json'),JSON.stringify({type:'module'}));await symlink(resolve('node_modules'),join(root,'node_modules'),'dir');
  execFileSync('git',['init','--quiet'],{cwd:root});execFileSync('git',['add','.github/workflows/development-token-diagnostic.yaml'],{cwd:root});execFileSync('git',['-c','user.name=Diagnostic fixture','-c','user.email=fixture@example.invalid','commit','--quiet','-m','Diagnostic fixture'],{cwd:root});
  const sha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  await writeFile(join(root,'preload.mjs'),`globalThis.fetch=async(url,options={})=>{if(options.method!=='GET'||String(url)!=='https://api.github.com/repos/alimobrem/agentci')throw Error('unexpected operation');if(process.env.DIAGNOSTIC_ERROR)return new Response(JSON.stringify({message:'sensitive-response-sentinel'}),{status:403,headers:{'content-type':'application/json'}});return new Response(JSON.stringify({full_name:'alimobrem/agentci',permissions:{push:false},private_data:'sensitive-response-sentinel'}),{status:200,headers:{'content-type':'application/json'}});};`);
  const env={PATH:process.env.PATH,HOME:root,GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'alimobrem/agentci',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',GITHUB_JOB:'diagnostic',GITHUB_SHA:sha,GITHUB_WORKFLOW_SHA:sha,GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',GITHUB_WORKFLOW_REF:'alimobrem/agentci/.github/workflows/development-token-diagnostic.yaml@refs/heads/main',GITHUB_TOKEN:'sensitive-token-sentinel'};
  for(const error of [false,true]){
   const execution=spawnSync(process.execPath,['--import',join(root,'preload.mjs'),'scripts/development-token-diagnostic.mjs'],{cwd:root,env:{...env,...(error?{DIAGNOSTIC_ERROR:'yes'}:{})},encoding:'utf8',timeout:30000});assert.equal(execution.status,error?1:0,execution.stderr);
   const evidence=await readFile(join(root,'development-diagnostic.json'),'utf8');assert.ok(!/(sensitive-token-sentinel|sensitive-response-sentinel)/.test(evidence+execution.stdout+execution.stderr));
   const record=JSON.parse(evidence);assert.equal(record.httpStatus,error?403:200);assert.equal(record.result,error?'failed':'observed');assert.equal(record.sourceCommit,sha);if(!error)assert.deepEqual(record.capability,{permissionsObject:true,pushFieldPresent:true,pushType:'boolean',pushBoolean:false,repositoryMatches:true});else assert.equal(record.capability,null);
   assert.equal(record.schemaVersion,2);assert.equal(record.runId,'123');assert.equal(record.attempt,'1');assert.deepEqual(record.authentication,{authType:'token',authTokenType:'oauth',tokenPresent:true,tokenMatches:true});
   assert.deepEqual(Object.keys(record).sort(),['schemaVersion','operation','result','sourceCommit','runId','attempt','authentication','capability','httpStatus'].sort());
  }
  const encode=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const stateless='ghs_123_'+encode({alg:'RS256',typ:'JWT'})+'.'+encode({synthetic:true})+'.synthetic_signature';
  const statelessExecution=spawnSync(process.execPath,['--import',join(root,'preload.mjs'),'scripts/development-token-diagnostic.mjs'],{cwd:root,env:{...env,GITHUB_TOKEN:stateless},encoding:'utf8',timeout:30000});assert.equal(statelessExecution.status,0,statelessExecution.stderr);
  const statelessEvidence=await readFile(join(root,'development-diagnostic.json'),'utf8');assert.ok(!statelessEvidence.includes(stateless));assert.ok(!/ghs_|synthetic_signature/.test(statelessEvidence+statelessExecution.stdout+statelessExecution.stderr));
  assert.deepEqual(JSON.parse(statelessEvidence).authentication,{authType:'token',authTokenType:'app',tokenPresent:true,tokenMatches:true});
  await writeFile(join(root,'.github/workflows/development-token-diagnostic.yaml'),'changed source');
  const changed=spawnSync(process.execPath,['--import',join(root,'preload.mjs'),'scripts/development-token-diagnostic.mjs'],{cwd:root,env,encoding:'utf8',timeout:30000});assert.equal(changed.status,1);const denied=JSON.parse(await readFile(join(root,'development-diagnostic.json'),'utf8'));assert.equal(denied.httpStatus,null);assert.equal(denied.authentication,null);
 }finally{await rm(root,{recursive:true,force:true});}
});
