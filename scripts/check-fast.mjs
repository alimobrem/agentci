import { spawn } from 'node:child_process';
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const started = performance.now(), startedAt = new Date().toISOString();
const tests = (await readdir('tests')).filter(name => name.endsWith('.test.ts')).map(name => `tests/${name}`);
const tasks = [
  ['types', ['node_modules/typescript/bin/tsc', '--noEmit']],
  ['tests', ['--import', 'tsx', '--test', ...tests]],
  ['api', ['--import', 'tsx', 'scripts/check-api.ts']],
  ['contract-evals', ['--import', 'tsx', 'scripts/eval-contracts.ts']],
  ['risk-evals', ['--import', 'tsx', 'scripts/eval-review.ts']],
  ['project', ['--import', 'tsx', 'cmd/agentci/main.ts', 'validate']],
  ['status', ['--import', 'tsx', 'scripts/status.ts', '--check']],
  ['delivery', ['--import', 'tsx', 'scripts/delivery.ts', 'check']],
];
// All checks are independent readers; run them concurrently without omitting any.
const results = await Promise.all(tasks.map(([name, args]) => new Promise(resolve => {
  const begin = performance.now(), child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
  child.on('error', error => { output += error.message; });
  child.on('close', (exitCode, signal) => { console.log(`${name}: ${exitCode === 0 ? 'passed' : 'FAILED'} (${((performance.now() - begin) / 1000).toFixed(2)}s)`); if (exitCode !== 0) console.error(output); resolve({ name, command: [process.execPath, ...args], exitCode, signal, seconds: (performance.now() - begin) / 1000, output }); });
})));
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const report = { schemaVersion: 1, startedAt, finishedAt: new Date().toISOString(), sourceCommit, dirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(), node: process.version, platform: process.platform, arch: process.arch, seconds: (performance.now() - started) / 1000, passed: results.every(r => r.exitCode === 0), checks: results };
await mkdir('.agentci/artifacts/delivery', { recursive: true });
await writeFile('.agentci/artifacts/delivery/fast-latest.json', JSON.stringify(report, null, 2) + '\n');
console.log(`Fast feedback: ${report.seconds.toFixed(2)}s; ${results.length} checks. Full integration, compatibility, packaging and release gates remain required.`);
if (!report.passed) process.exitCode = 1;
