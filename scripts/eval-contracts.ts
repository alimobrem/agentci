import { readFile } from 'node:fs/promises';
import { parseYaml } from '../packages/project/index.ts';
import { schemaNames, validateDocument, type SchemaName } from '../packages/schemas/index.ts';

const corpus: any = parseYaml(await readFile(new URL('../evals/contracts.yaml', import.meta.url), 'utf8'));
const results = [];
const ids = new Set<string>();
if (!Array.isArray(corpus.scenarios) || !corpus.scenarios.length) throw new Error('Empty contract corpus');
for (const scenario of corpus.scenarios) {
  if (!schemaNames.includes(scenario.schema) || typeof scenario.expectedValid !== 'boolean' || ids.has(scenario.id)) {
    throw new Error('Invalid contract scenario');
  }
  ids.add(scenario.id);
  const actual = validateDocument(scenario.schema as SchemaName, scenario.document).valid;
  results.push({ id: scenario.id, passed: actual === scenario.expectedValid });
}
const passed = results.filter(result => result.passed).length;
console.log(JSON.stringify({ kind: 'deterministic-contract', total: results.length, passed, failed: results.length - passed, results }, null, 2));
process.exitCode = passed === results.length ? 0 : 1;
