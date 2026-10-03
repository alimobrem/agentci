import type { Octokit } from '@octokit/rest';
import { currentPullRequest, publishCheck, publishFailure, remoteSnapshot } from '../../packages/github/client.ts';
import type { ReviewJob } from '../../packages/github/webhook.ts';
import { analyze } from '../../packages/review/engine.ts';
import type { Store } from '../../packages/storage/postgres.ts';
export function createActivities(client: Octokit, store: Store, config: { appId: number; repository: string; installationId: number; publicUrl: string }) {
  const check = (job: ReviewJob) => { if (job.repository !== config.repository || job.installationId !== config.installationId) throw new Error('Job access mismatch'); };
  const publicationKey = (job: ReviewJob) => `${job.repository}:${job.pullRequest}:${job.baseSha}:${job.headSha}`;
  return {
    async isCurrent(job: ReviewJob) { check(job); return currentPullRequest(client, job); },
    async review(job: ReviewJob) {
      check(job);
      const base = await remoteSnapshot(client, job.repository, job.baseSha);
      const head = await remoteSnapshot(client, job.repository, job.headSha);
      const record = await store.save(analyze({ repository: job.repository, base, head }), job.pullRequest);
      return record.id;
    },
    async publish(job: ReviewJob, id: string): Promise<'published' | 'superseded'> {
      check(job);
      const record = await store.evidence(id);
      if (!record || record.evidence.subject.pullRequest !== job.pullRequest || record.analysis.headSha !== job.headSha || record.analysis.baseSha !== job.baseSha) throw new Error('Evidence identity mismatch');
      return store.withPublicationLock(publicationKey(job), async () => {
        if (!await currentPullRequest(client, job)) return 'superseded';
        await publishCheck(client, config.appId, job, record.analysis, `${config.publicUrl}/v1/evidence/${id}`);
        return 'published' as const;
      });
    },
    async fail(job: ReviewJob): Promise<void> {
      check(job);
      await store.withPublicationLock(publicationKey(job), async () => { if (await currentPullRequest(client, job)) await publishFailure(client, config.appId, job); });
    },
  };
}
export type Activities = ReturnType<typeof createActivities>;
