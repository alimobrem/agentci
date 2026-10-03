import { VERSION } from '../../packages/version.ts';
import { canonical, digest } from '../../packages/review/engine.ts';
import type { EvidenceRecord } from '../../packages/storage/postgres.ts';
export const webhookConfig = { repository: 'example/repo', installationId: 12, secret: 's'.repeat(32), evidenceToken: 'e'.repeat(32) };
export const reviewJob = { repository: webhookConfig.repository, installationId: webhookConfig.installationId, pullRequest: 1, baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40) };
export const openedPullRequest = { action: 'opened', number: 1, installation: { id: reviewJob.installationId }, repository: { full_name: reviewJob.repository }, pull_request: { number: 1, base: { sha: reviewJob.baseSha, repo: { full_name: reviewJob.repository } }, head: { sha: reviewJob.headSha } } };
export function evidenceFixture(): EvidenceRecord {
  const id = '00000000-0000-4000-8000-000000000003';
  const analysis = { schemaVersion: 'v1alpha1' as const, repository: reviewJob.repository, baseSha: reviewJob.baseSha, headSha: reviewJob.headSha, changes: [], findings: [], risk: 'low' as const, advisory: true as const, evals: { status: 'not-applicable' as const, reason: 'Behavioral evaluation starts in M2.' } };
  const hash = digest(canonical(analysis));
  return { id, digest: hash, analysis, evidence: { schemaVersion: 'v1alpha1', id, organizationId: '00000000-0000-4000-8000-000000000001', kind: 'PullRequest', version: 1, createdAt: '2026-10-03T00:00:00Z', subject: { gitSha: reviewJob.headSha, pullRequest: 1 }, claim: { sourceType: 'static-analysis', confidence: 1, verificationStatus: 'verified', producer: { name: 'agentci', version: VERSION } }, artifacts: [{ uri: `urn:agentci:analysis:${id}`, digest: hash, mediaType: 'application/json' }], edges: [] } };
}
