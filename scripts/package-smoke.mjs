import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const archive = resolve(process.argv[2] ?? 'releases/agentci-0.1.0-m0.tgz');
const root = await mkdtemp(join(tmpdir(), 'agentci-package-'));
try {
  execFileSync('npm', ['install', '--offline', '--omit=dev', '--no-audit', '--no-fund', '--prefix', root, archive], { stdio: 'pipe' });
  const cli = join(root, 'node_modules/.bin/agentci');
  const version = execFileSync(cli, ['--version'], { encoding: 'utf8' }).trim();
  if (version !== '0.1.0-m0') throw new Error('Unexpected packaged version');
  await mkdir(join(root, 'project/specs'), { recursive: true });
  await writeFile(join(root, 'project/agentci.yaml'), `apiVersion: agentci.io/v1alpha1
kind: AgentProject
metadata: { name: package-smoke }
spec:
  source: { defaultBranch: main }
  specifications: { include: [specs/*.yaml] }
  implementation: { include: [src/**] }
  evals: { include: [evals/**] }
  policies: { include: [policies/**] }
  prompts: { include: [prompts/**] }
  models: { allowedProviders: [openai], defaultRoute: standard }
  ci: { provider: auto }
  telemetry: { protocol: otlp, contentCapture: metadata-only }
  review: { requiredCheckName: agentci/review }
`);
  await writeFile(join(root, 'project/specs/requirements.yaml'), `id: SMOKE-1
title: Clean install
type: functional
status: active
text: Packaged CLI validates a fresh project.
`);
  const result = JSON.parse(execFileSync(cli, ['validate', '--root', join(root, 'project'), '--json'], { encoding: 'utf8' }));
  if (!result.valid || result.requirements !== 1) throw new Error('Fresh project validation failed');
  await writeFile(join(root, 'project/specs/requirements.yaml'), 'id: BROKEN\n');
  try {
    execFileSync(cli, ['validate', '--root', join(root, 'project')], { stdio: 'pipe' });
    throw new Error('Invalid project unexpectedly passed');
  } catch (error) { if (error.status !== 1) throw error; }
  console.log('Packaged CLI passed: clean production-only install, version, valid project, invalid project exit code.');
} finally { await rm(root, { recursive: true, force: true }); }
