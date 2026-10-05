import {canonical, digest} from '../review/engine.ts';

export interface ReviewSubject {
  organizationId: string;
  repository: string;
  pullRequest: number;
  baseSha: string;
  headSha: string;
}
export interface ReviewDocument {
  kind: 'source' | 'requirement' | 'diff';
  side: 'base' | 'head';
  path: string;
  content: string;
  digest: string;
}
export const MAX_REVIEW_CONTEXT_BYTES = 65536;
const record = (value: unknown, keys: string[]): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const text = (value: unknown, max: number): value is string => typeof value === 'string' &&
  value.length <= max && Buffer.byteLength(value) <= max && Buffer.from(value).toString('utf8') === value;
const sha = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);

/** Validates selected evidence, not repository provenance. The controller must fetch
 * documents from the authorized immutable subject. No filesystem paths are opened.
 * Oversized evidence fails explicitly; nothing is silently omitted or truncated.
 */
export function buildReviewContext(subjectValue: unknown, documentsValue: unknown) {
  const fail = (): never => { throw new Error('invalid-review-context'); };
  if (!record(subjectValue, ['organizationId', 'repository', 'pullRequest', 'baseSha', 'headSha'])) return fail();
  const s = subjectValue;
  if (typeof s.organizationId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(s.organizationId) ||
      !text(s.repository, 256) || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(s.repository) ||
      !Number.isSafeInteger(s.pullRequest) || (s.pullRequest as number) < 1 || !sha(s.baseSha) || !sha(s.headSha) || s.baseSha === s.headSha) return fail();
  if (!Array.isArray(documentsValue) || !documentsValue.length || documentsValue.length > 64) return fail();
  const documents: Readonly<ReviewDocument>[] = [], seen = new Set<string>();
  let bytes = 0;
  for (const value of documentsValue) {
    if (!record(value, ['kind', 'side', 'path', 'content', 'digest'])) return fail();
    if (!['source', 'requirement', 'diff'].includes(value.kind as string) || !['base', 'head'].includes(value.side as string) ||
        !text(value.path, 1024) || !value.path || /[\\:\x00-\x1f\x7f]/.test(value.path) ||
        value.path.split('/').some(segment => !segment || segment === '.' || segment === '..') ||
        !text(value.content, 32768) || typeof value.digest !== 'string' || value.digest !== digest(value.content)) return fail();
    bytes += Buffer.byteLength(value.content);
    if (bytes > MAX_REVIEW_CONTEXT_BYTES) return fail();
    const key = canonical([value.kind, value.side, value.path]);
    if (seen.has(key)) return fail();
    seen.add(key);
    documents.push(Object.freeze({...value}) as unknown as Readonly<ReviewDocument>);
  }
  documents.sort((a, b) => {
    const left = canonical([a.kind, a.side, a.path]), right = canonical([b.kind, b.side, b.path]);
    return left < right ? -1 : left > right ? 1 : 0;
  });
  const subject = Object.freeze({...s}) as unknown as Readonly<ReviewSubject>;
  const content = canonical({schemaVersion: 'v1alpha1', trust: 'untrusted-repository-evidence', subject, documents});
  if (Buffer.byteLength(content) > MAX_REVIEW_CONTEXT_BYTES) return fail();
  return Object.freeze({subject, documents: Object.freeze(documents), content, digest: digest(content)});
}
