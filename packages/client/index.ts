import {validateIntentRecord,type IntentRecord,type IntentSubject} from '../review/intent.ts';
export type {IntentRecord,IntentSubject} from '../review/intent.ts';
import type {ResponseReadBudget} from './read-budget.ts';
export type {ResponseReadBudget} from './read-budget.ts';
import {equalUuid} from '../identity/uuid.ts';
import { readFileSync } from 'node:fs';
import { Ajv } from 'ajv';
import { validateDocument } from '../schemas/index.ts';
import { canonical, digest } from '../review/engine.ts';
import type { EvidenceRecord } from '../storage/postgres.ts';
import {validateComparisonRecord,type ComparisonRecord} from '../evals/comparison.ts';
import {EvalExportVerifier,ExportIdentityMismatch,MAX_EXPORT_FRAME_BYTES,type ExportItem} from '../evals/export.ts';
export {ModelReviewClient, type ModelReviewClientOptions, type ModelReviewReadOptions, type ModelReviewExportOutput} from './model-review.ts';
export type {ModelReviewFindings, ModelFindingHistory} from '../reviewers/finding-transport.ts';
export type {ModelReviewExportHeader, ModelReviewExportFrame} from '../reviewers/export.ts';
export type {ReproductionReference,FindingReproductionStatus,FindingReproductionCancellation} from '../findings/reproduction-transport.ts';
export type {FindingHistoryRecord} from '../findings/history.ts';
export type {ReviewAdmissionRequest} from '../reviewers/admission.ts';
export type {ModelReviewAccepted, ModelReviewStatus, ModelReviewCancellation, ReviewerProfileList} from '../reviewers/transport.ts';
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
  constructor(options: { url: string; token: string; timeoutMs?: number; readBudget?:ResponseReadBudget }) {
    const url = new URL(options.url);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
        (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw new AgentCIError('invalid-origin');
    if (options.token.length < 32 || /[\r\n]/.test(options.token)) throw new AgentCIError('invalid-token');
    this.origin = url.origin; this.#token = options.token;
    if(options.readBudget!==undefined&&typeof options.readBudget.consume!=='function')throw new AgentCIError('invalid-request');
    this.#readBudget=options.readBudget;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1) throw new AgentCIError('invalid-timeout');
  }
  private timeoutMs: number;
   #readBudget?:ResponseReadBudget;
  private async get(path: string, authenticated: boolean, callerSignal?:AbortSignal): Promise<any> {
    try {
      const response = await fetch(`${this.origin}${path}`, { redirect: 'error', headers: authenticated ? { authorization: `Bearer ${this.#token}` } : {}, signal: AbortSignal.any([AbortSignal.timeout(this.timeoutMs),...(callerSignal?[callerSignal]:[])]) });

      const reader = response.body?.getReader(); if (!reader) throw new AgentCIError('invalid-response');
      const chunks: Uint8Array[] = []; let bytes = 0;
      try { while (true) { const { done, value } = await reader.read(); if (done) break; this.#readBudget?.consume(value.byteLength); bytes += value.byteLength; if (bytes > 4 * 1024 * 1024) throw new AgentCIError('response-too-large'); chunks.push(value); } }
      finally { await reader.cancel().catch(()=>{}); }
      if (!response.ok) throw new AgentCIError(({ 401: 'unauthorized', 404: 'not-found', 400: 'invalid-request', 413:'response-too-large', 503: 'service-unavailable' } as Record<number, string>)[response.status] ?? 'http-error', response.status);
      try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new AgentCIError('invalid-response'); }
    } catch (error) { if (error instanceof AgentCIError) throw error; throw new AgentCIError('transport-failure'); }
  }
  async ready(): Promise<{ status: 'ready' }> {
    const value = await this.get('/readyz', false);
    if (!value || value.status !== 'ready' || Object.keys(value).length !== 1) throw new AgentCIError('invalid-response');
    return value;
  }
  async intent(id:string,expected:IntentSubject&{digest:string},options:{signal?:AbortSignal}={}):Promise<IntentRecord|undefined>{
    if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)||!/^sha256:[a-f0-9]{64}$/.test(expected.digest))throw new AgentCIError('invalid-request');
    let value;try{value=await this.get(`/v1/evidence/${id}/intent`,true,options.signal);}catch(error){if(error instanceof AgentCIError&&error.status===404)return undefined;throw error;}
    try{return validateIntentRecord(value,{...expected,reviewId:id});}catch{throw new AgentCIError('invalid-intent');}
  }
  async evidence(id: string, expected: ReviewIdentity, options:{signal?:AbortSignal}={}): Promise<EvidenceRecord> {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) throw new AgentCIError('invalid-evidence-id');
    const record = await this.get(`/v1/evidence/${id}`, true,options.signal);
    if (!record || Object.keys(record).sort().join(',') !== 'analysis,digest,evidence,id' || record.id !== id ||
        !validateDocument('evidence', record.evidence).valid || !validateAnalysis(record.analysis)) throw new AgentCIError('invalid-evidence');
    if (record.evidence.id !== id || record.evidence.subject.gitSha !== record.analysis.headSha ||
        record.analysis.repository !== expected.repository || record.analysis.baseSha !== expected.baseSha || record.analysis.headSha !== expected.headSha || record.evidence.subject.pullRequest !== expected.pullRequest) throw new AgentCIError('identity-mismatch');
    if (record.digest !== digest(canonical(record.analysis)) || !record.evidence.artifacts.some((a: any) => a.digest === record.digest && a.uri === `urn:agentci:analysis:${id}`)) throw new AgentCIError('digest-mismatch');
    return record;
  }
  async evalComparison(id:string,expected:ComparisonIdentity,options:{signal?:AbortSignal}={}):Promise<ComparisonRecord>{
    if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))throw new AgentCIError('invalid-comparison-id');
    const value=await this.get(`/v1/eval-comparisons/${id}`,true,options.signal);
    let record:ComparisonRecord;try{record=validateComparisonRecord(value);}catch{throw new AgentCIError('invalid-comparison');}
    const c=record.comparison,s=c.subject;
    if(!equalUuid(record.id,id)||!equalUuid(c.organizationId,expected.organizationId)||!equalUuid(c.reviewId,expected.reviewId)||!equalUuid(c.attemptId,expected.attemptId)||s.repository!==expected.repository||s.baseSha!==expected.baseSha||s.headSha!==expected.headSha||s.pullRequest!==expected.pullRequest)throw new AgentCIError('identity-mismatch');
    return record;
  }
  /** Provisional header/units/deltas stream; only the final summary certifies complete traversal. */
  async *evalComparisonExport(id:string,expected:ComparisonIdentity,options:{signal?:AbortSignal;timeoutMs?:number}={}):AsyncGenerator<ExportItem>{
    if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))throw new AgentCIError('invalid-comparison-id');
    const timeout=options.timeoutMs??120000;if(!Number.isSafeInteger(timeout)||timeout<1||timeout>120000)throw new AgentCIError('invalid-timeout');
    const signal=AbortSignal.any([AbortSignal.timeout(timeout),...(options.signal?[options.signal]:[])]);
    let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
    try{
      const response=await fetch(`${this.origin}/v1/eval-comparisons/${id}/export`,{redirect:'error',headers:{authorization:`Bearer ${this.#token}`},signal});
      if(!response.ok)throw new AgentCIError(({400:'invalid-request',401:'unauthorized',404:'not-found',503:'service-unavailable'} as Record<number,string>)[response.status]??'http-error',response.status);
      if(!/^application\/x-ndjson(?:;|$)/i.test(response.headers.get('content-type')??''))throw new AgentCIError('invalid-export');
      reader=response.body?.getReader();if(!reader)throw new AgentCIError('invalid-export');
      const verifier=new EvalExportVerifier(id,expected);let parts:Uint8Array[]=[],bytes=0;
      while(true){
        const {done,value}=await reader.read();if(done)break;this.#readBudget?.consume(value.byteLength);
        let start=0;
        for(let i=0;i<=value.length;i++){
          if(i<value.length&&value[i]!==10)continue;
          const segment=value.subarray(start,i);if(verifier.ended&&segment.byteLength)throw new AgentCIError('invalid-export');if(segment.byteLength)parts.push(segment);bytes+=segment.byteLength;if(bytes>MAX_EXPORT_FRAME_BYTES)throw new AgentCIError('response-too-large');
          if(parts.length>1024)parts=[Buffer.concat(parts)];
          start=i+1;if(i===value.length)break;
          if(verifier.ended)throw new AgentCIError('invalid-export');
          let frame;
          try{frame=verifier.push(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts))));}
          catch(error){throw new AgentCIError(error instanceof ExportIdentityMismatch?'identity-mismatch':'invalid-export');}
          parts=[];bytes=0;
          if(frame.type==='header'||frame.type==='unit'||frame.type==='comparison')yield {type:frame.type,data:frame.data} as ExportItem;
        }
      }
      if(bytes)throw new AgentCIError('incomplete-export');
      let certified;try{certified=verifier.finish();}catch{throw new AgentCIError('incomplete-export');}
      yield {type:'summary',data:certified.summary};
    }catch(error){if(error instanceof AgentCIError)throw error;throw new AgentCIError('transport-failure');}
    finally{await reader?.cancel();}
  }
}

export type {FindingReproductionRequest,FindingReproductionAccepted} from '../findings/reproduction-transport.ts';

export type {FindingDispositionRequest} from '../findings/disposition-transport.ts';

/** Strict public admission input validation only; never grants authorization. */
export {validateReviewAdmission} from '../reviewers/admission.ts';
