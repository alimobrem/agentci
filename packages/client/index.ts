import { readFileSync } from 'node:fs';
import { Ajv } from 'ajv';
import { validateDocument } from '../schemas/index.ts';
import { canonical, digest } from '../review/engine.ts';
import type { EvidenceRecord } from '../storage/postgres.ts';
import {validateComparisonRecord,type ComparisonRecord} from '../evals/comparison.ts';
const validateAnalysis = new Ajv({ strict: true }).compile(JSON.parse(readFileSync(new URL('../review/analysis.schema.json', import.meta.url), 'utf8')));
export class AgentCIError extends Error {
  constructor(public code: string, public status?: number) { super(`AgentCI: ${code}${status ? ` (${status})` : ''}`); this.name = 'AgentCIError'; }
}
export interface ReviewIdentity { repository: string; baseSha: string; headSha: string; pullRequest: number }
export interface ComparisonIdentity extends ReviewIdentity {organizationId:string;reviewId:string;attemptId:string}
/** Node client for the current single-repository evidence API, not a review scheduler. */
export class AgentCIClient {
  private origin: string;
  #token: string;
  constructor(options: { url: string; token: string; timeoutMs?: number }) {
    const url = new URL(options.url);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
        (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw new AgentCIError('invalid-origin');
    if (options.token.length < 32 || /[\r\n]/.test(options.token)) throw new AgentCIError('invalid-token');
    this.origin = url.origin; this.#token = options.token;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1) throw new AgentCIError('invalid-timeout');
  }
  private timeoutMs: number;
  private async get(path: string, authenticated: boolean): Promise<any> {
    try {
      const response = await fetch(`${this.origin}${path}`, { redirect: 'error', headers: authenticated ? { authorization: `Bearer ${this.#token}` } : {}, signal: AbortSignal.timeout(this.timeoutMs) });
      if (!response.ok) throw new AgentCIError(({ 401: 'unauthorized', 404: 'not-found', 400: 'invalid-request', 413:'response-too-large', 503: 'service-unavailable' } as Record<number, string>)[response.status] ?? 'http-error', response.status);
      const reader = response.body?.getReader(); if (!reader) throw new AgentCIError('invalid-response');
      const chunks: Uint8Array[] = []; let bytes = 0;
      try { while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > 4 * 1024 * 1024) throw new AgentCIError('response-too-large'); chunks.push(value); } }
      finally { await reader.cancel(); }
      try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new AgentCIError('invalid-response'); }
    } catch (error) { if (error instanceof AgentCIError) throw error; throw new AgentCIError('transport-failure'); }
  }
  async ready(): Promise<{ status: 'ready' }> {
    const value = await this.get('/readyz', false);
    if (!value || value.status !== 'ready' || Object.keys(value).length !== 1) throw new AgentCIError('invalid-response');
    return value;
  }
  async evidence(id: string, expected: ReviewIdentity): Promise<EvidenceRecord> {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) throw new AgentCIError('invalid-evidence-id');
    const record = await this.get(`/v1/evidence/${id}`, true);
    if (!record || Object.keys(record).sort().join(',') !== 'analysis,digest,evidence,id' || record.id !== id ||
        !validateDocument('evidence', record.evidence).valid || !validateAnalysis(record.analysis)) throw new AgentCIError('invalid-evidence');
    if (record.evidence.id !== id || record.evidence.subject.gitSha !== record.analysis.headSha ||
        record.analysis.repository !== expected.repository || record.analysis.baseSha !== expected.baseSha || record.analysis.headSha !== expected.headSha || record.evidence.subject.pullRequest !== expected.pullRequest) throw new AgentCIError('identity-mismatch');
    if (record.digest !== digest(canonical(record.analysis)) || !record.evidence.artifacts.some((a: any) => a.digest === record.digest && a.uri === `urn:agentci:analysis:${id}`)) throw new AgentCIError('digest-mismatch');
    return record;
  }
  async evalComparison(id:string,expected:ComparisonIdentity):Promise<ComparisonRecord>{
    if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))throw new AgentCIError('invalid-comparison-id');
    const value=await this.get(`/v1/eval-comparisons/${id}`,true);
    let record:ComparisonRecord;try{record=validateComparisonRecord(value);}catch{throw new AgentCIError('invalid-comparison');}
    const c=record.comparison,s=c.subject;
    if(record.id!==id||c.organizationId!==expected.organizationId||c.reviewId!==expected.reviewId||c.attemptId!==expected.attemptId||s.repository!==expected.repository||s.baseSha!==expected.baseSha||s.headSha!==expected.headSha||s.pullRequest!==expected.pullRequest)throw new AgentCIError('identity-mismatch');
    return record;
  }
}
