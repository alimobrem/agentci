import test from 'node:test';import assert from 'node:assert/strict';import {existsSync} from 'node:fs';import {readFile} from 'node:fs/promises';
// @ts-ignore Trusted activation parser.
import {customerActivationInput} from '../scripts/lib/customer-activation.mjs';
// @ts-ignore Trusted scope guard.
import {validateCustomerInstallationInputs} from '../scripts/lib/customer-acceptance-preflight.mjs';
test('scope-only reviewed activation precedes fixture creation and rejects widened inputs',()=>{const source='a'.repeat(40),scope={repository:'alimobrem/agentci-onboarding-demo',appId:12,installationId:34},descriptor={schemaVersion:1,purpose:'approved-demo-installation-scope',harnessBase:'b'.repeat(40),scope};assert.deepEqual(customerActivationInput('scope',descriptor,source),{...scope,serviceSource:source});assert.ok(!existsSync('releases/m3-customer-demo.json'));for(const bad of [{...descriptor,purpose:'publish'}, {...descriptor,scope:{...scope,privateKey:'sentinel'}},{...descriptor,harnessBase:'main'}])assert.throws(()=>customerActivationInput('scope',bad,source),/required/);});
test('committed scope activation pins the separate customer installation without authorizing demo execution',async()=>{
 const descriptor=JSON.parse(await readFile('releases/m3-customer-installation.json','utf8'));
 assert.equal(descriptor.harnessBase,'2652ee15b3214a3cc246cbf69f6ca01f8319a36c');
 const input=validateCustomerInstallationInputs(customerActivationInput('scope',descriptor,'a'.repeat(40)));
 assert.deepEqual(input,{repository:'alimobrem/agentci-onboarding-demo',appId:5182307,installationId:167710386,serviceSource:'a'.repeat(40)});
 for(const bad of [{...input,appId:5179954},{...input,installationId:167655696},{...input,repository:'alimobrem/agentci'},{...input,subjects:[]}])assert.throws(()=>validateCustomerInstallationInputs(bad));
 assert.throws(()=>customerActivationInput('demo',descriptor,'a'.repeat(40)),/required/);
});
test('cloud activation workflows bind main/public descriptor paths and exclude customer fixture writes',async()=>{for(const [workflow,descriptor]of [['customer-installation-scope.yaml','m3-customer-installation.json'],['customer-live-demo.yaml','m3-customer-demo.json']]){const source=await readFile('.github/workflows/'+workflow,'utf8');assert.ok(source.includes('branches: [main]'));assert.ok(source.includes('paths: [releases/'+descriptor+']'));assert.ok(source.includes("ref: '${{ github.sha }}'"));assert.ok(source.includes('fetch-depth: 0'));assert.ok(!source.includes('contents: write'));assert.ok(!source.includes('pull_request_target'));assert.ok(!source.includes('AGENTCI_APP_PRIVATE_KEY'));}});
