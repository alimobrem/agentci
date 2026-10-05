import test from 'node:test';import assert from 'node:assert/strict';import OpenAI from 'openai';import {openAIError,openAIRetryDelay} from '../packages/providers/openai-error.ts';
const error=(status:number,code='fixture')=>OpenAI.APIError.generate(status,{error:{code,message:'private-fixture'}},'private-fixture',new Headers({'retry-after':'2'}));
test('OpenAI errors separate authentication, invalid input, quota and retryable throttling',()=>{
 for(const status of [401,403]){const mapped=openAIError(error(status));assert.equal(mapped.code,'authentication');assert.equal(mapped.retryable,false);assert.equal(mapped.message.includes('private'),false);}
 for(const status of [400,404,422])assert.equal(openAIError(error(status)).code,'invalid-request');
 assert.equal(openAIError(error(429,'insufficient_quota')).retryable,false);const rate=openAIError(error(429));assert.equal(rate.retryable,true);assert.equal(rate.retryAfterMs,2000);assert.equal(rate.dispatch,'not-sent');
 const server=openAIError(error(503));assert.equal(server.dispatch,'possibly-sent');assert.equal(server.retryable,true);
});
test('retry delay supports numeric and HTTP date values, with malformed values ignored',()=>{
 const now=Date.parse('2026-10-05T00:00:00Z');assert.equal(openAIRetryDelay(new Headers({'retry-after':'0.25'}),now),250);assert.equal(openAIRetryDelay(new Headers({'retry-after':'Mon, 05 Oct 2026 00:00:03 GMT'}),now),3000);assert.equal(openAIRetryDelay(new Headers({'retry-after-ms':'50','retry-after':'2'}),now),50);
 for(const value of ['-1','NaN','private-fixture'])assert.equal(openAIRetryDelay(new Headers({'retry-after':value}),now),null);
});
test('cancellation and timeouts remain terminal; unknown failures are redacted',()=>{
 const c=new AbortController();c.abort('private-fixture');assert.equal(openAIError(Error('private'),c.signal).code,'cancelled');assert.equal(openAIError(new OpenAI.APIConnectionTimeoutError()).code,'deadline');const result=openAIError(Error('private'));assert.equal(result.message,'transport');assert.equal(result.retryable,false);
});

test('oversized valid server delays remain retry blockers instead of becoming missing metadata',()=>{
 for(const key of ['retry-after','retry-after-ms'])for(const value of ['9007199254740992','9'.repeat(100)])assert.equal(openAIRetryDelay(new Headers({[key]:value})),Number.MAX_SAFE_INTEGER);
 const mapped=openAIError(OpenAI.APIError.generate(429,{error:{code:'rate_limit_exceeded'}},'',new Headers({'retry-after':'9'.repeat(100)})));assert.equal(mapped.retryAfterMs,Number.MAX_SAFE_INTEGER);
});
