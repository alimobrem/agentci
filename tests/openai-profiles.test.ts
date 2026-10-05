import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openAILunaProfile} from '../packages/providers/openai-profiles.ts';
import {createOpenAIProvider} from '../packages/providers/openai.ts';
import {openAIRequest} from '../packages/providers/openai-request.ts';
test('reviewed Luna profile reserves long-context cache-write upper cost at standard service',()=>{
 const req={...JSON.parse(readFileSync(new URL('../specs/api/fixtures/model-request.json',import.meta.url),'utf8')),provider:'openai',model:'gpt-6-luna'};
 const p=openAILunaProfile(),provider=createOpenAIProvider('synthetic-fixture',[p]);
 const estimate=provider.estimateCost!(req);
 assert.equal(estimate.upperBoundUsdMicros,262692);assert.equal(estimate.pricingRevision,p.pricingRevision);
 assert.equal(openAIRequest(req).service_tier,'default');
 p.responseModels!.push('unexpected');assert.deepEqual(openAILunaProfile().responseModels,['gpt-6-luna']);
 assert.throws(()=>openAIRequest({...req,providerExtensions:{openai:{service_tier:'fast'}}}),/unsupported-capability/);
});
