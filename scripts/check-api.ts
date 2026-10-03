import SwaggerParser from '@apidevtools/swagger-parser';
import { readFile, access } from 'node:fs/promises';
import { parse } from 'yaml';
import { deepStrictEqual, strictEqual } from 'node:assert';
import { VERSION } from '../packages/version.ts';
await SwaggerParser.validate(new URL('../specs/api/openapi.json', import.meta.url).pathname);
const contract = JSON.parse(await readFile(new URL('../specs/api/openapi.json', import.meta.url), 'utf8'));
const { $schema, ...analysis } = JSON.parse(await readFile(new URL('../packages/review/analysis.schema.json', import.meta.url), 'utf8'));
deepStrictEqual(contract.components.schemas.Analysis, analysis, 'API and domain analysis schemas must not drift');
const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
const shrinkwrap = JSON.parse(await readFile(new URL('../npm-shrinkwrap.json', import.meta.url), 'utf8'));
deepStrictEqual(shrinkwrap, lock, 'Distributed npm dependency lock must match the source lock');
const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
strictEqual(VERSION, manifest.version); strictEqual(contract.info.version, VERSION);
const inventory = parse(await readFile(new URL('../specs/requirements.yaml', import.meta.url), 'utf8'));
const requirementIds = new Set(inventory.requirements.map((r: any) => r.id));
const coverage = JSON.parse(await readFile(new URL('../specs/api/operations.json', import.meta.url), 'utf8'));
const covered = new Set<string>();
for (const operation of coverage.operations) {
  const id = `${operation.method} ${operation.path}`;
  if (covered.has(id)) throw new Error(`Duplicate API coverage ${id}`); covered.add(id);
  strictEqual(contract.paths[operation.path]?.[operation.method]?.operationId, operation.operationId);
  if (!operation.requirementIds.length || !operation.tests.length || !operation.scenarios.length || operation.requirementIds.some((r: string) => !requirementIds.has(r))) throw new Error(`Incomplete API coverage ${id}`);
  for (const path of operation.tests) await access(new URL(`../${path}`, import.meta.url));
}
for (const [path, item] of Object.entries(contract.paths)) for (const method of Object.keys(item as object)) if (['get','post','put','patch','delete','head','options'].includes(method) && !covered.has(`${method} ${path}`)) throw new Error(`Unmapped API operation ${method} ${path}`);
console.log('M1 OpenAPI contract valid');
