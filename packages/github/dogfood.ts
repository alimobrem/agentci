import type { ReviewJob } from './webhook.ts';
import type { EvidenceRecord } from '../storage/postgres.ts';
import { canonical, digest } from '../review/engine.ts';
export function artifactUrl(value: string, repository: string): string {
  const url = new URL(value);
  const prefix = `/${repository}/actions/runs/`;
  if (url.origin !== 'https://github.com' || url.username || url.password || url.search || url.hash ||
      !url.pathname.startsWith(prefix) || !/^\d+\/artifacts\/\d+$/.test(url.pathname.slice(prefix.length))) throw new Error('Invalid repository artifact URL');
  return url.href;
}
export function verifyExport(job: ReviewJob, record: EvidenceRecord, repository: string, installationId: number) {
  if (job.repository !== repository || job.installationId !== installationId || record.analysis.repository !== repository ||
      record.analysis.baseSha !== job.baseSha || record.analysis.headSha !== job.headSha ||
      record.evidence.subject.pullRequest !== job.pullRequest || record.evidence.subject.gitSha !== job.headSha ||
      record.evidence.id !== record.id || digest(canonical(record.analysis)) !== record.digest ||
      record.evidence.artifacts[0]?.digest !== record.digest) throw new Error('Export identity/integrity mismatch');
}
