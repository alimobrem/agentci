import {readFile} from 'node:fs/promises';
import {validateComparisonRecord} from '../../packages/evals/comparison.ts';
/** Shared synthetic behavioral-regression wire fixture, also consumed by production package smoke. */
export async function comparisonFixture(){
 return validateComparisonRecord(JSON.parse(await readFile(new URL('../../specs/api/fixtures/eval-comparison.json',import.meta.url),'utf8')));
}
