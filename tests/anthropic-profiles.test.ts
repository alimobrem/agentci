import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {anthropicOpusProfile} from '../packages/providers/anthropic-profiles.ts';import {createAnthropicProvider} from '../packages/providers/anthropic.ts';
test('reviewed Opus profile uses full-context cache-write upper bound and exact identity',()=>{
 const req={...JSON.parse(readFileSync(new URL('../specs/api/fixtures/model-request.json',import.meta.url),'utf8')),provider:'anthropic',model:'claude-opus-5-5',developer:''};
 const p=anthropicOpusProfile(),provider=createAnthropicProvider('synthetic-fixture',[p]);assert.equal(provider.estimateCost!(req).upperBoundUsdMicros,8005120);assert.deepEqual(p.responseModels,['claude-opus-5-5']);
 assert.throws(()=>provider.estimateCost!({...req,parameters:{maxOutputTokens:256,temperature:1}}),/unsupported-capability/);
 assert.equal(p.requireSignedToolHistory,true);
 assert.throws(()=>createAnthropicProvider('synthetic-fixture',[{...p,capabilities:{...p.capabilities,extensions:false}}]),/invalid-request/);
});
