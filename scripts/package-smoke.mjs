import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';

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
  const listener = createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
  const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
  const deployment = join(root, 'deployment'); await mkdir(deployment, { mode: 0o700 });
  const setup = spawn(cli, ['setup'], { cwd: deployment, env: { ...process.env, AGENTCI_SETUP_REPOSITORY: 'customer/new-project', AGENTCI_SETUP_ACCOUNT_TYPE: 'organization', AGENTCI_SETUP_APP_NAME: 'AgentCI-customer-test', AGENTCI_SETUP_URL: 'https://customer.example.com', AGENTCI_SETUP_PORT: String(port), AGENTCI_SETUP_TEMPORAL_UI_PORT: String(port === 8233 ? 8234 : 8233) }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const [output] = await once(setup.stdout, 'data', { signal: AbortSignal.timeout(15_000) });
    const setupUrl = new URL(output.toString().trim());
    const response = await fetch(`http://127.0.0.1:${port}${setupUrl.pathname}${setupUrl.search}`);
    const page = await response.text();
    if (response.status !== 200 || !page.includes('https://github.com/organizations/customer/settings/apps/new?state=') || !page.includes('Install only on customer/new-project')) throw new Error('Installed customer setup flow failed');
    const invalidState = await fetch(`http://127.0.0.1:${port}/setup/github/callback?state=invalid&code=${'a'.repeat(20)}`);
    if (invalidState.status !== 403) throw new Error('Invalid setup state accepted');
  } finally { const exited = setup.exitCode !== null || setup.signalCode !== null ? Promise.resolve() : once(setup, 'exit'); setup.kill('SIGTERM'); await exited; }

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
  console.log('Packaged CLI/client passed: production-only install, version, fresh init, overwrite rejection, client entry point, MIT license, installed App setup/state rejection, validation and invalid input.');
} finally { await rm(root, { recursive: true, force: true }); }
