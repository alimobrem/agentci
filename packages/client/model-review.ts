import {setTimeout as delay} from 'node:timers/promises';
import {canonical, digest} from '../review/engine.ts';
import {validateReviewAdmission, type ReviewAdmissionRequest} from '../reviewers/admission.ts';
import {
  validateModelReviewAccepted, validateModelReviewStatus, validateModelReviewCancellation, validateReviewerProfileList,
  type ModelReviewAccepted, type ModelReviewStatus, type ModelReviewCancellation, type ReviewerProfileList
} from '../reviewers/transport.ts';
import {AgentCIError} from './index.ts';

export interface ModelReviewClientOptions {
  url: string;
  readToken?: string;
  operatorToken?: string;
  timeoutMs?: number;
  maxAttempts?: number;
}
const failures: Record<number, readonly string[]> = {
  400: ['invalid-request', 'invalid-cursor'], 401: ['unauthorized'], 403: ['forbidden', 'review-denied'],
  404: ['not-found'], 405: ['method-not-allowed'],
  409: ['idempotency-conflict', 'version-conflict', 'review-not-complete', 'invalid-transition', 'approval-conflict'],
  413: ['body-too-large', 'response-too-large'], 415: ['unsupported-media-type', 'unsupported-content-encoding'],
  503: ['service-unavailable']
};
const exact = (value: any, keys: string[]) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === [...keys].sort().join(',');

/** Authenticated model-review transport. Acknowledgments do not certify a passing review. */
export class ModelReviewClient {
  #origin: string;
  #readToken?: string;
  #operatorToken?: string;
  #timeoutMs: number;
  #maxAttempts: number;
  constructor(options: ModelReviewClientOptions) {
    try {
      const url = new URL(options.url);
      if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
        (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw Error();
      this.#origin = url.origin;
    } catch { throw new AgentCIError('invalid-origin'); }
    for (const token of [options.readToken, options.operatorToken]) if (token !== undefined &&
      (typeof token !== 'string' || token.length < 32 || /[\r\n]/.test(token))) throw new AgentCIError('invalid-token');
    if (!options.readToken && !options.operatorToken || options.readToken !== undefined && options.readToken === options.operatorToken)
      throw new AgentCIError('invalid-token');
    this.#readToken = options.readToken; this.#operatorToken = options.operatorToken;
    this.#timeoutMs = options.timeoutMs ?? 15000; this.#maxAttempts = options.maxAttempts ?? 3;
    if (!Number.isSafeInteger(this.#timeoutMs) || this.#timeoutMs < 1 || this.#timeoutMs > 120000) throw new AgentCIError('invalid-timeout');
    if (!Number.isSafeInteger(this.#maxAttempts) || this.#maxAttempts < 1 || this.#maxAttempts > 3) throw new AgentCIError('invalid-attempts');
  }
  private admission(value: unknown): ReviewAdmissionRequest {
    try {return validateReviewAdmission(value);} catch {throw new AgentCIError('invalid-request');}
  }
  private async body(response: Response, maximum: number): Promise<unknown> {
    if (!/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? '')) {
      await response.body?.cancel(); throw new AgentCIError('invalid-response');
    }
    const reader = response.body?.getReader(); if (!reader) throw new AgentCIError('invalid-response');
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        const {done, value} = await reader.read(); if (done) break;
        size += value.byteLength; if (size > maximum) throw new AgentCIError('response-too-large'); chunks.push(value);
      }
      try {return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(Buffer.concat(chunks)));}
      catch {throw new AgentCIError('invalid-response');}
    } finally {await reader.cancel();}
  }
  private async request(path: string, mutation: boolean, status: number, body?: string): Promise<{value: unknown; location: string | null}> {
    const token = mutation ? this.#operatorToken : this.#readToken ?? this.#operatorToken;
    if (!token) throw new AgentCIError('operator-token-required');
    // One overall deadline includes response bodies and backoff. Retried writes
    // keep exactly the same normalized admission ID/body or cancellation path.
    const signal = AbortSignal.timeout(this.#timeoutMs);
    for (let attempt = 1; ; attempt++) {
      try {
        const response = await fetch(this.#origin + path, {method: mutation ? 'POST' : 'GET', redirect: 'error', signal,
          headers: {authorization: `Bearer ${token}`, ...(body !== undefined ? {'content-type': 'application/json'} : {})},
          ...(body !== undefined ? {body} : {})});
        const value = await this.body(response, response.status === status ? 4 * 1024 * 1024 : 1024);
        if (response.status !== status) {
          if (!exact(value, ['error']) || !exact((value as any).error, ['code']) ||
            !failures[response.status]?.includes((value as any).error.code)) throw new AgentCIError('invalid-response', response.status);
          const code = (value as {error: {code: string}}).error.code;
          if (response.status === 503 && attempt < this.#maxAttempts) {
            await delay(1000, undefined, {signal}); continue;
          }
          throw new AgentCIError(code, response.status);
        }
        return {value, location: response.headers.get('location')};
      } catch (error) {
        if (error instanceof AgentCIError) throw error;
        if (signal.aborted || attempt >= this.#maxAttempts) throw new AgentCIError('transport-failure');
        try {await delay(Math.min(100 * 2 ** (attempt - 1), 1000), undefined, {signal});}
        catch {throw new AgentCIError('transport-failure');}
      }
    }
  }
  async profiles(): Promise<ReviewerProfileList> {
    const {value} = await this.request('/v1/reviewer-profiles', false, 200);
    try {return validateReviewerProfileList(value);} catch {throw new AgentCIError('invalid-response');}
  }
  async submit(value: unknown): Promise<ModelReviewAccepted> {
    const request = this.admission(value), reply = await this.request('/v1/model-reviews', true, 202, canonical(request));
    let accepted: ModelReviewAccepted;
    try {accepted = validateModelReviewAccepted(reply.value);} catch {throw new AgentCIError('invalid-response');}
    if (accepted.id !== request.id || accepted.requestDigest !== digest(canonical(request)) || reply.location !== `/v1/model-reviews/${request.id}`)
      throw new AgentCIError('identity-mismatch');
    return accepted;
  }
  async show(expected: ReviewAdmissionRequest): Promise<ModelReviewStatus> {
    const request = this.admission(expected), {value} = await this.request(`/v1/model-reviews/${request.id}`, false, 200);
    let record: ModelReviewStatus;
    try {record = validateModelReviewStatus(value);} catch {throw new AgentCIError('invalid-response');}
    if (canonical(record.admission.request) !== canonical(request) || record.admission.digest !== digest(canonical(request)))
      throw new AgentCIError('identity-mismatch');
    return record;
  }
  async cancel(expected: ReviewAdmissionRequest): Promise<ModelReviewCancellation> {
    if (!this.#operatorToken) throw new AgentCIError('operator-token-required');
    const request = this.admission(expected);
    // The immutable admission subject must match before requesting cancellation.
    await this.show(request);
    const {value} = await this.request(`/v1/model-reviews/${request.id}/cancellation`, true, 202);
    let result: ModelReviewCancellation;
    try {result = validateModelReviewCancellation(value);} catch {throw new AgentCIError('invalid-response');}
    if (result.id !== request.id) throw new AgentCIError('identity-mismatch');
    return result;
  }
}
