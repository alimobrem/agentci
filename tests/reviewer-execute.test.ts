import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {canonical, digest} from '../packages/review/engine.ts';
import {createReviewerExecutor, type ReviewerExecutionInput} from '../packages/reviewers/execute.ts';
import {ProviderFailure, type ModelProvider, type ModelResponse} from '../packages/providers/types.ts';
import type {BudgetLedger, Reservation} from '../packages/providers/budget.ts';
import {REVIEWER_ROLES} from '../packages/reviewers/roles.ts';
import {validateReviewerResult} from '../packages/reviewers/result.ts';

const subject = {organizationId: '00000000-0000-4000-8000-000000000001', repository: 'owner/repo', pullRequest: 1, baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40)};
const input = (): ReviewerExecutionInput => ({
  requestId: randomUUID(), mode: 'synthetic', differentProvider: true,
  subject: {...subject}, documents: [{kind: 'source', side: 'head', path: 'source.ts', content: 'untrusted input', digest: digest('untrusted input')}],
  coding: {providerId: 'coding', model: 'fixture-coder', headSha: subject.headSha, evidenceDigest: digest('trusted fixture provenance')},
  config: {role: 'code-correctness', policyVersion: 'v1', provider: 'review', model: 'fixture-review', parameters: {maxOutputTokens: 512}, policy: {deadlineAt: Date.now() + 60000, maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0}, responseSchema: {type: 'object', properties: {claim: {type: 'string'}}, required: ['claim'], additionalProperties: false}, providerExtensions: {}},
});
function setup() {
  const events: string[] = [], reservations: Reservation[] = [];
  let dispatchedDigest = '';
  const ledger: BudgetLedger = {
    async reserve(value) { events.push('reserve'); reservations.push(value); return 'attempt-1'; },
    async settle() { events.push('settle'); }, async unknown() { events.push('unknown'); }, async releaseNotSent() { events.push('release'); },
  };
  const provider: ModelProvider = {
    id: 'review', upstreamIdentity: 'review-upstream',
    capabilities: () => ({tools: false, stream: false, structuredOutput: true, developerInstructions: false, extensions: false}),
    estimateCost: () => ({upperBoundUsdMicros: 100, pricingRevision: 'fixture', maxInputTokens: 20000, maxOutputTokens: 512}),
    async invoke(request, context) {
      events.push('dispatch'); dispatchedDigest = digest(canonical(request));
      return {schemaVersion: 'v1alpha1', requestId: request.requestId, attemptId: context.attemptId,
        provider: request.provider, model: request.model, status: 'completed', text: 'Proposed issue', structuredOutput: {claim: 'Possible defect'}, toolCalls: [],
        usage: {inputTokens: 10, outputTokens: 10, costUsdMicros: 1, costKind: 'reported', pricingRevision: null}, providerRequestId: null};
    }, async *stream() { throw new Error('not used'); },
  };
  const coding = {...provider, id: 'coding', upstreamIdentity: 'coding-upstream'};
  const registrations = [{provider, execution: 'fixture' as const}, {provider: coding, execution: 'fixture' as const}];
  return {events, reservations, ledger, provider, coding, registrations, dispatchedDigest: () => dispatchedDigest};
}

test('reviewer reserves and settles through core and retains synthetic proposed evidence', async () => {
  const s = setup(), run = createReviewerExecutor(s.registrations, subject, s.ledger), result = await run(input());
  assert.deepEqual(s.events, ['reserve', 'dispatch', 'settle']);
  assert.equal(result.mode, 'synthetic'); assert.equal(result.proposal?.verification, 'proposed');
  assert.equal(result.requestDigest, s.dispatchedDigest());
  assert.equal(result.requestDigest, `sha256:${s.reservations[0]!.requestDigest}`);
  assert.equal(result.responseDigest, digest(canonical(result.response)));
  assert.equal(result.independence.outcome, 'distinct-upstreams');
  assert.deepEqual(validateReviewerResult(result, subject), result);
});

test('wrong tenant, unknown provenance, aliases and synthetic/external mismatch never reserve or dispatch', async () => {
  for (const mode of ['tenant', 'provenance', 'alias', 'external-mode', 'external-registration']) {
    const s = setup(), value = input();
    if (mode === 'tenant') value.subject = {...subject, repository: 'another/repo'};
    if (mode === 'provenance') value.coding = null;
    if (mode === 'alias') s.coding.upstreamIdentity = s.provider.upstreamIdentity;
    if (mode === 'external-mode') value.mode = 'external';
    const regs = s.registrations.map(r => ({...r, execution: mode === 'external-registration' ? 'external' as const : r.execution}));
    const run = createReviewerExecutor(regs, subject, s.ledger);
    await assert.rejects(run(value)); assert.deepEqual(s.events, []);
  }
});

test('budget exhaustion prevents dispatch and malformed output retains uncertain reservation', async () => {
  const denied = setup(); denied.ledger.reserve = async () => { denied.events.push('reserve'); throw new ProviderFailure('budget-exhausted'); };
  await assert.rejects(createReviewerExecutor(denied.registrations, subject, denied.ledger)(input()), /budget-exhausted/);
  assert.deepEqual(denied.events, ['reserve']);
  const malformed = setup(); malformed.provider.invoke = async () => { malformed.events.push('dispatch'); return {secret: 'private-fixture'} as unknown as ModelResponse; };
  await assert.rejects(createReviewerExecutor(malformed.registrations, subject, malformed.ledger)(input()), error => error instanceof ProviderFailure && error.code === 'invalid-output' && !error.message.includes('private'));
  assert.deepEqual(malformed.events, ['reserve', 'dispatch', 'unknown']);
});

test('refused model result is accounted without producing a proposed finding', async () => {
  const s = setup(), invoke = s.provider.invoke;
  s.provider.invoke = async (request, context) => ({...await invoke(request, context), status: 'refused', structuredOutput: null});
  const result = await createReviewerExecutor(s.registrations, subject, s.ledger)(input());
  assert.equal(result.status, 'refused'); assert.equal(result.proposal, null);
  validateReviewerResult(result, subject);
  assert.deepEqual(s.events, ['reserve', 'dispatch', 'settle']);
});

test('all seven roles execute and hidden provider continuation is excluded from review evidence', async () => {
  for (const role of REVIEWER_ROLES) {
    const s = setup(), invoke = s.provider.invoke;
    s.provider.invoke = async (request, context) => ({...await invoke(request, context), observedModel: request.model, continuation: {provider: request.provider, model: request.model, prefixDigest: 'f'.repeat(64), content: ['private-continuation']}});
    const value = input(); value.config.role = role;
    const result = await createReviewerExecutor(s.registrations, subject, s.ledger)(value);
    assert.equal(result.role, role);
    assert.ok(!JSON.stringify(result).includes('private-continuation'));
    assert.deepEqual(s.events, ['reserve', 'dispatch', 'settle']);
  }
});

test('cancellation before execution and failed accounting cannot return a successful review', async () => {
  const cancelled = setup(), controller = new AbortController(); controller.abort();
  await assert.rejects(createReviewerExecutor(cancelled.registrations, subject, cancelled.ledger)(input(), controller.signal), /cancelled/);
  assert.deepEqual(cancelled.events, []);
  const accounting = setup(); accounting.ledger.settle = async () => { throw new Error('private-database-error'); };
  await assert.rejects(createReviewerExecutor(accounting.registrations, subject, accounting.ledger)(input()), error => error instanceof ProviderFailure && error.code === 'ambiguous-attempt' && !error.message.includes('private'));
  assert.deepEqual(accounting.events, ['reserve', 'dispatch']);
});
