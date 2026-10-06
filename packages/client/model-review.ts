import {setTimeout as delay} from 'node:timers/promises';
import {canonical, digest} from '../review/engine.ts';
import {validateReviewAdmission, type ReviewAdmissionRequest} from '../reviewers/admission.ts';
import {
  validateModelReviewAccepted, validateModelReviewStatus, validateModelReviewCancellation, validateReviewerProfileList,
  type ModelReviewAccepted, type ModelReviewStatus, type ModelReviewCancellation, type ReviewerProfileList
} from '../reviewers/transport.ts';
import {AgentCIError} from './index.ts';
import {validateModelReviewFindings, validateModelFindingHistory, type ModelReviewFindings, type ModelFindingHistory} from '../reviewers/finding-transport.ts';
import {validateFindingHistoryRecord} from '../findings/history.ts';
import type {FindingHistoryRecord} from '../findings/history.ts';

export interface ModelReviewReadOptions {limit?: number; signal?: AbortSignal}

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
  private async request(path: string, mutation: boolean, status: number, body?: string, externalSignal?: AbortSignal): Promise<{value: unknown; location: string | null}> {
    const token = mutation ? this.#operatorToken : this.#readToken ?? this.#operatorToken;
    if (!token) throw new AgentCIError('operator-token-required');
    // One overall deadline includes response bodies and backoff. Retried writes
    // keep exactly the same normalized admission ID/body or cancellation path.
    const signal = AbortSignal.any([AbortSignal.timeout(this.#timeoutMs), ...(externalSignal ? [externalSignal] : [])]);
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
  async show(expected: ReviewAdmissionRequest, options: {signal?: AbortSignal} = {}): Promise<ModelReviewStatus> {
    const request = this.admission(expected), {value} = await this.request(`/v1/model-reviews/${request.id}`, false, 200, undefined, options.signal);
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
  private findingId(id: string): string {
    if (typeof id !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(id)) throw new AgentCIError('invalid-request');
    return id;
  }
  private readOptions(options: ModelReviewReadOptions) {
    const limit = options.limit ?? 25;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new AgentCIError('invalid-request');
    return {limit, signal: AbortSignal.any([AbortSignal.timeout(120000), ...(options.signal ? [options.signal] : [])])};
  }
  /** Complete pinned finding references. Pages cannot substitute later dispositions. */
  async findings(expected: ReviewAdmissionRequest, options: ModelReviewReadOptions = {}): Promise<ModelReviewFindings> {
    const request = this.admission(expected), {limit, signal} = this.readOptions(options), status = await this.show(request, {signal});
    if (!status.summary) throw new AgentCIError('review-not-complete', 409);
    const manifest = [...status.summary.summary.findings].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const items: ModelReviewFindings['items'] = [], cursors = new Set<string>(); let cursor: string | null = null;
    for (let pageNumber = 0; pageNumber <= manifest.length; pageNumber++) {
      const query = new URLSearchParams({limit: String(limit)}); if (cursor) query.set('cursor', cursor);
      const {value} = await this.request(`/v1/model-reviews/${request.id}/findings?${query}`, false, 200, undefined, signal);
      let page: ModelReviewFindings;
      try {page = validateModelReviewFindings(value);} catch {throw new AgentCIError('invalid-response');}
      if (page.reviewId !== request.id || page.summaryDigest !== status.summary.digest) throw new AgentCIError('identity-mismatch');
      if (page.items.length > limit) throw new AgentCIError('invalid-response');
      for (const item of page.items) {
        const pinned = manifest[items.length];
        if (!pinned || item.id !== pinned.id || item.digest !== pinned.digest) throw new AgentCIError('identity-mismatch');
        items.push(item);
      }
      if (page.nextCursor === null) {
        if (items.length !== manifest.length) throw new AgentCIError('incomplete-findings');
        return {...page, items, nextCursor: null};
      }
      if (!page.items.length || cursors.has(page.nextCursor) || items.length >= manifest.length) throw new AgentCIError('invalid-response');
      cursors.add(page.nextCursor); cursor = page.nextCursor;
    }
    throw new AgentCIError('incomplete-findings');
  }
  /** Current finding by default; version selects an immutable historical event. */
  async finding(expected: ReviewAdmissionRequest, id: string, options: {version?: number} = {}): Promise<FindingHistoryRecord> {
    const request = this.admission(expected); this.findingId(id);
    if (options.version !== undefined && (!Number.isSafeInteger(options.version) || options.version < 1 || options.version > 10000)) throw new AgentCIError('invalid-request');
    await this.show(request);
    const query = new URLSearchParams({reviewId: request.id}); if (options.version !== undefined) query.set('version', String(options.version));
    const {value} = await this.request(`/v1/findings/${id}?${query}`, false, 200);
    let record: FindingHistoryRecord;
    try {record = validateFindingHistoryRecord(value, request.subject);} catch {throw new AgentCIError('invalid-response');}
    if (record.event.finding.id !== id || options.version !== undefined && record.event.finding.version !== options.version) throw new AgentCIError('identity-mismatch');
    return record;
  }
  /** Verified pages of one immutable watermark. Full traversal requires iterator completion. */
  async *findingHistory(expected: ReviewAdmissionRequest, id: string, options: ModelReviewReadOptions = {}): AsyncGenerator<ModelFindingHistory> {
    const request = this.admission(expected); this.findingId(id);
    const {limit, signal} = this.readOptions(options); await this.show(request, {signal});
    let cursor: string | null = null, throughVersion: number | undefined, previous: FindingHistoryRecord | undefined, count = 0, bytes = 0;
    const cursors = new Set<string>();
    for (let pageNumber = 0; pageNumber < 10000; pageNumber++) {
      const query = new URLSearchParams({reviewId: request.id, limit: String(limit)}); if (cursor) query.set('cursor', cursor);
      const {value} = await this.request(`/v1/findings/${id}/history?${query}`, false, 200, undefined, signal);
      let page: ModelFindingHistory;
      try {page = await validateModelFindingHistory(value, request.subject, previous);} catch {throw new AgentCIError('invalid-response');}
      if (page.reviewId !== request.id || page.findingId !== id || throughVersion !== undefined && page.throughVersion !== throughVersion) throw new AgentCIError('identity-mismatch');
      throughVersion = page.throughVersion;
      if (!page.items.length || page.items.length > limit) throw new AgentCIError('invalid-response');
      for (const record of page.items) {
        if (record.event.finding.id !== id || record.event.finding.version !== count + 1 || record.event.previousDigest !== (previous?.digest ?? null)) throw new AgentCIError('invalid-history');
        bytes += Buffer.byteLength(JSON.stringify(record)); if (bytes > 32 * 1024 * 1024) throw new AgentCIError('response-too-large');
        count++; previous = record;
      }
      if (count > throughVersion || page.nextCursor === null && count !== throughVersion) throw new AgentCIError('incomplete-history');
      if (page.nextCursor !== null && (cursors.has(page.nextCursor) || count >= throughVersion)) throw new AgentCIError('invalid-history');
      yield page;
      if (page.nextCursor === null) return;
      cursors.add(page.nextCursor); cursor = page.nextCursor;
    }
    throw new AgentCIError('incomplete-history');
  }
}
