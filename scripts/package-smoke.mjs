import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const expectedVersion = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;
const arguments_ = process.argv.slice(2);
const offline = arguments_.includes('--offline');
const archive = resolve(arguments_.find(argument => !argument.startsWith('--')) ?? `releases/agentci-${expectedVersion}.tgz`);
const root = await mkdtemp(join(tmpdir(), 'agentci-package-'));
try {
  execFileSync('npm', ['install', ...(offline ? ['--offline'] : []), '--omit=dev', '--no-audit', '--no-fund', '--prefix', root, archive], { stdio: 'pipe' });
  const cli = join(root, 'node_modules/.bin/agentci');
  const version = execFileSync(cli, ['--version'], { encoding: 'utf8' }).trim();
  if (version !== expectedVersion) throw new Error('Unexpected packaged version');
  const fresh = join(root, 'fresh-project');
  execFileSync(cli, ['init', '--root', fresh], { stdio: 'pipe' });
  const freshResult = JSON.parse(execFileSync(cli, ['validate', '--root', fresh, '--json'], { encoding: 'utf8' }));
  if (!freshResult.valid || freshResult.requirements !== 1) throw new Error('Installed initializer produced invalid project');
  try { execFileSync(cli, ['init', '--root', fresh], { stdio: 'pipe' }); throw new Error('Initializer overwrote existing project'); } catch (error) { if (error.status !== 2) throw error; }
  execFileSync(process.execPath, ['--input-type=module', '-e', "import {AgentCIClient} from 'agentci/client';new AgentCIClient({url:'http://127.0.0.1:3000',token:'x'.repeat(32)});"], { cwd: root, stdio: 'pipe' });
  if (!(await readFile(join(root, 'node_modules/agentci/LICENSE'), 'utf8')).includes('MIT License')) throw new Error('Package license missing');
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
  console.log('Packaged CLI/client passed: production-only install, version, fresh init, overwrite rejection, client entry point, MIT license, validation and invalid input.');
} finally { await rm(root, { recursive: true, force: true }); }
