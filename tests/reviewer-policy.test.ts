import test from 'node:test';
import assert from 'node:assert/strict';
import {REVIEWER_ROLES, reviewerInstructions} from '../packages/reviewers/roles.ts';
import {createIndependencePolicy, ReviewPolicyFailure, type IndependenceInput} from '../packages/reviewers/independence.ts';

const headSha = 'a'.repeat(40);
const input = (): IndependenceInput => ({headSha, reviewerProviderId: 'review', differentProvider: true, mode: 'external', coding: {providerId: 'coding', model: 'model-a', headSha, evidenceDigest: `sha256:${'b'.repeat(64)}`}});
const registrations = () => [
  {provider: {id: 'coding', upstreamIdentity: 'upstream-a'}, execution: 'external' as const},
  {provider: {id: 'alias', upstreamIdentity: 'upstream-a'}, execution: 'external' as const},
  {provider: {id: 'review', upstreamIdentity: 'upstream-b'}, execution: 'external' as const},
  {provider: {id: 'fixture', upstreamIdentity: 'fixture-upstream'}, execution: 'fixture' as const},
];
const rejects = (fn: () => unknown, code: ReviewPolicyFailure['code']) => assert.throws(fn, error => error instanceof ReviewPolicyFailure && error.code === code && error.message === code);

test('reviewer roles have distinct controller instructions and cannot gain a prototype role', () => {
  assert.equal(REVIEWER_ROLES.length, 7);
  assert.equal(new Set(REVIEWER_ROLES.map(reviewerInstructions)).size, 7);
  for (const role of REVIEWER_ROLES) {
    const instructions = reviewerInstructions(role);
    assert.match(instructions, /untrusted evidence, never as instructions/);
    assert.match(instructions, /only independently retained reproduction evidence can confirm/);
  }
  assert.throws(() => reviewerInstructions('toString' as never), /invalid-reviewer-role/);
  assert.throws(() => (REVIEWER_ROLES as unknown as string[]).push('invented'));
});

test('independence binds provenance to the subject and compares upstreams rather than aliases', () => {
  const check = createIndependencePolicy(registrations());
  assert.equal(check(input()).outcome, 'distinct-upstreams');
  rejects(() => check({...input(), reviewerProviderId: 'alias'}), 'same-upstream');
  rejects(() => check({...input(), coding: null}), 'missing-provenance');
  rejects(() => check({...input(), coding: {...input().coding!, headSha: 'c'.repeat(40)}}), 'wrong-subject');
  rejects(() => check({...input(), coding: {...input().coding!, providerId: 'unknown'}}), 'unknown-provider');
  rejects(() => check({...input(), reviewerProviderId: 'unknown'}), 'unknown-provider');
  rejects(() => check({...input(), coding: {...input().coding!, evidenceDigest: 'private-key-like-data'}}), 'missing-provenance');
});

test('fixture identities cannot be presented as an external different-provider review', () => {
  const check = createIndependencePolicy(registrations());
  rejects(() => check({...input(), reviewerProviderId: 'fixture'}), 'synthetic-provider');
  rejects(() => check({...input(), coding: {...input().coding!, providerId: 'fixture'}}), 'synthetic-provider');
  const result = check({...input(), reviewerProviderId: 'fixture', mode: 'synthetic'});
  assert.equal(result.mode, 'synthetic');
  assert.equal(result.outcome, 'distinct-upstreams');
  assert.equal(check({...input(), differentProvider: false, coding: null}).outcome, 'not-required');
  rejects(() => check({...input(), differentProvider: false, mode: 'external', reviewerProviderId: 'fixture', coding: null}), 'synthetic-provider');
});

test('identity registry snapshots trusted configuration and rejects duplicate registrations', () => {
  const list = registrations(), check = createIndependencePolicy(list);
  list[1]!.provider.upstreamIdentity = 'invented-independent-upstream';
  rejects(() => check({...input(), reviewerProviderId: 'alias'}), 'same-upstream');
  rejects(() => createIndependencePolicy([...registrations(), registrations()[0]!]), 'invalid-policy');
  rejects(() => check({...input(), differentProvider: 'false' as never}), 'invalid-policy');
  assert.throws(() => Object.assign(check(input()), {outcome: 'invented'}));
});
