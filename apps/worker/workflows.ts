import { proxyActivities } from '@temporalio/workflow';
import type { ReviewJob } from '../../packages/github/webhook.ts';
import type { Activities } from './activities.ts';
export {evaluatePullRequest} from './eval-workflows.ts';
const activities = proxyActivities<Activities>({ startToCloseTimeout: '10 minutes', retry: { maximumAttempts: 5, initialInterval: '2 seconds', maximumInterval: '1 minute' } });
export async function reviewPullRequest(job: ReviewJob): Promise<'published' | 'superseded'> {
  try {
    if (!await activities.isCurrent(job)) return 'superseded';
    const evidenceId = await activities.review(job);
    // Publication activity rechecks after remote I/O, so superseded evidence cannot satisfy a new head.
    return await activities.publish(job, evidenceId);
  } catch (error) {
    await activities.fail(job);
    throw error;
  }
}
