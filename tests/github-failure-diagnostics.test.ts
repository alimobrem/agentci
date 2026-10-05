import test from 'node:test';
import assert from 'node:assert/strict';
import {Octokit} from '@octokit/rest';
import {githubFailureDiagnostic, observeGitHubFailures} from '../packages/github/failure-diagnostics.ts';

test('GitHub failure diagnostics allow only bounded metadata and never infer permission failure from 403 alone', () => {
  const diagnostic = githubFailureDiagnostic({status:403,message:'secret',request:{authorization:'secret'},response:{data:{message:'secret'},headers:{authorization:'secret','x-ratelimit-remaining':'0','x-ratelimit-limit':'5000','x-ratelimit-reset':'1791220000','retry-after':'60','x-github-request-id':'F7C0:B33DA:171F86:1A538F:6AC3DAF8'}}});
  assert.deepEqual(diagnostic,{event:'github-request-failed',status:403,category:'primary-rate-limit',remaining:0,limit:5000,resetEpochSeconds:1791220000,retryAfterSeconds:60,requestId:'F7C0:B33DA:171F86:1A538F:6AC3DAF8'});
  assert.ok(!JSON.stringify(diagnostic).includes('secret'));
  assert.equal(githubFailureDiagnostic({status:403}).category,'forbidden-or-rate-limit');
  assert.equal(githubFailureDiagnostic({status:429}).category,'rate-limit');
  assert.equal(githubFailureDiagnostic({status:401}).category,'authentication');
  for(const raw of ['-1','1.5',' 0','0\n','10000000000000','secret']){
    const bad=githubFailureDiagnostic({status:999,response:{headers:{'x-ratelimit-remaining':raw,'retry-after':raw,'x-github-request-id':'secret\nforged-log'}}});
    assert.equal(bad.status,null);assert.equal(bad.remaining,null);assert.equal(bad.retryAfterSeconds,null);assert.equal(bad.requestId,null);
  }
  assert.equal(githubFailureDiagnostic(null).category,'request-failure');
});

test('GitHub request hook reports failures without changing SDK rejection and ignores sink failures', async () => {
  const diagnostics:unknown[]=[];
  const client=new Octokit({log:{debug(){},info(){},warn(){},error(){}},request:{fetch:async()=>new Response(JSON.stringify({message:'private upstream message'}),{status:403,headers:{'content-type':'application/json','x-ratelimit-remaining':'0'}})}});
  observeGitHubFailures(client,d=>diagnostics.push(d));
  await assert.rejects(client.request('GET /repos/owner/repo'),error=>(error as any).status===403);
  assert.equal(diagnostics.length,1);
  assert.equal((diagnostics[0] as any).category,'primary-rate-limit');
  assert.ok(!JSON.stringify(diagnostics).includes('private'));
  const broken=new Octokit({log:{debug(){},info(){},warn(){},error(){}},request:{fetch:async()=>new Response('{}',{status:401,headers:{'content-type':'application/json'}})}});
  observeGitHubFailures(broken,()=>{throw new Error('sink failed');});
  await assert.rejects(broken.request('GET /repos/owner/repo'),error=>(error as any).status===401);
});
