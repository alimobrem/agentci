import type {Pool, PoolClient} from 'pg';
import {canonical, digest} from '../review/engine.ts';
import {validateReviewerResult, type ReviewerResult} from '../reviewers/result.ts';
import type {ReviewSubject} from '../reviewers/context.ts';

export class ReviewerResultConflict extends Error {
  constructor() { super('reviewer-result-conflict'); }
}
export class ReviewerResultUnavailable extends Error {
  constructor() { super('reviewer-result-unavailable'); }
}
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
/** Controller-only immutable evidence. The bound budget must match the ledger
 * used for execution; model/repository data cannot select a different scope.
 */
export class ReviewerResultStore {
  private readonly scope: {organizationId: string; repository: string; budgetId: string};
  constructor(private readonly pool: Pool, scope: {organizationId: string; repository: string; budgetId: string}) {
    if (!uuid.test(scope.organizationId) || !uuid.test(scope.budgetId) || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(scope.repository) || scope.repository.length > 256) throw new ReviewerResultConflict();
    this.scope = {...scope};
  }
  private assertSubject(subject: ReviewSubject) {
    if (subject.organizationId !== this.scope.organizationId || subject.repository !== this.scope.repository) throw new ReviewerResultConflict();
  }
  private async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    let client: PoolClient;
    try { client = await this.pool.connect(); } catch { throw new ReviewerResultUnavailable(); }
    let broken = false;
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SET LOCAL statement_timeout='10s'");
      const result = await operation(client); await client.query('COMMIT'); return result;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { broken = true; }
      if (error instanceof ReviewerResultConflict) throw error;
      throw new ReviewerResultUnavailable();
    } finally { client.release(broken); }
  }
  private decode(row: any, expected: ReviewSubject) {
    let result: ReviewerResult;
    try { result = validateReviewerResult(row.result, expected); } catch { throw new ReviewerResultConflict(); }
    if (row.digest !== digest(canonical(result)) || row.request_id !== result.requestId || row.attempt_id !== result.attemptId || row.budget_id !== this.scope.budgetId) throw new ReviewerResultConflict();
    return {digest: row.digest as string, result};
  }
  async save(value: unknown, expected: ReviewSubject) {
    this.assertSubject(expected);
    const result = validateReviewerResult(value, expected), hash = digest(canonical(result));
    if (!uuid.test(result.attemptId)) throw new ReviewerResultConflict();
    return this.transaction(async client => {
      const values = [this.scope.organizationId, this.scope.repository, result.requestId, this.scope.budgetId, result.attemptId, hash, result,
        result.requestDigest.slice(7), result.response.usage.costKind, result.response.usage.costUsdMicros];
      const inserted = await client.query(`INSERT INTO agentci_reviewer_results(organization_id,repository,request_id,budget_id,attempt_id,digest,result)
        SELECT $1::uuid,$2,$3::uuid,$4::uuid,$5::uuid,$6,$7::jsonb
        FROM agentci_model_attempts a JOIN agentci_model_budgets b ON b.id=a.budget_id
        WHERE a.id=$5::uuid AND a.request_id=$3::uuid AND a.request_digest=$8 AND b.id=$4::uuid
          AND b.organization_id=$1::uuid AND b.repository=$2
          AND (($9='reported' AND a.state='settled' AND a.actual_usd_micros=$10::bigint) OR ($9<>'reported' AND a.state='unknown'))
        ON CONFLICT(organization_id,repository,request_id) DO NOTHING
        RETURNING request_id,attempt_id,budget_id,digest,result`, values);
      const row = inserted.rows[0] ?? (await client.query(`SELECT request_id,attempt_id,budget_id,digest,result FROM agentci_reviewer_results
        WHERE organization_id=$1 AND repository=$2 AND request_id=$3`, values.slice(0, 3))).rows[0];
      if (!row || row.digest !== hash) throw new ReviewerResultConflict();
      return this.decode(row, expected);
    });
  }
  async get(requestId: string, expected: ReviewSubject): Promise<{digest: string; result: ReviewerResult} | undefined> {
    this.assertSubject(expected);
    if (!uuid.test(requestId)) throw new ReviewerResultConflict();
    return this.transaction(async client => {
      const row = (await client.query(`SELECT request_id,attempt_id,budget_id,digest,result FROM agentci_reviewer_results
        WHERE organization_id=$1 AND repository=$2 AND request_id=$3 AND budget_id=$4`,
      [this.scope.organizationId, this.scope.repository, requestId, this.scope.budgetId])).rows[0];
      return row ? this.decode(row, expected) : undefined;
    });
  }
}
