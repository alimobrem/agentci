import test from 'node:test';import assert from 'node:assert/strict';import {Octokit} from '@octokit/rest';
import {guardGitHubRateLimits,GitHubRateLimitWait} from '../packages/github/rate-limit.ts';
const make=(status:number,headers:Record<string,string>)=>{
 let time=1000000,calls=0;
 const client=new Octokit({log:{debug(){},info(){},warn(){},error(){}},request:{fetch:async()=>{calls++;return calls===1?new Response(JSON.stringify({message:'private upstream body'}),{status,headers:{'content-type':'application/json',...headers}}):new Response('{}',{headers:{'content-type':'application/json'}});}}});
 guardGitHubRateLimits(client,()=>time);
 return {client,calls:()=>calls,advance:(ms:number)=>{time+=ms;},time:()=>time};
};

test('confirmed primary exhaustion suppresses subsequent requests until reset without extending cooldown',async()=>{
 const f=make(403,{'x-ratelimit-remaining':'0','x-ratelimit-reset':'1120'});
 await assert.rejects(f.client.request('GET /repos/owner/repo'),e=>(e as any).status===403);
 for(let i=0;i<3;i++){
  await assert.rejects(f.client.request('GET /repos/owner/repo'),e=>e instanceof GitHubRateLimitWait&&e.retryAt===1120000&&e.message==='github-rate-limit-wait'&&!('request' in e)&&!('cause' in e));
  assert.equal(f.calls(),1);f.advance(30000);
 }
 f.advance(30000);await f.client.request('GET /repos/owner/repo');assert.equal(f.calls(),2);
});

test('retry-after and primary reset use the later deadline; unspecified 429 timing backs off one minute',async()=>{
 for(const [status,headers,wait] of [[403,{'x-ratelimit-remaining':'0','x-ratelimit-reset':'1030','retry-after':'90'},90000],[429,{},60000],[403,{'retry-after':'10'},10000]] as const){
  const f=make(status,headers);await assert.rejects(f.client.request('GET /repos/owner/repo'));
  f.advance(wait-1);await assert.rejects(f.client.request('GET /repos/owner/repo'),GitHubRateLimitWait);assert.equal(f.calls(),1);
  f.advance(1);await f.client.request('GET /repos/owner/repo');assert.equal(f.calls(),2);
 }
});

test('bare access denial is not mislabeled throttling and malformed timing cannot bypass confirmed exhaustion',async()=>{
 for(const status of [401,403,500]){
  const f=make(status,{});await assert.rejects(f.client.request('GET /repos/owner/repo'));await f.client.request('GET /repos/owner/repo');assert.equal(f.calls(),2);
 }
 const f=make(403,{'x-ratelimit-remaining':'0','x-ratelimit-reset':'secret','retry-after':'-1'});await assert.rejects(f.client.request('GET /repos/owner/repo'));
 await assert.rejects(f.client.request('GET /repos/owner/repo'),e=>e instanceof GitHubRateLimitWait&&e.retryAt===f.time()+60000&&!JSON.stringify(e).includes('private'));
 assert.equal(f.calls(),1);
});
