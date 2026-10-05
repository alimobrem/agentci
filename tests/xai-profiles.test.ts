import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {xAIGrokProfile} from '../packages/providers/xai-profiles.ts';import {createXAIProvider} from '../packages/providers/xai.ts';
test('Grok profile reserves full context at long-context prices and requires opaque tool history',()=>{
 const req={...JSON.parse(readFileSync(new URL('../specs/api/fixtures/model-request.json',import.meta.url),'utf8')),provider:'xai',model:'grok-4.7'},profile=xAIGrokProfile(),provider=createXAIProvider('synthetic-fixture',[profile]);
 assert.equal(provider.estimateCost!(req).upperBoundUsdMicros,2003072);assert.equal(profile.requireToolContinuation,true);assert.deepEqual(profile.responseModels,['grok-4.7']);
 assert.throws(()=>provider.estimateCost!({...req,parameters:{maxOutputTokens:128001}}),/unsupported-capability/);
});
