import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
const root = await mkdtemp(join(tmpdir(), 'agentci-m1-demo-'));
const cli = new URL('../dist/cmd/agentci/main.js', import.meta.url).pathname;
const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
const commit = message => { git('add', '.'); git('-c', 'user.name=Demo', '-c', 'user.email=demo@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', message); return git('rev-parse', 'HEAD'); };
try {
  const config = parse(await readFile(new URL('../agentci.yaml', import.meta.url), 'utf8'));
  config.spec.specifications.include = ['specs/**'];
  config.spec.extensions = { 'agentci.io/review': { permissions: ['permissions/**'] } };
  for (const directory of ['specs', 'permissions']) await mkdir(join(root, directory));
  await writeFile(join(root, 'agentci.yaml'), stringify(config));
  const requirement = { id: 'SAFE-1', title: 'Production approval', type: 'safety', status: 'active', text: 'Production changes require approval.' };
  await writeFile(join(root, 'specs/safety.yaml'), stringify(requirement));
  git('init', '-q'); const base = commit('Require approval');
  await writeFile(join(root, 'specs/safety.yaml'), stringify({ ...requirement, text: 'Production changes may bypass approval.' }));
  await writeFile(join(root, 'permissions/deploy.yaml'), stringify({ apiVersion: 'agentci.io/v1alpha1', kind: 'PermissionManifest', permissions: [{ id: 'deploy', environment: 'production', actions: ['write'], resources: ['cluster'] }] }));
  const head = commit('Add production write and change approval');
  const args = ['diff', '--root', root, '--base', base, '--head', head, '--repository', 'example/demo'];
  const analysis = JSON.parse(execFileSync('node', [cli, ...args], { encoding: 'utf8' }));
  if (analysis.risk !== 'high' || !analysis.findings.some(f => f.rule === 'production-mutation-added' && f.verification === 'verified')) throw new Error('Demo acceptance failed');
  console.log('LOCAL M1 PREVIEW — synthetic Git repository, compiled CLI; no live GitHub App/check or milestone completion claimed.');
  console.log(JSON.stringify({ input: { base, head, changes: ['production write added', 'active safety requirement text changed'] }, output: { risk: analysis.risk, advisory: analysis.advisory, findings: analysis.findings.map(({ rule, verification, claim }) => ({ rule, verification, claim })), evals: analysis.evals } }, null, 2));
  await writeFile(join(root, 'permissions/deploy.yaml'), 'permissions: [unterminated');
  const broken = commit('Malformed permission input');
  try { execFileSync('node', [cli, 'diff', '--root', root, '--base', head, '--head', broken, '--repository', 'example/demo'], { stdio: 'pipe' }); throw new Error('Broken input unexpectedly passed'); }
  catch (error) { if (error.status !== 2) throw error; console.log('Failure case: malformed permission YAML exits 2; it does not produce a clean review.'); }
} finally { await rm(root, { recursive: true, force: true }); }
