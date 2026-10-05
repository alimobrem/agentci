import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canonical, digest} from '../packages/review/engine.ts';
import {validateReviewerResult} from '../packages/reviewers/result.ts';
const fixture = () => JSON.parse(readFileSync(new URL('../specs/api/fixtures/reviewer-result.json', import.meta.url), 'utf8'));

test('reviewer result fixture is detached and bound to exact organization repository and commit', () => {
  const value = fixture(), result = validateReviewerResult(value, value.subject);
  assert.deepEqual(result, value); assert.notEqual(result, value);
  for (const change of [{organizationId: '00000000-0000-4000-8000-000000000009'}, {repository: 'other/repo'}, {pullRequest: 2}, {baseSha: 'c'.repeat(40)}, {headSha: 'd'.repeat(40)}]) {
    assert.throws(() => validateReviewerResult(value, {...value.subject, ...change}), /invalid-reviewer-result/);
  }
});

test('tampered proposal state, response, private fields and policy relationships are rejected', () => {
  const mutations = [
    (v: any) => { v.proposal.verification = 'confirmed'; },
    (v: any) => { v.proposal.output.claim = 'different'; },
    (v: any) => { v.response.text = 'changed'; },
    (v: any) => { v.response.continuation = 'private'; },
    (v: any) => { v.mode = 'external'; },
    (v: any) => { v.independence.differentProvider = true; v.independence.outcome = 'distinct-upstreams'; v.authorizationDigest = digest(canonical({decision: v.independence, coding: v.coding})); },
  ];
  for (const mutate of mutations) { const v = fixture(); mutate(v); assert.throws(() => validateReviewerResult(v, v.subject), /invalid-reviewer-result/); }
});

test('noncompleted output, inconsistent usage and invalid nested payloads fail closed', () => {
  const value = fixture(); value.status = value.response.status = 'refused'; value.response.structuredOutput = null;
  value.responseDigest = digest(canonical(value.response));
  assert.throws(() => validateReviewerResult(value, value.subject), /invalid-reviewer-result/);
  value.proposal = null; assert.equal(validateReviewerResult(value, value.subject).proposal, null);
  for (const bad of [undefined, NaN, new Map(), 'x'.repeat(2097153)]) {
    const v = fixture(); v.response.structuredOutput = bad;
    assert.throws(() => validateReviewerResult(v, v.subject), /invalid-reviewer-result/);
  }
  const unknown = fixture(); unknown.response.usage.costKind = 'unknown'; unknown.responseDigest = digest(canonical(unknown.response));
  assert.throws(() => validateReviewerResult(unknown, unknown.subject), /invalid-reviewer-result/);
  const cyclic = fixture(); cyclic.response.structuredOutput = cyclic;
  assert.throws(() => validateReviewerResult(cyclic, cyclic.subject), error => error instanceof Error && error.message === 'invalid-reviewer-result');
});
