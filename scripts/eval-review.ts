import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { stringify } from 'yaml';
import { parseYaml } from '../packages/project/index.ts';
import { analyze } from '../packages/review/engine.ts';
const corpus = parseYaml(await readFile(new URL('../evals/m1-semantic.yaml', import.meta.url), 'utf8')) as any;
const config = parseYaml(await readFile(new URL('../agentci.yaml', import.meta.url), 'utf8')) as any;
config.spec.specifications.include = ['specs/**'];
config.spec.extensions = { 'agentci.io/review': { tools: ['tools/**'], permissions: ['permissions/**'], modelConfigs: ['models/**'] } };
for (const scenario of corpus.scenarios) {
  const base = { sha: 'a'.repeat(40), files: { 'agentci.yaml': stringify(config), 'specs/overview.md': 'Example spec.', ...scenario.base } };
  const head = { sha: 'b'.repeat(40), files: { 'agentci.yaml': stringify(config), 'specs/overview.md': 'Example spec.', ...scenario.head } };
  if (scenario.expectFailure) assert.throws(() => analyze({ repository: 'example/repo', base, head }), scenario.id);
  else {
    const result = analyze({ repository: 'example/repo', base, head });
    assert.equal(result.risk, scenario.risk, scenario.id);
    for (const category of scenario.categories ?? []) assert(result.changes.some(change => change.categories.includes(category)), `${scenario.id}: ${category}`);
    for (const rule of scenario.verifiedRules ?? []) assert(result.findings.some(finding => finding.rule === rule && finding.verification === 'verified'), `${scenario.id}: ${rule}`);
  }
}
console.log(`M1 deterministic risk corpus ${corpus.revision}: ${corpus.scenarios.length} passed; threshold 100%; no behavioral/model verification claimed.`);
