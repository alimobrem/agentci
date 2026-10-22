import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parse} from 'yaml';

const workflow=parse(await readFile('.github/workflows/dashboard-native.yaml','utf8'));
const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>[key,canonical(value)])):value;

test('manual diagnostics preserve the existing dashboard job and ordinary trigger behavior',()=>{
 const {if:guard,...native}=workflow.jobs.native;
 assert.equal(guard,"${{ github.event_name != 'workflow_dispatch' || inputs.qualification != 'eval-storage-diagnostic' }}");
 // Canonical semantic job hash at reviewed parent16f77f5; source changes must not hide a dashboard regression.
 assert.equal(createHash('sha256').update(JSON.stringify(canonical(native))).digest('hex'),'f3f283222e0737b0719db303145dea082ef69d060847c7351e947f0a125a5957');
 assert.deepEqual(workflow.on.workflow_dispatch.inputs.qualification.options,['dashboard','eval-storage-diagnostic']);
 assert.equal(workflow.on.workflow_dispatch.inputs.qualification.default,'dashboard');
 assert.equal(workflow.on.workflow_dispatch.inputs.expected_source.type,'string');
 assert.deepEqual(workflow.permissions,{contents:'read'});
 assert.equal(workflow.concurrency['cancel-in-progress'],false);
});

test('storage diagnosis uses only the existing native runner classes and local worker build',()=>{
 const job=workflow.jobs['eval-storage-diagnostic'];
 assert.equal(job.if,"${{ github.event_name == 'workflow_dispatch' && inputs.qualification == 'eval-storage-diagnostic' }}");
 assert.deepEqual(job.strategy,workflow.jobs.native.strategy);
 assert.equal(job['runs-on'],workflow.jobs.native['runs-on']);
 assert.equal(job['timeout-minutes'],45);
 assert.equal(job.permissions,undefined);
 assert.equal(job.services,undefined);
 assert.equal(job.container,undefined);
 assert.deepEqual(job.env,{AGENTCI_CONTAINER_ENGINE:'docker',AGENTCI_STORAGE_MODE:'${{ inputs.qualification }}',INPUT_EXPECTED_SOURCE:'${{ inputs.expected_source }}'});
 const build=job.steps.find((step:{name?:string})=>step.name?.startsWith('Build only'));
 assert.match(build.run,/docker buildx build --load --provenance=false/);
 assert.match(build.run,/--target eval-worker/);
 assert.doesNotMatch(build.run,/--push|sudo|--privileged|eval-runner|cache-to/);
 assert.equal(build['timeout-minutes'],25);
 assert.equal(job.steps.find((step:{id?:string})=>step.id==='diagnose').run,'node scripts/eval-worker-native-storage-diagnostic.mjs diagnose');
 const cleanup=job.steps.find((step:{name?:string})=>step.name?.startsWith('Recover only'));
 assert.equal(cleanup.if,'always()');assert.equal(cleanup['timeout-minutes'],3);
 const upload=job.steps.at(-1);
 assert.equal(upload.if,'always()');assert.equal(upload.with['retention-days'],7);
 assert.equal(upload.with.path,'.agentci/artifacts/eval-worker-native-storage-diagnostic/');
 assert.equal(upload.with['if-no-files-found'],'error');
 assert.doesNotMatch(JSON.stringify(job),/secrets\.|id-token|packages:write|workflow_dispatch.*customer/);
});
