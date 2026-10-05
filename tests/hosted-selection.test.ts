import test from 'node:test';import assert from 'node:assert/strict';import {Octokit} from '@octokit/rest';import {hostedReviewCandidates} from '../packages/github/hosted-selection.ts';
const client=(pages:unknown[])=>{const urls:string[]=[];return {urls,api:new Octokit({request:{fetch:async(url:string | URL | Request)=>{urls.push(String(url));return new Response(JSON.stringify(pages[urls.length-1]??[]),{headers:{'content-type':'application/json'}});}}})};};
test('PR-triggered selection performs no all-PR discovery and never trusts event commit data',async()=>{
 const c=client([]);assert.deepEqual(await hostedReviewCandidates(c.api,'alimobrem/agentci','pull_request_target','36'),[{number:36}]);assert.equal(c.urls.length,0);
 for(const raw of [undefined,'','0','-1','1.5','36\n','9007199254740992','1;command'])await assert.rejects(hostedReviewCandidates(c.api,'alimobrem/agentci','pull_request_target',raw));
 await assert.rejects(hostedReviewCandidates(c.api,'other/repo','pull_request_target','36'));assert.equal(c.urls.length,0);
});
test('scheduled main and manual sweeps preserve bounded discovery',async()=>{
 for(const event of ['push','schedule','workflow_dispatch',undefined]){const c=client([[{number:4},{number:36}]]);assert.deepEqual(await hostedReviewCandidates(c.api,'alimobrem/agentci',event,''),[{number:4},{number:36}]);assert.equal(c.urls.length,1);assert.match(c.urls[0]!,/state=open/);}
 const c=client([]);await assert.rejects(hostedReviewCandidates(c.api,'alimobrem/agentci','schedule','36'));await assert.rejects(hostedReviewCandidates(c.api,'alimobrem/agentci','pull_request','36'));assert.equal(c.urls.length,0);
});
test('sweep limit prevents unbounded pagination and duplicate identities fail closed',async()=>{
 const hundred=Array.from({length:100},(_,i)=>({number:i+1}));const over=client([hundred,[{number:101}]]);await assert.rejects(hostedReviewCandidates(over.api,'alimobrem/agentci','schedule',''),/budget exceeded/);assert.equal(over.urls.length,2);
 const exact=client([hundred,[]]);assert.equal((await hostedReviewCandidates(exact.api,'alimobrem/agentci','schedule','')).length,100);assert.equal(exact.urls.length,2);
 const duplicate=client([[{number:4},{number:4}]]);await assert.rejects(hostedReviewCandidates(duplicate.api,'alimobrem/agentci','schedule',''),/invalid-hosted-review-list/);
});
