import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { stringify } from 'yaml';
import { parseYaml, validateProject } from '../packages/project/index.ts';
import { evalSuite } from './fixtures/evals.ts';

const project: any = parseYaml(readFileSync(new URL('../agentci.yaml', import.meta.url), 'utf8'));
const req = { id: 'SAFETY-1', title: 'Approval', type: 'safety', status: 'active', text: 'Require approval.' };
async function fixture(t: any) {
  const root = await mkdtemp(join(tmpdir(), 'agentci-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'specs'));
  await writeFile(join(root, 'agentci.yaml'), stringify(project));
  await writeFile(join(root, 'specs/requirements.yaml'), stringify({ requirements: [req] }));
  return root;
}
test('AgentCI validates its own repository', async () => {
  const result = await validateProject(new URL('../', import.meta.url).pathname);
  assert.deepEqual(result.errors, []);
  assert.ok(result.requirements > 100);
});
test('YAML parser rejects duplicate keys', () => assert.throws(() => parseYaml('name: first\nname: second\n')));
test('missing project config fails validation', async t => {
  const root = await fixture(t);
  await rm(join(root, 'agentci.yaml'));
  assert.equal((await validateProject(root)).valid, false);
});
test('invalid requirement is reported with its file', async t => {
  const root = await fixture(t);
  await writeFile(join(root, 'specs/requirements.yaml'), stringify({ requirements: [{ ...req, type: 'wrong' }] }));
  const result = await validateProject(root);
  assert.equal(result.valid, false);
  assert.equal(result.errors[0]?.file, 'specs/requirements.yaml');
});
test('duplicate requirement IDs fail across files', async t => {
  const root = await fixture(t);
  const config = structuredClone(project);
  config.spec.specifications.include = ['specs/**'];
  await writeFile(join(root, 'agentci.yaml'), stringify(config));
  await writeFile(join(root, 'specs/second.yaml'), stringify(req));
  assert.match((await validateProject(root)).errors.map(e => e.message).join('\n'), /Duplicate requirement ID/);
});
test('explicit Markdown front matter is validated', async t => {
  const root = await fixture(t);
  await writeFile(join(root, 'specs/agentci-full-spec.md'), `---\n${stringify({ ...req, id: 'DOC-1' })}---\nBody\n`);
  assert.equal((await validateProject(root)).requirements, 2);
});
test('missing specification matches cannot pass', async t => {
  const root = await fixture(t);
  await rm(join(root, 'specs/requirements.yaml'));
  assert.equal((await validateProject(root)).valid, false);
});
test('malformed eval YAML is not a success', async t => {
  const root = await fixture(t);
  await mkdir(join(root, 'evals'));
  await writeFile(join(root, 'evals/bad.yaml'), 'suite: [\n');
  assert.equal((await validateProject(root)).valid, false);
});
test('project validates M2 manifests and rejects missing requirement mappings and duplicate suites', async t => {
  const root=await fixture(t);await mkdir(join(root,'evals'));
  const suite=evalSuite({requirements:['SAFETY-1']});
  await writeFile(join(root,'evals/behavior.yaml'),stringify(suite));
  assert.equal((await validateProject(root)).valid,true);
  await writeFile(join(root,'evals/duplicate.yaml'),stringify(suite));
  assert.match((await validateProject(root)).errors.map(e=>e.message).join('\n'),/Duplicate suite/);
  await rm(join(root,'evals/duplicate.yaml'));
  suite.spec.requirements=['MISSING'];await writeFile(join(root,'evals/behavior.yaml'),stringify(suite));
  assert.match((await validateProject(root)).errors[0]!.message,/unknown requirement/);
  await writeFile(join(root,'evals/behavior.yaml'),stringify({...suite,kind:'EvalSuite',unsupported:'field'}));
  assert.match((await validateProject(root)).errors[0]!.message,/Invalid EvalSuite/);
});
test('include paths cannot escape the project', async t => {
  const root = await fixture(t);
  const config = structuredClone(project);
  config.spec.specifications.include = ['../outside.yaml'];
  await writeFile(join(root, 'agentci.yaml'), stringify(config));
  assert.match((await validateProject(root)).errors[0]!.message, /Unsafe/);
});
test('symlinked specification outside project is rejected', async t => {
  const root = await fixture(t);
  const outside = await mkdtemp(join(tmpdir(), 'agentci-external-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(join(outside, 'requirements.yaml'), stringify(req));
  await rm(join(root, 'specs/requirements.yaml'));
  await symlink(join(outside, 'requirements.yaml'), join(root, 'specs/requirements.yaml'));
  assert.equal((await validateProject(root)).valid, false);
});
