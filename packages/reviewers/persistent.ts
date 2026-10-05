import {ProviderFailure} from '../providers/types.ts';
import {ReviewerResultConflict, type ReviewerResultStore} from '../storage/reviewer-results.ts';
import type {createReviewerExecutor, ReviewerExecutionInput} from './execute.ts';

/** Reuses immutable evidence; it never retries a charged attempt by inventing an ID.
 * An accounted-but-unsaved result remains ambiguous, fenced by the budget ledger.
 */
export function createPersistentReviewer(
  executor: ReturnType<typeof createReviewerExecutor>,
  store: Pick<ReviewerResultStore, 'get' | 'save'>,
) {
  return async (input: ReviewerExecutionInput, signal?: AbortSignal) => {
    const check = () => { if (signal?.aborted) throw new ProviderFailure('cancelled'); };
    check();
    // Snapshot and authorize once, before asynchronous storage reads.
    const plan = executor.prepare(input);
    const prior = await store.get(plan.requestId, plan.subject);
    check();
    if (prior) {
      if (prior.result.requestDigest !== plan.requestDigest) throw new ReviewerResultConflict();
      return {...prior, reused: true};
    }
    const result = await plan.execute(signal);
    const record = await store.save(result, plan.subject);
    check();
    return {...record, reused: false};
  };
}
