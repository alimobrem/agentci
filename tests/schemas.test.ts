import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDocument, schemaNames } from '../packages/schemas/index.ts';
import { parseYaml } from '../packages/project/index.ts';

const project = parseYaml(readFileSync(new URL('../agentci.yaml', import.meta.url), 'utf8')) as any;
const requirement = {
  id: 'SPEC-142', title: 'Production restart requires approval', type: 'safety', status: 'active',
  text: 'Production restart requires an authorized operator approval.',
  verification: { deterministicPolicy: 'required', behavioralEval: 'required' }, risk: { severity: 'high' }, owners: ['platform'],
};
const finding = {
  id: 'finding-82', source: { type: 'model-review', provider: 'anthropic', model: 'example-model' },
  category: 'security', severity: 'high', claim: 'Namespace validation can be bypassed.',
  evidence: { files: ['src/restart.ts:81-92'] }, reproduction: { status: 'confirmed', test: 'repro-82' }, blocking: true,
};
const evidence = {
  schemaVersion: 'v1alpha1', id: '826c017c-30f7-44b0-821b-2f63cebd0381',
  organizationId: '723c017c-30f7-44b0-821b-2f63cebd0381', kind: 'Finding', version: 1, createdAt: '2026-10-03T00:00:00Z',
  subject: { gitSha: 'a'.repeat(40) },
  claim: { sourceType: 'model-review', confidence: 0.5, verificationStatus: 'asserted', producer: { name: 'reviewer', version: '0.1.0' } },
  artifacts: [{ uri: 'https://example.invalid/artifacts/review.json', digest: `sha256:${'b'.repeat(64)}`, mediaType: 'application/json' }], edges: [],
};
const fixtures = { 'agent-project': project, requirement, finding, evidence };

for (const name of schemaNames) {
  test(`${name}: accepts representative valid contract`, () => assert.equal(validateDocument(name, fixtures[name]).valid, true));
  test(`${name}: rejects missing required fields`, () => assert.equal(validateDocument(name, {}).valid, false));
  test(`${name}: rejects unknown fields to catch misspellings`, () => {
    assert.equal(validateDocument(name, { ...fixtures[name], typo: true }).valid, false);
  });
}

test('project: privacy mode and provider names are portable', () => {
  const value = structuredClone(project);
  value.spec.models.allowedProviders = ['customer-provider'];
  value.spec.telemetry.contentCapture = 'metadata-only';
  assert.equal(validateDocument('agent-project', value).valid, true);
  value.spec.telemetry.contentCapture = 'silent-capture';
  assert.equal(validateDocument('agent-project', value).valid, false);
});
test('project: rejects credential fields and wrong schema version', () => {
  const value = structuredClone(project);
  value.spec.models.apiKey = 'not-a-real-key';
  assert.equal(validateDocument('agent-project', value).valid, false);
  delete value.spec.models.apiKey;
  value.apiVersion = 'agentci.io/v9';
  assert.equal(validateDocument('agent-project', value).valid, false);
});
test('validation never coerces values or mutates privacy defaults', () => {
  const value = structuredClone(project);
  delete value.spec.telemetry.contentCapture;
  const before = structuredClone(value);
  assert.equal(validateDocument('agent-project', value).valid, false);
  assert.deepEqual(value, before);
  assert.equal(validateDocument('finding', { ...finding, blocking: 'true' }).valid, false);
});
test('requirement: lifecycle and verification enums reject mistakes', () => {
  assert.equal(validateDocument('requirement', { ...requirement, status: 'tested' }).valid, false);
  assert.equal(validateDocument('requirement', { ...requirement, verification: { behavioralEval: 'maybe' } }).valid, false);
});
test('finding: reproduction labels stay explicit', () => {
  const value = { ...finding, reproduction: { status: 'unconfirmed' }, blocking: false, confidence: 0.7 };
  assert.equal(validateDocument('finding', value).valid, true);
  assert.equal(validateDocument('finding', { ...value, confidence: 1.1 }).valid, false);
  assert.equal(validateDocument('finding', { ...value, reproduction: { status: 'consensus-proven' } }).valid, false);
});
test('evidence: requires exact commit, UUIDs, timestamps and digests', () => {
  for (const patch of [
    { subject: { gitSha: 'abc123' } }, { id: 'not-a-uuid' }, { organizationId: 'not-a-uuid' },
    { createdAt: 'yesterday' }, { artifacts: [{ uri: 'https://example.invalid', digest: 'sha256:...', mediaType: 'text/plain' }] },
  ]) assert.equal(validateDocument('evidence', { ...evidence, ...patch }).valid, false);
});
test('evidence: rejects confidence overflow and invalid edge types', () => {
  assert.equal(validateDocument('evidence', { ...evidence, claim: { ...evidence.claim, confidence: -0.1 } }).valid, false);
  assert.equal(validateDocument('evidence', { ...evidence, edges: [{ relation: 'GUESS', target: { id: evidence.id, type: 'Finding' } }] }).valid, false);
});
