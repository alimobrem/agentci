import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {PostgresBudgetLedger} from '../../packages/providers/budget.ts';
import {ReviewerResultStore} from '../../packages/storage/reviewer-results.ts';
import {canonical, digest} from '../../packages/review/engine.ts';

const url = process.env.AGENTCI_TEST_DATABASE_URL;
if (!url) throw Error('Reviewer result integration requires AGENTCI_TEST_DATABASE_URL; never silently skip');
test('PostgreSQL reviewer evidence is immutable, budget-bound, idempotent and recoverable', async () => {
  const pool = new Pool({connectionString: url, connectionTimeoutMillis: 5000});
  const scope = {id: randomUUID(), organizationId: randomUUID(), repository: 'fixture/reviewer', limitUsdMicros: 100};
  try {
    for (const file of ['004_m3_model_budget.sql', '005_m3_reviewer_results.sql']) {
      const sql = await readFile(new URL(`../../deploy/migrations/${file}`, import.meta.url), 'utf8');
      await pool.query(sql); await pool.query(sql);
    }
    const ledger = new PostgresBudgetLedger(pool, scope);
    const value = JSON.parse(await readFile(new URL('../../specs/api/fixtures/reviewer-result.json', import.meta.url), 'utf8'));
    value.subject.organizationId = scope.organizationId; value.subject.repository = scope.repository; value.requestId = randomUUID();
    value.attemptId = await ledger.reserve({requestId: value.requestId, requestDigest: value.requestDigest.slice(7), attempt: 1, upperBoundUsdMicros: 20, pricingRevision: 'fixture'});
    const binding = {organizationId: scope.organizationId, repository: scope.repository, budgetId: scope.id};
    const store = new ReviewerResultStore(pool, binding);
    await assert.rejects(store.save(value, value.subject), /reviewer-result-conflict/); // accounting not complete
    await ledger.settle(value.attemptId, 0);
    const records = await Promise.all(Array.from({length: 8}, () => store.save(value, value.subject)));
    assert.ok(records.every(r => r.digest === records[0]!.digest));
    assert.equal((await pool.query('SELECT count(*) FROM agentci_reviewer_results WHERE budget_id=$1', [scope.id])).rows[0].count, '1');
    const recovered = await new ReviewerResultStore(pool, binding).get(value.requestId, value.subject);
    assert.deepEqual(recovered?.result, value);
    assert.equal(recovered?.digest, digest(canonical(value)));
    await assert.rejects(store.get(value.requestId, {...value.subject, headSha: 'c'.repeat(40)}), /reviewer-result-conflict/);
    const otherOrganization = randomUUID();
    const other = new ReviewerResultStore(pool, {...binding, organizationId: otherOrganization});
    assert.equal(await other.get(value.requestId, {...value.subject, organizationId: otherOrganization}), undefined);
    await assert.rejects(other.save(value, value.subject), /reviewer-result-conflict/);
    const changed = structuredClone(value); changed.response.text = 'changed'; changed.responseDigest = digest(canonical(changed.response));
    await assert.rejects(store.save(changed, changed.subject), /reviewer-result-conflict/);
    await assert.rejects(pool.query("UPDATE agentci_reviewer_results SET digest=$1 WHERE request_id=$2", [digest('tampered'), value.requestId]), /Immutable reviewer result/);
    const mismatch = structuredClone(value); mismatch.requestId = randomUUID();
    mismatch.attemptId = await ledger.reserve({requestId: mismatch.requestId, requestDigest: mismatch.requestDigest.slice(7), attempt: 1, upperBoundUsdMicros: 20, pricingRevision: 'fixture'});
    await ledger.settle(mismatch.attemptId, 5);
    await assert.rejects(store.save(mismatch, mismatch.subject), /reviewer-result-conflict/); // reported cost must match ledger
    assert.equal(await store.get(mismatch.requestId, mismatch.subject), undefined);
    const unknown = structuredClone(value); unknown.requestId = randomUUID();
    unknown.response.usage.costKind = 'unknown'; unknown.response.usage.costUsdMicros = null;
    unknown.responseDigest = digest(canonical(unknown.response));
    unknown.attemptId = await ledger.reserve({requestId: unknown.requestId, requestDigest: unknown.requestDigest.slice(7), attempt: 1, upperBoundUsdMicros: 20, pricingRevision: 'fixture'});
    await ledger.unknown(unknown.attemptId);
    assert.deepEqual((await store.save(unknown, unknown.subject)).result, unknown);
    const held = (await pool.query('SELECT state,reserved_usd_micros FROM agentci_model_attempts WHERE id=$1', [unknown.attemptId])).rows[0];
    assert.deepEqual(held, {state: 'unknown', reserved_usd_micros: '20'});
  } finally {
    await pool.query('DELETE FROM agentci_reviewer_results WHERE budget_id=$1', [scope.id]);
    await pool.query('DELETE FROM agentci_model_attempts WHERE budget_id=$1', [scope.id]);
    await pool.query('DELETE FROM agentci_model_budgets WHERE id=$1', [scope.id]);
    await pool.end();
  }
});
