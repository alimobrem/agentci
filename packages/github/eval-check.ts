import type {Octokit} from '@octokit/rest';
import type {ReviewJob} from './webhook.ts';
import {currentPullRequest} from './client.ts';
import {artifactUrl} from './dogfood.ts';
import {EvalExportVerifier,frameExport,type ExportItem,type ExportIdentity,type ExportSummary,type ExportHeader} from '../evals/export.ts';
export interface EvalCheckEvidence {comparisonId:string;reviewId:string;attemptId:string;identity:ExportIdentity;snapshotDigest:string;endDigest:string;summary:ExportSummary;text:string;abbreviated:boolean;coverageGaps:number;selectionGaps:number;suiteChanges:number;regressions:number}
const escape=(value:string)=>value.replace(/[\x00-\x1f\x7f\u2028\u2029]/g,' ').replace(/[\\`*_{}\[\]()<>#!]/g,'\\$&');
/** Display is bounded, but every frame is validated before a completed summary is returned. */
export async function evalCheckEvidence(items:AsyncIterable<ExportItem>,id:string,expected:ExportIdentity):Promise<EvalCheckEvidence>{
  const verifier=new EvalExportVerifier(id,expected);let abbreviated=false,regressions=0;
  const sections={regressions:{lines:[] as string[],bytes:0,budget:12000},gaps:{lines:[] as string[],bytes:0,budget:8000},deltas:{lines:[] as string[],bytes:0,budget:16000},context:{lines:[] as string[],bytes:0,budget:12000}};
  const line=(value:string,section:keyof typeof sections='context')=>{const target=sections[section],size=Buffer.byteLength(value)+1;if(target.bytes+size>target.budget){abbreviated=true;return;}target.lines.push(value);target.bytes+=size;};
  for await(const raw of frameExport(items)){
    const frame=verifier.push(raw);
    if(frame.type==='header'){
      for(const change of frame.data.suiteChanges){line(`Suite ${escape(change.suite)}: ${change.kind}; base revision ${change.baseRevision??'none'}; head revision ${change.headRevision??'none'}.`);for(const scenario of change.removedScenarios)line(`- Removed scenario: ${escape(scenario)}`);for(const scenario of change.addedScenarios)line(`- Added scenario: ${escape(scenario)}`);}
      for(const gap of frame.data.coverageGaps)line(`Uncovered requirement: ${escape(gap)}`,'gaps');
      for(const gap of frame.data.selectionGaps)line(`Selection gap: ${escape(gap)}`,'gaps');
    }else if(frame.type==='unit'){
      const u=frame.data;line(`Unit ${u.id}: ${escape(u.suite)} / ${escape(u.model??'default model')} / ${u.side}; assertions ${u.assertionSide}; ${u.status}; ${u.trials} trials; required pass rate ${u.passRate}; critical-failure limit ${u.maxCriticalFailures}; revision ${u.revision}.`,u.result&&u.result.status!=='passed'?'regressions':'context');
      line(`Runner: ${u.runnerImage??`${u.runnerProvider!.id}@${u.runnerProvider!.revision}`}`);
      for(const s of u.result?.scenarios??[])line(`- ${escape(s.id)}: ${s.status}; passed ${s.passed}, failed ${s.failed}, errors ${s.errors}, skipped ${s.skipped}, critical failures ${s.criticalFailures}${s.confidenceInterval?`; Wilson ${s.confidenceInterval.level}: [${s.confidenceInterval.lower}, ${s.confidenceInterval.upper}]`:''}${s.metrics?`; observed metrics ${escape(JSON.stringify(s.metrics))}`:''}.`,s.status==='passed'?'context':'regressions');
    }else if(frame.type==='comparison'){
      const c=frame.data;regressions+=c.regressions.length;line(`Comparison ${escape(c.suite)} / ${escape(c.model??'default model')}: ${c.regressions.length} regressions; base run ${c.baseRunId}; head run ${c.headRunId}.`,c.regressions.length?'regressions':'deltas');
      for(const d of c.deltas)line(`- ${escape(d.scenario)}: ${d.baseStatus} → ${d.headStatus}; pass-rate delta ${d.passRateDelta??'unavailable'}; critical-failure delta ${d.criticalFailureDelta}; regression ${d.regression}.`,d.regression?'regressions':'deltas');
      for(const scenario of c.regressions)line(`Regression: ${escape(scenario)}`,'regressions');
    }else if(frame.type==='summary')for(const gap of frame.data.executionGaps)line(`Execution gap: ${escape(gap)}`,'gaps');
  }
  const {header,summary,endDigest}=verifier.finish();
  if(header.cancelRequested||summary.state!=='completed'||summary.outcome==='pending')throw new Error('Eval comparison is not complete');
  return {comparisonId:id,reviewId:header.reviewId,attemptId:header.attemptId,identity:{organizationId:header.organizationId,reviewId:header.reviewId,attemptId:header.attemptId,...header.subject},snapshotDigest:header.snapshotDigest,endDigest,summary,text:Object.values(sections).flatMap(section=>section.lines).join('\n'),abbreviated,coverageGaps:header.coverageGaps.length,selectionGaps:header.selectionGaps.length,suiteChanges:header.suiteChanges.length,regressions};
}
export function evalPublicationKey(job:ReviewJob):string{return `evals:${job.repository}:${job.pullRequest}:${job.baseSha}:${job.headSha}`;}
function origin(value:string):string{
  const url=new URL(value);
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||url.hostname.length>253||(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname))))throw new Error('Invalid Check evidence origin');
  return url.origin;
}
/** Caller holds the SQL publication lock. Final remote recheck follows Check reconciliation reads. */
async function reconcile(client:Octokit,appId:number,job:ReviewJob,attemptId:string,output:{title:string;summary:string},conclusion:'neutral'|'action_required'|undefined,detailsUrl?:string,status:'in_progress'|'completed'='completed',allowExistingTerminalStale=false):Promise<'published'|'superseded'>{
  const [owner,repo]=job.repository.split('/'),externalId=`agentci:evals:${job.pullRequest}:${job.baseSha}:${job.headSha}:${attemptId}`;
  const listed=await client.paginate(client.checks.listForRef,{owner:owner!,repo:repo!,ref:job.headSha,check_name:'agentci/evals',filter:'all',per_page:100});
  const existing=listed.find(run=>run.external_id===externalId&&run.app?.id===appId&&run.head_sha===job.headSha&&run.name==='agentci/evals');
  if(!await currentPullRequest(client,job)&&!(allowExistingTerminalStale&&existing&&status==='completed'&&conclusion==='action_required'))return 'superseded';
  const params={owner:owner!,repo:repo!,name:'agentci/evals',head_sha:job.headSha,external_id:externalId,status,...(conclusion?{conclusion}:{}),output,...(detailsUrl?{details_url:detailsUrl}:{})};
  if(existing)await client.checks.update({...params,check_run_id:existing.id});else await client.checks.create(params);
  return 'published';
}
export async function publishEvalProgress(client:Octokit,appId:number,job:ReviewJob,attemptId:string,header:ExportHeader,publicUrl:string):Promise<'published'|'superseded'>{
  const s=header.subject;
  if(header.cancelRequested||header.attemptId!==attemptId||s.repository!==job.repository||s.pullRequest!==job.pullRequest||s.baseSha!==job.baseSha||s.headSha!==job.headSha)throw new Error('Invalid in-progress comparison identity');
  const url=`${origin(publicUrl)}/v1/eval-comparisons/${header.id}`;
  return reconcile(client,appId,job,attemptId,{title:'AgentCI evals in progress',summary:`Evaluation in progress. No completed behavioral result is claimed. Base: ${job.baseSha}; head: ${job.headSha}; planned units: ${header.unitCount}; comparison: ${header.id}; attempt: ${attemptId}. [Authenticated evidence](${url})`},undefined,url,'in_progress');
}
function completedCheckOutput(job:ReviewJob,attemptId:string,evidence:EvalCheckEvidence,links:string,notice:string){
  const identity=evidence.identity;
  if(evidence.attemptId!==attemptId||identity.attemptId!==attemptId||identity.repository!==job.repository||identity.pullRequest!==job.pullRequest||identity.baseSha!==job.baseSha||identity.headSha!==job.headSha||evidence.summary.state!=='completed'||evidence.summary.outcome==='pending')throw new Error('Check attempt identity mismatch');
  const s=evidence.summary;
  const summary=[`Advisory behavioral evaluation: **${s.outcome}**.`, `Base: ${job.baseSha}; head: ${job.headSha}.`,`Units: ${s.unitCount}; paired comparisons: ${s.comparisonCount}; regressions: ${evidence.regressions}; suite changes: ${evidence.suiteChanges}; requirement gaps: ${evidence.coverageGaps}; selection gaps: ${evidence.selectionGaps}; execution gaps: ${s.executionGaps.length}.`,`Comparison: ${evidence.comparisonId}; review: ${evidence.reviewId}; attempt: ${attemptId}.`,`Snapshot: ${evidence.snapshotDigest}; completed export: ${evidence.endDigest}.`,evidence.text,evidence.abbreviated?'Display abbreviated; full results and gaps remain in the authenticated evidence export.':'',links,notice].filter(Boolean).join('\n');
  if(Buffer.byteLength(summary)>60000)throw new Error('Check summary exceeds display budget');
  return {output:{title:`AgentCI evals: ${s.outcome}`,summary},conclusion:(s.outcome==='error'||s.outcome==='insufficient'?'action_required':'neutral') as 'action_required'|'neutral'};
}
export async function publishEvalCheck(client:Octokit,appId:number,job:ReviewJob,attemptId:string,evidence:EvalCheckEvidence,publicUrl:string):Promise<'published'|'superseded'>{
  const url=`${origin(publicUrl)}/v1/eval-comparisons/${evidence.comparisonId}`;
  const {output,conclusion}=completedCheckOutput(job,attemptId,evidence,`[Detailed evidence](${url}) · [Complete export](${url}/export)`,'Agent evidence access requires the deployment bearer token; credentials are never included in these links.');
  return reconcile(client,appId,job,attemptId,output,conclusion,url);
}
/** Hosted evidence is retained before this call; ephemeral SQL cannot supply a service URL. */
export async function publishHostedEvalCheck(client:Octokit,appId:number,job:ReviewJob,attemptId:string,evidence:EvalCheckEvidence,retainedArtifact:string):Promise<'published'|'superseded'>{
  const url=artifactUrl(retainedArtifact,job.repository);
  if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(evidence.comparisonId))throw new Error('Invalid hosted export identity');
  const {output,conclusion}=completedCheckOutput(job,attemptId,evidence,`[Retained evidence and complete export](${url})`,'Complete export file: comparison-'+evidence.comparisonId+'.ndjson. GitHub artifact access and retention apply; no service bearer token or live API is required.');
  return reconcile(client,appId,job,attemptId,output,conclusion,url);
}
export async function publishHostedEvalUnavailable(client:Octokit,appId:number,job:ReviewJob,attemptId:string,retainedArtifact:string,header?:ExportHeader):Promise<'published'|'superseded'>{
  const url=artifactUrl(retainedArtifact,job.repository);
  if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(attemptId))throw new Error('Invalid hosted attempt identity');
  if(header&&(header.attemptId!==attemptId||header.subject.repository!==job.repository||header.subject.pullRequest!==job.pullRequest||header.subject.baseSha!==job.baseSha||header.subject.headSha!==job.headSha))throw new Error('Retained comparison identity mismatch');
  const summary=[`Evaluation infrastructure/input failure or cancellation. No passing behavioral result is claimed. Base: ${job.baseSha}; head: ${job.headSha}; attempt: ${attemptId}.`,header?`Comparison: ${header.id}; review: ${header.reviewId}. Retained observations may be partial; export file: comparison-${header.id}.ndjson.`:'No staged comparison evidence is available.',`[Retained hosted evidence](${url})`,'Resolve the cause and dispatch a fresh hosted review. Each hosted run uses a new attempt; replaying an old attempt does not rerun it.'].join('\n');
  return reconcile(client,appId,job,attemptId,{title:'AgentCI evals unavailable',summary},'action_required',url,'completed',true);
}
export async function publishEvalUnavailable(client:Octokit,appId:number,job:ReviewJob,attemptId:string,reason:'unavailable'|'cancelled'='unavailable',retained?:{header:ExportHeader;publicUrl:string}):Promise<'published'|'superseded'>{
  let url:string|undefined,identity='';
  if(retained){
    const h=retained.header,s=h.subject;
    if(h.attemptId!==attemptId||s.repository!==job.repository||s.pullRequest!==job.pullRequest||s.baseSha!==job.baseSha||s.headSha!==job.headSha)throw new Error('Retained comparison identity mismatch');
    url=`${origin(retained.publicUrl)}/v1/eval-comparisons/${h.id}`;
    identity=`Comparison: ${h.id}; review: ${h.reviewId}; attempt: ${attemptId}.\n[Retained authenticated evidence](${url}) · [Complete export](${url}/export)\nEvidence requires the deployment bearer token; credentials are never included in these links.`;
  }
  const summary=[`${reason==='cancelled'?'Evaluation cancelled.':'Evaluation infrastructure/input failure after retries.'} No passing behavioral result is claimed. Base: ${job.baseSha}; head: ${job.headSha}; attempt: ${attemptId}.`,identity||'No staged comparison evidence is available.', 'Retained observations may be partial. After resolving the cause, request a fresh attempt with agentci review using your private operator config and this PR number. Repeating or redelivering this failed request UUID does not rerun it.'].join('\n');
  return reconcile(client,appId,job,attemptId,{title:`AgentCI evals ${reason}`,summary},'action_required',url,'completed',true);
}
