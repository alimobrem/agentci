import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {lstat} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import type {ReviewJob} from './webhook.ts';
import type {EvidenceRecord} from '../storage/postgres.ts';
import {artifactUrl,verifyExport} from './dogfood.ts';
import {EvalExportVerifier,MAX_EXPORT_FRAME_BYTES,type ExportItem,type ExportHeader} from '../evals/export.ts';
import {evalCheckEvidence,type EvalCheckEvidence} from './eval-check.ts';
import {validateRunnerPolicy} from '../evals/runner.ts';
export const MAX_HOSTED_EXPORT_BYTES=256*1024*1024;
export interface HostedProducer {version:string;sourceCommit:string;repository:string;installationId:number;runId:string;runAttempt:string;runnerImage:string;evaluatorImage:string}
export interface HostedReview {job:ReviewJob;attemptId:string;status:'completed'|'unavailable'|'superseded';record?:EvidenceRecord;comparison?:{id:string;reviewId:string;file:string;sha256:string;bytes:number}}
export interface HostedReport {schemaVersion:'v1alpha1';producer:HostedProducer;reviews:HostedReview[];failed:boolean}
const uuid=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const keys=(value:unknown,allowed:string[])=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>allowed.includes(k));
export function verifyHostedReport(value:unknown,expected:HostedProducer,retainedArtifact:string):HostedReport{
  const report=value as HostedReport,url=artifactUrl(retainedArtifact,expected.repository);
  if(!keys(report,['schemaVersion','producer','reviews','failed'])||report.schemaVersion!=='v1alpha1'||typeof report.failed!=='boolean'||!keys(report.producer,Object.keys(expected))||Object.keys(expected).some(k=>report.producer[k as keyof HostedProducer]!==expected[k as keyof HostedProducer])||!Array.isArray(report.reviews)||report.reviews.length>100)throw new Error('Hosted producer identity mismatch');
  if(!/^[a-f0-9]{40}$/.test(expected.sourceCommit)||!/^\d+$/.test(expected.runId)||!/^\d+$/.test(expected.runAttempt)||!url.includes(`/actions/runs/${expected.runId}/artifacts/`))throw new Error('Hosted source/run identity mismatch');
  validateRunnerPolicy({image:expected.runnerImage});validateRunnerPolicy({image:expected.evaluatorImage});
  const attempts=new Set<string>();
  for(const review of report.reviews){
    const job=review.job;
    if(!keys(review,['job','attemptId','status','record','comparison'])||!keys(job,['repository','installationId','pullRequest','baseSha','headSha'])||job.repository!==expected.repository||job.installationId!==expected.installationId||!Number.isSafeInteger(job.pullRequest)||job.pullRequest<1||![job.baseSha,job.headSha].every(s=>typeof s==='string'&&/^[a-f0-9]{40}$/.test(s))||job.baseSha===job.headSha||!uuid(review.attemptId)||attempts.has(review.attemptId)||!['completed','unavailable','superseded'].includes(review.status))throw new Error('Hosted review identity mismatch');
    attempts.add(review.attemptId);if(review.record)verifyExport(job,review.record,expected.repository,expected.installationId);
    const c=review.comparison;
    if(c&&(!keys(c,['id','reviewId','file','sha256','bytes'])||!uuid(c.id)||!uuid(c.reviewId)||c.file!==`comparison-${c.id}.ndjson`||!/^sha256:[a-f0-9]{64}$/.test(c.sha256)||!Number.isSafeInteger(c.bytes)||c.bytes<1||c.bytes>MAX_HOSTED_EXPORT_BYTES))throw new Error('Invalid hosted export descriptor');
    if(review.status==='completed'&&(!review.record||!c||c.reviewId!==review.record.id))throw new Error('Completed hosted review lacks retained evidence');
  }
  if(report.reviews.some(r=>r.status==='unavailable')&&!report.failed)throw new Error('Hosted failure cannot be hidden');
  return report;
}
/** Both the file digest and every chained frame are checked before any Check publication. */
export async function verifyHostedComparison(path:string,review:HostedReview,organizationId:string,runnerImage:string):Promise<{header:ExportHeader;evidence?:EvalCheckEvidence}>{
  validateRunnerPolicy({image:runnerImage});
  const c=review.comparison;if(!c)throw new Error('Missing hosted comparison');
  const metadata=await lstat(path);if(!metadata.isFile()||metadata.size!==c.bytes||metadata.size>MAX_HOSTED_EXPORT_BYTES)throw new Error('Hosted export size mismatch');
  const hash=createHash('sha256');let observedBytes=0;
  const expected={organizationId,reviewId:c.reviewId,attemptId:review.attemptId,repository:review.job.repository,pullRequest:review.job.pullRequest,baseSha:review.job.baseSha,headSha:review.job.headSha};
  const verifier=new EvalExportVerifier(c.id,expected);
  async function* items():AsyncGenerator<ExportItem>{
    const stream=createReadStream(path);stream.on('data',chunk=>{observedBytes+=chunk.length;if(observedBytes>MAX_HOSTED_EXPORT_BYTES)stream.destroy(new Error('Hosted export exceeds retention budget'));else hash.update(chunk);});const lines=createInterface({input:stream,crlfDelay:Infinity});
    try{for await(const line of lines){if(!line||Buffer.byteLength(line)>MAX_EXPORT_FRAME_BYTES)throw new Error('Invalid hosted export frame size');const frame=verifier.push(JSON.parse(line));if(frame.type==='unit'&&frame.data.runnerImage!==runnerImage)throw new Error('Hosted runner provenance mismatch');const {sequence,previousDigest,digest,...item}=frame;yield item;}}
    finally{lines.close();stream.destroy();}
  }
  let evidence:EvalCheckEvidence|undefined;
  if(review.status==='completed')evidence=await evalCheckEvidence(items(),c.id,expected);else for await(const _ of items()){}
  if(observedBytes!==c.bytes||`sha256:${hash.digest('hex')}`!==c.sha256)throw new Error('Hosted export file digest mismatch');
  const result=verifier.finish();return {header:result.header,...(evidence?{evidence}:{})};
}
