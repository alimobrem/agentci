import type {Snapshot} from '../review/types.ts';
import {digest} from '../review/engine.ts';
import {buildReviewContext, type ReviewSubject} from './context.ts';

export interface ReviewerSelection {
  kind: 'source' | 'requirement';
  side: 'base' | 'head';
  path: string;
}

/** Bind to an authenticated subject and reader in the controller, never from model
 * output. The existing GitHub reader verifies commit/tree/blob identity. Selection
 * is explicit and does not claim complete repository or requirement coverage.
 */
export function createSnapshotReviewContext(
  authorizedSubject: ReviewSubject,
  readSnapshot: (repository: string, sha: string) => Promise<Snapshot>,
) {
  const subject = buildReviewContext(authorizedSubject, [{kind: 'source', side: 'head', path: 'validation', content: '', digest: digest('')}]).subject;
  return async (selection: readonly ReviewerSelection[], signal?: AbortSignal) => {
    const fail = (): never => { throw new Error('invalid-review-snapshot'); };
    const check = () => { if (signal?.aborted) throw new Error('review-context-cancelled'); };
    check();
    if (!Array.isArray(selection) || !selection.length || selection.length > 64) return fail();
    // Validate and detach every reference before any asynchronous read. Reuse the
    // context path/duplicate rules without accepting caller-provided content.
    const references = selection.map(ref => {
      if (!ref || typeof ref !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(ref)) ||
          Object.keys(ref).length !== 3 || !['kind', 'side', 'path'].every(key => Object.hasOwn(ref, key)) ||
          !['source', 'requirement'].includes(ref.kind)) return fail();
      return {...ref, content: '', digest: digest('')};
    });
    let validated;
    try { validated = buildReviewContext(subject, references); } catch { return fail(); }
    const documents = [];
    for (const side of ['base', 'head'] as const) {
      const selected = validated.documents.filter(ref => ref.side === side);
      if (!selected.length) continue;
      check();
      let snapshot: Snapshot;
      try { snapshot = await readSnapshot(subject.repository, side === 'base' ? subject.baseSha : subject.headSha); }
      catch { check(); throw new Error('review-snapshot-unavailable'); }
      check();
      if (!snapshot || snapshot.sha !== (side === 'base' ? subject.baseSha : subject.headSha) ||
          !snapshot.files || typeof snapshot.files !== 'object' || Array.isArray(snapshot.files)) return fail();
      for (const ref of selected) {
        if (!Object.hasOwn(snapshot.files, ref.path) || typeof snapshot.files[ref.path] !== 'string') return fail();
        const content = snapshot.files[ref.path]!;
        documents.push({...ref, content, digest: digest(content)});
      }
    }
    try { return buildReviewContext(subject, documents); } catch { return fail(); }
  };
}
