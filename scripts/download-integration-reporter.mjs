import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

export function validateCoverage(expected, summaries) {
  if (!expected.length || new Set(expected).size !== expected.length) throw new Error('Nonempty unique source suite manifest required');
  const byFile = new Map(); let total;
  for (const report of summaries) {
    const c = report.counts;
    if (!report.success || !c || !Number.isSafeInteger(c.tests) || c.tests < 1 || c.passed !== c.tests || ['failed', 'skipped', 'cancelled', 'todo'].some(key => c[key] !== 0)) throw new Error('Every test must pass without failure, cancellation, skip or todo');
    if (report.file) {
      const file = resolve(report.file);
      if (!expected.includes(file) || byFile.has(file)) throw new Error('Unexpected or duplicate suite summary');
      byFile.set(file, c.tests);
    } else {
      if (total !== undefined) throw new Error('Duplicate final summary');
      total = c.tests;
    }
  }
  if (expected.some(file => !byFile.has(file)) || total !== [...byFile.values()].reduce((sum, count) => sum + count, 0)) throw new Error('Incomplete source suite coverage or final summary');
  return { tests: total, suites: byFile.size };
}

export default async function* report(source) {
  const files = readdirSync('tests/integration').filter(file => file.endsWith('.test.ts')).sort().map(file => resolve('tests/integration', file));
  const inputs = files.map(file => ({ file, sha256: createHash('sha256').update(readFileSync(file)).digest('hex') }));
  const summaries = [];
  for await (const event of source) if (event.type === 'test:summary') summaries.push(event.data);
  const coverage = validateCoverage(files, summaries);
  for (const input of inputs) if (createHash('sha256').update(readFileSync(input.file)).digest('hex') !== input.sha256) throw new Error('Suite source changed during acceptance');
  yield JSON.stringify({ runId: process.env.GITHUB_RUN_ID ?? null, attempt: process.env.GITHUB_RUN_ATTEMPT ?? null, sourceCommit: process.env.RELEASE_SOURCE ?? null, acceptanceCommit: process.env.ACCEPTANCE_SOURCE ?? null, ...coverage, inputs, summaries }, null, 2) + '\n';
}
