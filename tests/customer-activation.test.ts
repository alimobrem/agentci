import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
// @ts-ignore Trusted activation parser.
import {customerActivationInput} from '../scripts/lib/customer-activation.mjs';
// @ts-ignore Trusted scope guard.
import {validateCustomerInstallationInputs,validateCustomerInputs} from '../scripts/lib/customer-acceptance-preflight.mjs';
test('scope-only reviewed activation precedes fixture creation and rejects widened inputs',()=>{const source='a'.repeat(40),scope={repository:'alimobrem/agentci-onboarding-demo',appId:12,installationId:34},descriptor={schemaVersion:1,purpose:'approved-demo-installation-scope',harnessBase:'b'.repeat(40),scope};assert.deepEqual(customerActivationInput('scope',descriptor,source),{...scope,serviceSource:source});for(const bad of [{...descriptor,purpose:'publish'}, {...descriptor,scope:{...scope,privateKey:'sentinel'}},{...descriptor,harnessBase:'main'}])assert.throws(()=>customerActivationInput('scope',bad,source),/required/);});
test('committed scope activation pins the separate customer installation without authorizing demo execution',async()=>{
 const descriptor=JSON.parse(await readFile('releases/m3-customer-installation.json','utf8'));
 assert.equal(descriptor.harnessBase,'2652ee15b3214a3cc246cbf69f6ca01f8319a36c');
 const input=validateCustomerInstallationInputs(customerActivationInput('scope',descriptor,'a'.repeat(40)));
 assert.deepEqual(input,{repository:'alimobrem/agentci-onboarding-demo',appId:5182307,installationId:167710386,serviceSource:'a'.repeat(40)});
 for(const bad of [{...input,appId:5179954},{...input,installationId:167655696},{...input,repository:'alimobrem/agentci'},{...input,subjects:[]}])assert.throws(()=>validateCustomerInstallationInputs(bad));
 assert.throws(()=>customerActivationInput('demo',descriptor,'a'.repeat(40)),/required/);
});
test('committed demo activation binds actual fixture subjects and immutable candidate without widening authority',async()=>{
 const descriptor=JSON.parse(await readFile('releases/m3-customer-demo.json','utf8'));
 const fixtures=JSON.parse(await readFile('delivery/acceptance/m3-customer-fixtures-a39de3fb.json','utf8'));
 assert.equal(descriptor.harnessBase,'ee69dcb318e778ecbabfa3ad3171e1de2f6c91d6');
 const input=customerActivationInput('demo',descriptor,'a'.repeat(40));
 validateCustomerInputs(input.fixtures);
 assert.deepEqual(input.fixtures.subjects,fixtures.subjects);
 assert.equal(input.fixtures.serviceSource,'a'.repeat(40));
 assert.equal(input.releaseSource,'2b8eb75aadd604ebafe97ec06a3359734c4f20d2');
 for(const [key,file] of [['packageManifestSha256','package-manifest.json'],['packageSha256','agentci-0.4.0-m3-dev.3.tgz'],['imagesManifestSha256','images.json'],['publicationEvidenceSha256','publication-evidence.tgz']]){
  const downloads=JSON.parse(await readFile('delivery/acceptance/m3-customer-demo-candidate-downloads.json','utf8'));
  assert.equal(input[key],downloads.assets.find((asset:any)=>asset.name===file)?.sha256);
 }
 for(const bad of [{...descriptor,purpose:'publish'},{...descriptor,candidate:{...descriptor.candidate,privateKey:'sentinel'}},{...descriptor,fixtures:{...descriptor.fixtures,serviceSource:'b'.repeat(40)}}])assert.throws(()=>customerActivationInput('demo',bad,'a'.repeat(40)),/required/);
 for(const bad of [{...input.fixtures,appId:5179954},{...input.fixtures,installationId:167655696},{...input.fixtures,repository:'alimobrem/agentci'},{...input.fixtures,subjects:[input.fixtures.subjects[0],input.fixtures.subjects[0]]}])assert.throws(()=>validateCustomerInputs(bad));
});
test('cloud activation workflows bind main/public descriptor paths and exclude customer fixture writes',async()=>{for(const [workflow,descriptor]of [['customer-installation-scope.yaml','m3-customer-installation.json'],['customer-live-demo.yaml','m3-customer-demo.json']]){const source=await readFile('.github/workflows/'+workflow,'utf8');assert.ok(source.includes('branches: [main]'));assert.ok(source.includes('paths: [releases/'+descriptor+']'));assert.ok(source.includes("ref: '${{ github.sha }}'"));assert.ok(source.includes('fetch-depth: 0'));assert.ok(!source.includes('contents: write'));assert.ok(!source.includes('pull_request_target'));assert.ok(!source.includes('AGENTCI_APP_PRIVATE_KEY'));}});
