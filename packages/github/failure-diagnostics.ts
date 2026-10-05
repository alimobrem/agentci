import type {Octokit} from '@octokit/rest';

/** Only allowlisted scalar response metadata may leave the SDK boundary. Never
 * serialize the error, request, URL, headers collection, message or body.
 */
export function githubFailureDiagnostic(error: unknown) {
  const value = error as {status?: unknown; response?: {headers?: Record<string, unknown>}} | null;
  const status = typeof value?.status === 'number' && Number.isInteger(value.status) && value.status >= 400 && value.status <= 599 ? value.status : null;
  const headers = value?.response?.headers;
  const number = (name: string) => {
    const raw = headers?.[name];
    if (typeof raw !== 'string' || !/^\d{1,12}$/.test(raw)) return null;
    const parsed = Number(raw); return Number.isSafeInteger(parsed) ? parsed : null;
  };
  const remaining = number('x-ratelimit-remaining');
  const requestId = headers?.['x-github-request-id'];
  return {
    event: 'github-request-failed', status,
    category: (status === 403 || status === 429) && remaining === 0 ? 'primary-rate-limit'
      : status === 429 ? 'rate-limit' : status === 403 ? 'forbidden-or-rate-limit'
      : status === 401 ? 'authentication' : 'request-failure',
    remaining, limit: number('x-ratelimit-limit'), resetEpochSeconds: number('x-ratelimit-reset'),
    retryAfterSeconds: number('retry-after'),
    requestId: typeof requestId === 'string' && /^[A-Fa-f0-9:]{1,128}$/.test(requestId) ? requestId : null,
  };
}

/** Logging cannot turn a failed request into success or replace the original error. */
export function observeGitHubFailures(client: Octokit, emit: (diagnostic: ReturnType<typeof githubFailureDiagnostic>) => void) {
  client.hook.error('request', async error => {
    try { emit(githubFailureDiagnostic(error)); } catch { /* Diagnostics are best effort. */ }
    throw error;
  });
}
