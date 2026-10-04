import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {verifyHostedReport,verifyHostedComparison,type HostedReport} from '../packages/github/hosted-evidence.ts';import {frameExport} from '../packages/evals/export.ts';import {comparisonFixture} from './fixtures/comparison.ts';import {exportFixture} from './fixtures/export.ts';import {reviewJob,evidenceFixture} from './fixtures/control.ts';
const producer={version:'0.3.0-m2',sourceCommit:'d'.repeat(40),repository:reviewJob.repository,installationId:reviewJob.installationId,runId:'123',runAttempt:'1',runnerImage:'sha256:'+'e'.repeat(64),evaluatorImage:'sha256:'+'f'.repeat(64)},artifact=`https://github.com/${reviewJob.repository}/actions/runs/123/artifacts/456`;
test('hosted producer rejects mismatched source/run/image/scope, hidden failures and incomplete completion',()=>{
 const report:HostedReport={schemaVersion:'v1alpha1',producer,reviews:[{job:reviewJob,attemptId:'00000000-0000-4000-8000-000000000001',status:'unavailable',record:evidenceFixture()}],failed:true};assert.equal(verifyHostedReport(report,producer,artifact),report);
 for(const key of ['sourceCommit','runId','runnerImage','installationId'] as const){const changed=structuredClone(report);(changed.producer as any)[key]='wrong';assert.throws(()=>verifyHostedReport(changed,producer,artifact),/producer identity/);}
 assert.throws(()=>verifyHostedReport(report,producer,artifact.replace('/runs/123/','/runs/124/')),/source\/run/);
 assert.throws(()=>verifyHostedReport({...report,failed:false},producer,artifact),/failure cannot/);
 assert.throws(()=>verifyHostedReport({...report,reviews:[{...report.reviews[0]!,status:'completed'}]},producer,artifact),/lacks retained/);
 assert.throws(()=>verifyHostedReport({...report,reviews:[report.reviews[0]!,report.reviews[0]!]},producer,artifact),/review identity/);
 assert.throws(()=>verifyHostedReport({...report,reviews:[{...report.reviews[0]!,comparison:{id:'00000000-0000-4000-8000-000000000002',reviewId:'00000000-0000-4000-8000-000000000003',file:'../../key.pem',sha256:'sha256:'+'a'.repeat(64),bytes:10}}]},producer,artifact),/descriptor/);
});
test('hosted retained export verifies file and frame digests, scope and complete behavioral outcome',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'agentci-hosted-evidence-'));
 try{const record=await comparisonFixture(),c=record.comparison;let body='';for await(const frame of frameExport(exportFixture(record)))body+=JSON.stringify(frame)+'\n';const file=`comparison-${record.id}.ndjson`,path=join(directory,file),sha=(text:string)=>'sha256:'+createHash('sha256').update(text).digest('hex');await writeFile(path,body);
 const review={job:{repository:c.subject.repository,installationId:12,pullRequest:c.subject.pullRequest,baseSha:c.subject.baseSha,headSha:c.subject.headSha},attemptId:c.attemptId,status:'completed' as const,comparison:{id:record.id,reviewId:c.reviewId,file,sha256:sha(body),bytes:Buffer.byteLength(body)}};
 assert.equal((await verifyHostedComparison(path,review,c.organizationId,c.units[0]!.runnerImage!)).evidence?.summary.outcome,'failed');
 await assert.rejects(verifyHostedComparison(path,review,c.organizationId,'sha256:'+'9'.repeat(64)),/runner provenance/);
 await assert.rejects(verifyHostedComparison(path,{...review,attemptId:'00000000-0000-4000-8000-000000000000'},c.organizationId,c.units[0]!.runnerImage!),/identity mismatch/);
 await assert.rejects(verifyHostedComparison(path,{...review,comparison:{...review.comparison,sha256:'sha256:'+'0'.repeat(64)}},c.organizationId,c.units[0]!.runnerImage!),/file digest/);
 const lines=body.trimEnd().split('\n'),truncated=lines.slice(0,-1).join('\n')+'\n';await writeFile(path,truncated);await assert.rejects(verifyHostedComparison(path,{...review,comparison:{...review.comparison,sha256:sha(truncated),bytes:Buffer.byteLength(truncated)}},c.organizationId,c.units[0]!.runnerImage!),/Incomplete export/);
 const frames=lines.map(line=>JSON.parse(line));frames[1].data.side='head';const tampered=frames.map(f=>JSON.stringify(f)+'\n').join('');await writeFile(path,tampered);await assert.rejects(verifyHostedComparison(path,{...review,comparison:{...review.comparison,sha256:sha(tampered),bytes:Buffer.byteLength(tampered)}},c.organizationId,c.units[0]!.runnerImage!),/frame digest/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
