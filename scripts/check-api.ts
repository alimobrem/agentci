import SwaggerParser from '@apidevtools/swagger-parser';
import { readFile, access } from 'node:fs/promises';
import { parse } from 'yaml';
import { deepStrictEqual, strictEqual } from 'node:assert';
import { VERSION } from '../packages/version.ts';
import {evalOpenApiSchema} from '../packages/evals/openapi.ts';
import {validateComparisonRecord} from '../packages/evals/comparison.ts';
import {validateExportFrame} from '../packages/evals/export.ts';
await SwaggerParser.validate(new URL('../specs/api/openapi.json', import.meta.url).pathname);
const contract = JSON.parse(await readFile(new URL('../specs/api/openapi.json', import.meta.url), 'utf8'));
const { $schema, ...analysis } = JSON.parse(await readFile(new URL('../packages/review/analysis.schema.json', import.meta.url), 'utf8'));
deepStrictEqual(contract.components.schemas.Analysis, analysis, 'API and domain analysis schemas must not drift');
deepStrictEqual(contract.components.schemas.EvalComparison,evalOpenApiSchema(JSON.parse(await readFile(new URL('../packages/evals/json/eval-comparison.schema.json',import.meta.url),'utf8'))),'API and domain comparison schemas must not drift');
validateComparisonRecord(JSON.parse(await readFile(new URL('../specs/api/fixtures/eval-comparison.json',import.meta.url),'utf8')));
deepStrictEqual(contract.components.schemas.EvalExportFrame,evalOpenApiSchema(JSON.parse(await readFile(new URL('../packages/evals/json/eval-export-frame.schema.json',import.meta.url),'utf8'))),'API and domain export-frame schemas must not drift');
let previous='sha256:'+'0'.repeat(64),sequence=0;
for(const line of (await readFile(new URL('../specs/api/fixtures/eval-comparison-export.ndjson',import.meta.url),'utf8')).trim().split('\n')){const frame=validateExportFrame(JSON.parse(line),sequence++,previous);previous=frame.digest;}
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
console.log('OpenAPI contract valid');

const preflightCoverage=JSON.parse(await readFile(new URL('../specs/api/preflight-operations.json',import.meta.url),'utf8'));
for(const operation of preflightCoverage.operations){
 if(operation.operationId!=='preflightPrerequisites'||!operation.command||!operation.requirementIds.length||!operation.tests.length||!operation.scenarios.length||operation.requirementIds.some((id:string)=>!requirementIds.has(id)))throw new Error('Incomplete preflight operation coverage');
 for(const path of operation.tests)await access(new URL(`../${path}`,import.meta.url));
}
strictEqual(preflightCoverage.operations.length,1);

const providerCoverage=JSON.parse(await readFile(new URL('../specs/api/provider-operations.json',import.meta.url),'utf8'));
const providerOperations=new Set(['validateModelRequest','assertProviderCapabilities','validateModelResponse','invokeModel','streamModel','PostgresBudgetLedger']);
for(const operation of providerCoverage.operations){
 if(!providerOperations.delete(operation.operationId)||!operation.requirementIds.length||!operation.tests.length||!operation.scenarios.length||operation.requirementIds.some((id:string)=>!requirementIds.has(id)))throw new Error('Incomplete provider operation coverage');
 for(const path of operation.tests)await access(new URL(`../${path}`,import.meta.url));
}
strictEqual(providerOperations.size,0,'Every provider operation needs acceptance coverage');
const {validateModelRequest}=await import('../packages/providers/request.ts');
validateModelRequest(JSON.parse(await readFile(new URL('../specs/api/fixtures/model-request.json',import.meta.url),'utf8')));

const reviewerCoverage=JSON.parse(await readFile(new URL('../specs/api/reviewer-operations.json',import.meta.url),'utf8'));
const reviewerOperations=new Set(['reviewerInstructions','createIndependencePolicy','buildReviewContext','prepareReviewerRequest','createReviewerExecutor','validateReviewerResult','ReviewerResultStore','createPersistentReviewer']);
for(const operation of reviewerCoverage.operations){
 if(!reviewerOperations.delete(operation.operationId)||!operation.requirementIds.length||!operation.tests.length||!operation.scenarios.length||operation.requirementIds.some((id:string)=>!requirementIds.has(id)))throw new Error('Incomplete reviewer operation coverage');
 for(const path of operation.tests)await access(new URL(`../${path}`,import.meta.url));
}
strictEqual(reviewerOperations.size,0,'Every reviewer operation needs acceptance coverage');

const {validateReviewerResult}=await import('../packages/reviewers/result.ts');
const reviewerFixture=JSON.parse(await readFile(new URL('../specs/api/fixtures/reviewer-result.json',import.meta.url),'utf8'));
validateReviewerResult(reviewerFixture,reviewerFixture.subject);
