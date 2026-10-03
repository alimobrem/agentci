import { createHmac, timingSafeEqual } from 'node:crypto';
export interface ReviewJob { repository: string; installationId: number; pullRequest: number; baseSha: string; headSha: string }
export interface WebhookConfig { repository: string; installationId: number; secret: string }
export class WebhookError extends Error { constructor(public status: number, public code: string) { super(code); } }
export function verifySignature(raw: Buffer, signature: string | undefined, secret: string): boolean {
  if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'));
}
export function parsePullRequest(raw: Buffer, event: string | undefined, config: WebhookConfig): ReviewJob | null {
  let payload: any;
  try { payload = JSON.parse(raw.toString('utf8')); } catch { throw new WebhookError(400, 'invalid-json'); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new WebhookError(400, 'invalid-payload');
  if (event === 'ping') return null;
  if (payload.repository?.full_name !== config.repository || payload.installation?.id !== config.installationId) throw new WebhookError(403, 'installation-repository-mismatch');
  if (event !== 'pull_request') return null;
  if (!['opened', 'synchronize', 'reopened', 'ready_for_review', 'edited', 'closed'].includes(payload.action)) return null;
  const pr = payload.pull_request;
  if (!pr || !Number.isSafeInteger(payload.number) || payload.number < 1 || pr.number !== payload.number || pr.base?.repo?.full_name !== config.repository || !/^[a-f0-9]{40}$/.test(pr.base?.sha ?? '') || !/^[a-f0-9]{40}$/.test(pr.head?.sha ?? '')) throw new WebhookError(400, 'invalid-pull-request');
  // Closed events are recorded but need no new review. Existing jobs recheck PR state.
  if (payload.action === 'closed') return null;
  return { repository: config.repository, installationId: config.installationId, pullRequest: payload.number, baseSha: pr.base.sha, headSha: pr.head.sha };
}
