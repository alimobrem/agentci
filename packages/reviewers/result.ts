import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {Ajv} from 'ajv';
import type {FormatsPlugin} from 'ajv-formats';
import {canonical, digest} from '../review/engine.ts';
import type {createReviewerExecutor} from './execute.ts';
import type {ReviewSubject} from './context.ts';

export type ReviewerResult = Awaited<ReturnType<ReturnType<typeof createReviewerExecutor>>>;
export const reviewerResultSchema = JSON.parse(readFileSync(new URL('./json/reviewer-result.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv({strict: true, allErrors: false});
const addFormats: FormatsPlugin = createRequire(import.meta.url)('ajv-formats'); addFormats(ajv);
const validate = ajv.compile(reviewerResultSchema);

/** Integrity validation, not proof of origin. Storage must bind the full envelope
 * digest to an authenticated writer and compare the caller's expected subject.
 */
export function validateReviewerResult(value: unknown, expected: ReviewSubject): ReviewerResult {
  try {
    let nodes = 0;
    const visit = (item: unknown, depth: number) => {
      if (++nodes > 50000 || depth > 32) throw Error();
      if (item === null || typeof item === 'string' || typeof item === 'boolean' || typeof item === 'number' && Number.isFinite(item)) return;
      if (!item || typeof item !== 'object') throw Error();
      if (Array.isArray(item)) { if (Object.keys(item).length !== item.length) throw Error(); }
      else if (![Object.prototype, null].includes(Object.getPrototypeOf(item))) throw Error();
      for (const child of Object.values(item)) visit(child, depth + 1);
    };
    visit(value, 0);
    if (Buffer.byteLength(JSON.stringify(value)) > 2097152 || !validate(value)) throw Error();
    const result = value as ReviewerResult, decision = result.independence, coding = result.coding;
    if (canonical(result.subject) !== canonical(expected) || result.subject.baseSha === result.subject.headSha || result.mode !== decision.mode || result.status !== result.response.status) throw Error();
    if (result.responseDigest !== digest(canonical(result.response)) || result.authorizationDigest !== digest(canonical({decision, coding}))) throw Error();
    if (coding ? coding.headSha !== result.subject.headSha || coding.evidenceDigest !== decision.provenanceDigest || !decision.codingUpstream : decision.provenanceDigest !== null || decision.codingUpstream !== null) throw Error();
    if (decision.differentProvider ? !coding || decision.outcome !== 'distinct-upstreams' || decision.codingUpstream === decision.reviewerUpstream : decision.outcome !== 'not-required') throw Error();
    if (result.status === 'completed') {
      if (!result.proposal || result.proposal.verification !== 'proposed' || canonical(result.proposal.output) !== canonical(result.response.structuredOutput)) throw Error();
    } else if (result.proposal !== null || result.response.structuredOutput !== null) throw Error();
    const usage = result.response.usage;
    if ((usage.costKind === 'unknown') !== (usage.costUsdMicros === null) || usage.costKind === 'estimated' && usage.pricingRevision === null) throw Error();
    return structuredClone(result);
  } catch { throw new Error('invalid-reviewer-result'); }
}
