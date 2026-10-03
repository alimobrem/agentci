import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { analyze, canonical, digest } from '../packages/review/engine.ts';
import { gitSnapshot } from '../packages/review/git.ts';
import { parseYaml } from '../packages/project/index.ts';
import { stringify } from 'yaml';
const config = parseYaml(readFileSync(new URL('../agentci.yaml', import.meta.url), 'utf8')) as any;
config.spec.specifications.include = ['specs/**'];
config.spec.extensions = { 'agentci.io/review': { permissions: ['permissions/**'], tools: ['tools/**'], modelConfigs: ['models/**'] } };
const manifest = stringify(config);
const sha = (char: string) => char.repeat(40);
const run = (base: Record<string, string>, head: Record<string, string>) => analyze({ repository: 'example/repo', base: { sha: sha('a'), files: { 'agentci.yaml': manifest, 'specs/overview.md': 'Example spec.', ...base } }, head: { sha: sha('b'), files: { 'agentci.yaml': manifest, 'specs/overview.md': 'Example spec.', ...head } } });

test('semantic categories cover each M1 surface including removals', () => {
  const result = run({ 'prompts/old.md': 'old' }, { 'specs/product.md': 'new spec', 'tools/action.yaml': 'name: restart', 'permissions/rbac.yaml': 'name: role', 'models/route.json': '{"model":"new"}', 'policies/rules.yaml': 'allow: false', 'package.json': '{"dependencies":{"example":"1"}}', 'specs/api/openapi.json': '{"openapi":"3.0.3"}' });
  for (const category of ['specification', 'tool', 'permission', 'model', 'policy', 'dependency', 'prompt', 'api']) assert(result.changes.some(change => change.categories.includes(category as any)), category);
  assert.equal(result.changes.find(change => change.path === 'prompts/old.md')?.operation, 'removed');
  assert.equal(result.risk, 'high'); assert.equal(result.advisory, true);
});
test('structured diff distinguishes absent and null, escapes pointers, and never embeds content', () => {
  const result = run({ 'models/route.json': '{"secret":"never-expose-this"}' }, { 'models/route.json': '{"secret":"different-secret","a/b":null}' });
  const change = result.changes[0]!;
  assert(change.fields.some(field => field.pointer === '/a~1b' && field.operation === 'added'));
  assert(!JSON.stringify(result).includes('never-expose-this'));
  assert(!JSON.stringify(result).includes('different-secret'));
  assert.equal(change.beforeDigest, digest('{"secret":"never-expose-this"}'));
});
test('production writes and secret reads produce verified findings without any model', () => {
  const result = run({}, { 'permissions/role.yaml': stringify({ apiVersion: 'agentci.io/v1alpha1', kind: 'PermissionManifest', permissions: [{ id: 'role', environment: 'production', actions: ['write', 'read'], resources: ['cluster', 'secrets'] }] }) });
  for (const rule of ['production-mutation-added', 'secret-read-added']) assert(result.findings.some(f => f.rule === rule && f.verification === 'verified'));
  assert.equal(result.risk, 'high');
});
test('narrowing existing explicit access does not assert a new production permission', () => {
  const permission = (actions: string[]) => stringify({ apiVersion: 'agentci.io/v1alpha1', kind: 'PermissionManifest', permissions: [{ id: 'role', environment: 'production', actions, resources: ['cluster'] }] });
  const result = run({ 'permissions/role.yaml': permission(['read', 'write']) }, { 'permissions/role.yaml': permission(['read']) });
  assert(!result.findings.some(f => f.rule === 'production-mutation-added'));
});
test('active safety requirement removal is verified high risk; text edits remain inferred', () => {
  const requirement = { id: 'SAFE-1', title: 'Approval', type: 'safety', status: 'active', text: 'Approval is required.' };
  const before = { 'specs/safety.yaml': stringify(requirement) };
  assert(run(before, {}).findings.some(f => f.rule === 'active-safety-requirement-change' && f.verification === 'verified' && f.requirementId === 'SAFE-1'));
  assert(run(before, { 'specs/safety.yaml': stringify({ ...requirement, text: 'Approval is optional.' }) }).findings.some(f => f.verification === 'inferred'));
});
test('changing selectors cannot hide removal of an active safety requirement', () => {
  const head = structuredClone(config); head.spec.specifications.include = ['other/**'];
  const result = run({ 'specs/safety.yaml': stringify({ id: 'SAFE-1', title: 'Approval', type: 'security', status: 'active', text: 'Require approval.' }) }, { 'agentci.yaml': stringify(head), 'other/product.md': 'Example spec.', 'specs/safety.yaml': stringify({ id: 'SAFE-1', title: 'Approval', type: 'security', status: 'active', text: 'Require approval.' }) });
  assert(result.findings.some(f => f.rule === 'active-safety-requirement-change'));
});
test('missing specifications are an input failure, not a clean advisory result', () => {
  assert.throws(() => analyze({ repository: 'example/repo', base: { sha: sha('a'), files: { 'agentci.yaml': manifest } }, head: { sha: sha('b'), files: { 'agentci.yaml': manifest } } }), /No specification/);
});
test('malformed data, duplicate IDs, path escapes and unsafe selectors fail rather than report clean', () => {
  assert.throws(() => run({}, { 'models/route.json': '{' }), /Malformed/);
  assert.throws(() => run({}, { '../escape': 'text' }), /Unsafe/);
  const unsafe = structuredClone(config); unsafe.spec.prompts.include = ['../**'];
  assert.throws(() => run({}, { 'agentci.yaml': stringify(unsafe) }), /Unsafe/);
  const requirement = stringify({ id: 'REQ-1', title: 'Same', type: 'functional', status: 'active', text: 'One.' });
  assert.throws(() => run({}, { 'specs/one.yaml': requirement, 'specs/two.yaml': requirement }), /Duplicate/);
});
test('outputs are deterministic regardless of file insertion order', () => {
  assert.equal(canonical(run({}, { 'prompts/b.md': 'b', 'prompts/a.md': 'a' })), canonical(run({}, { 'prompts/a.md': 'a', 'prompts/b.md': 'b' })));
});
test('Git reader resolves exact commits and does not execute checked-in scripts or working-tree changes', async t => {
  const root = await mkdtemp(join(tmpdir(), 'agentci-git-')); t.after(() => rm(root, { recursive: true, force: true }));
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  git('init', '-q'); await writeFile(join(root, 'agentci.yaml'), manifest); await writeFile(join(root, 'danger.sh'), 'exit 99');
  git('add', '.'); git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture');
  const committed = git('rev-parse', 'HEAD'); await writeFile(join(root, 'danger.sh'), 'changed outside commit');
  const snapshot = await gitSnapshot(root, 'HEAD'); assert.equal(snapshot.sha, committed); assert.equal(snapshot.files['danger.sh'], 'exit 99');
  await assert.rejects(gitSnapshot(root, '--upload-pack=bad'), /Unsafe/);
});
