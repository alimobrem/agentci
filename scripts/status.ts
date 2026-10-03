import { readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseYaml } from '../packages/project/index.ts';
import { validateDocument } from '../packages/schemas/index.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
interface Entry {
  id: string; title: string; text: string; status: string;
  source: { path: string; section: string; line: number };
  implementation: { status: string; milestone: string; evidence: string[]; notes?: string };
}
const inventory = parseYaml(await readFile(`${root}specs/requirements.yaml`, 'utf8')) as { requirements: Entry[] };
const source = await readFile(`${root}specs/agentci-full-spec.md`, 'utf8');
const ids = new Set<string>();
for (const entry of inventory.requirements) {
  if (!validateDocument('requirement', entry).valid || ids.has(entry.id)) throw new Error(`Invalid inventory entry ${entry.id}`);
  ids.add(entry.id);
  if (!source.split('\n')[entry.source.line - 1]?.trim()) throw new Error(`Missing source line for ${entry.id}`);
  if (['implemented', 'tested'].includes(entry.implementation.status) && !entry.implementation.evidence.length) {
    throw new Error(`Missing implementation evidence for ${entry.id}`);
  }
  for (const evidence of entry.implementation.evidence) await access(`${root}${evidence}`);
}
// Every numbered section must stay represented even if it contains only diagrams/examples.
for (const match of source.matchAll(/^#{1,3} (\d+(?:\.\d+)*)[. ]/gm)) {
  if (!ids.has(`SECTION-${match[1]}`)) throw new Error(`Missing section ${match[1]}`);
}

const escape = (text: string) => text.replaceAll('|', '\\|').replaceAll('\n', ' ');
const lines = [
  '# AgentCI implementation status', '',
  'Source of truth: `specs/requirements.yaml`. Regenerate this view with `npm run status`.', '',
  'Statuses: `not-started`, `in-progress`, `implemented`, `tested`, `deferred`.', '',
  'The inventory conservatively includes every numbered section and every prose/list statement outside fenced examples.',
  'Direct source excerpts receive trace IDs; those IDs do not make explanatory or recommended prose normative.',
  'Such inventory entries remain draft until refined. Explicit M0 build/exit requirements are active; M1 source items track local progress.',
  'A section remains not-started until its entire scope is satisfied; M0 schemas do not complete future product behavior.', '',
  'Milestone assignments outside the build-plan list are planning estimates, not amendments to the specification.', '',
  '| ID | Source section / line | Requirement or source statement | Milestone | Status | Evidence |',
  '| --- | --- | --- | --- | --- | --- |',
];
for (const entry of inventory.requirements) {
  const impl = entry.implementation;
  lines.push(`| ${entry.id} | ${entry.source.section} / ${entry.source.line} | ${escape(entry.text)} | ${impl.milestone} | ${impl.status} | ${impl.evidence.map(escape).join(', ')} |`);
}
const rendered = lines.join('\n') + '\n';
const destination = `${root}specs/implementation-status.md`;
if (process.argv.includes('--check')) {
  if (await readFile(destination, 'utf8') !== rendered) throw new Error('Implementation-status view is stale; run npm run status');
  console.log(`Status current: ${inventory.requirements.length} inventory entries.`);
} else {
  await writeFile(destination, rendered);
  console.log(`Updated ${inventory.requirements.length} inventory entries.`);
}
