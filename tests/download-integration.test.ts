import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
// @ts-expect-error Repository acceptance script has no declaration file.
import { validateCoverage } from '../scripts/download-integration-reporter.mjs';
const files = ['one', 'two'].map(file => resolve(file));
const summary = (file?: string, tests = 1) => ({ file, success: true, counts: { tests, passed: tests, failed: 0, skipped: 0, cancelled: 0, todo: 0 } });
test('download acceptance requires every source suite and a coherent terminal summary', () => {
  const reports = [summary(files[0]), summary(files[1]), summary(undefined, 2)];
  assert.deepEqual(validateCoverage(files, reports), { tests: 2, suites: 2 });
  for (const reports of [[summary(files[0]), summary(undefined)], [summary(files[0]), summary(files[1])], [summary(files[0]), summary(files[1]), summary(undefined, 3)], [summary(files[0]), summary(files[0]), summary(files[1]), summary(undefined, 3)], [summary(resolve('other')), summary(files[1]), summary(undefined, 2)]]) assert.throws(() => validateCoverage(files, reports));
  for (const key of ['failed', 'skipped', 'cancelled', 'todo']) {
    const broken = structuredClone(reports); broken[0]!.counts[key as keyof typeof broken[0]['counts']] = 1;
    assert.throws(() => validateCoverage(files, broken));
  }
  const broken = structuredClone(reports); broken[0]!.success = false; assert.throws(() => validateCoverage(files, broken));
  assert.throws(() => validateCoverage([], []));
});

test('real Node reporter rejects missing, skipped, failed and cancelled source suites', async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const root = await mkdtemp(join(tmpdir(), 'agentci-download-reporter-'));
  const reporter = resolve('scripts/download-integration-reporter.mjs');
  try {
    await mkdir(join(root, 'tests/integration'), { recursive: true });
    const first = join(root, 'tests/integration/first.test.ts'), second = join(root, 'tests/integration/second.test.ts');
    const passing = "import test from 'node:test';test('passes',()=>{});\n";
    await writeFile(first, passing); await writeFile(second, passing);
    const childEnv = { ...process.env }; delete childEnv.NODE_TEST_CONTEXT;
    const run = (files: string[]) => spawnSync(process.execPath, ['--test', '--test-reporter=' + reporter, ...files], { cwd: root, env: childEnv, encoding: 'utf8', timeout: 15000 });
    const ok = run([first, second]); assert.equal(ok.status, 0, ok.stderr);
    assert.equal(JSON.parse(ok.stdout).suites, 2); assert.equal(JSON.parse(ok.stdout).inputs.length, 2);
    assert.notEqual(run([first]).status, 0);
    for (const body of ["test('skipped',{skip:true},()=>{});", "test('failure',()=>{throw Error('expected failure');});", "test('cancelled',{timeout:5},async()=>new Promise(()=>{}));"]) {
      await writeFile(second, "import test from 'node:test';" + body); assert.notEqual(run([first, second]).status, 0);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
