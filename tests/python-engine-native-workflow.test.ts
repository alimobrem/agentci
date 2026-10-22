import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parse} from 'yaml';

const workflow=parse(await readFile('.github/workflows/verify.yaml','utf8'));
const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>[key,canonical(value)])):value;
const ordinaryGuard="${{ github.event_name != 'workflow_dispatch' || inputs.qualification != 'python-engine-native' }}";

test('native Python image mode preserves both existing Verify cohorts and ordinary trigger behavior',()=>{
 const known:Record<string,string>={'fast-feedback':'f433da7276ea11c246cd5a03132a9055ae0a369192e2360d37a1a2ecf3379f9e','contracts-and-runtime':'7c0499f0a969188cadf824e267994bd721640e6387435d42b64185d3faa6ec62'};
 for(const [name,digest]of Object.entries(known)){
  const {if:guard,...job}=workflow.jobs[name];
  assert.equal(guard,ordinaryGuard);
  // Exact canonical semantic cohorts at reviewed parent16f77f5; no baseline refresh.
  assert.equal(createHash('sha256').update(JSON.stringify(canonical(job))).digest('hex'),digest);
 }
 assert.equal(workflow.on.pull_request,null);
 assert.deepEqual(workflow.on.push,{branches:['main']});
 assert.equal(workflow.on.workflow_call,null);
 assert.deepEqual(workflow.on.workflow_dispatch.inputs.qualification.options,['verify','python-engine-native']);
 assert.equal(workflow.on.workflow_dispatch.inputs.qualification.default,'verify');
 assert.equal(workflow.on.workflow_dispatch.inputs.expected_source.type,'string');
 assert.deepEqual(workflow.permissions,{contents:'read'});
 assert.deepEqual(workflow.concurrency,{group:'verify-${{ github.workflow }}-${{ github.ref }}','cancel-in-progress':true});
});

test('native Python mode bounds the existing two runner types and only builds the engine target',()=>{
 const job=workflow.jobs['python-engine-native'];
 assert.equal(job.if,"${{ github.event_name == 'workflow_dispatch' && inputs.qualification == 'python-engine-native' }}");
 assert.deepEqual(job.strategy,{'fail-fast':false,matrix:{include:[{runner:'ubuntu-24.04',arch:'amd64'},{runner:'ubuntu-24.04-arm',arch:'arm64'}]}});
 assert.equal(job['runs-on'],'${{ matrix.runner }}');
 assert.equal(job['timeout-minutes'],45);
 for(const key of ['permissions','services','container','continue-on-error'])assert.equal(job[key],undefined);
 assert.deepEqual(job.env,{AGENTCI_CONTAINER_ENGINE:'docker',AGENTCI_PYTHON_NATIVE_MODE:'${{ inputs.qualification }}',INPUT_EXPECTED_SOURCE:'${{ inputs.expected_source }}'});
 const source=job.steps.find((step:{id?:string})=>step.id==='source');
 assert.equal(source.run,"node scripts/python-engine-native-acceptance.mjs source '${{ matrix.arch }}'");
 const build=job.steps.find((step:{name?:string})=>step.name?.startsWith('Build only'));
 assert.match(build.run,/docker buildx build --load --provenance=false/);
 assert.match(build.run,/--target eval-engines/);
 assert.doesNotMatch(build.run,/--push|sudo|--privileged|eval-runner|cache-to/);
 assert.equal(build['timeout-minutes'],25);
 assert.equal(job.steps.find((step:{id?:string})=>step.id==='scan').run,'node scripts/python-engine-native-acceptance.mjs scan');
 const runtime=job.steps.find((step:{id?:string})=>step.id==='runtime');
 assert.equal(runtime.run,'node scripts/python-engine-native-acceptance.mjs runtime');
 assert.equal(runtime['timeout-minutes'],6);
 const cleanup=job.steps.find((step:{name?:string})=>step.name?.startsWith('Recover only'));
 assert.equal(cleanup.if,'always()');assert.equal(cleanup['timeout-minutes'],3);
 assert.deepEqual(cleanup.env,{AGENTCI_PYTHON_NATIVE_SCAN_OUTCOME:'${{ steps.scan.outcome }}',AGENTCI_PYTHON_NATIVE_RUNTIME_OUTCOME:'${{ steps.runtime.outcome }}'});
 const upload=job.steps.at(-1);
 assert.equal(upload.if,'always()');assert.equal(upload.with['retention-days'],7);
 assert.equal(upload.with.path,'.agentci/artifacts/eval-engines-native/');
 assert.equal(upload.with['if-no-files-found'],'error');
 assert.ok(job.steps.every((step:{['continue-on-error']?:boolean})=>step['continue-on-error']===undefined));
 assert.doesNotMatch(JSON.stringify(job),/secrets\.|id-token|packages:write|--push|gh release|customer/);
});
