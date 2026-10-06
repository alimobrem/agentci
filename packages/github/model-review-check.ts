import type {Octokit} from '@octokit/rest';
import {canonical} from '../review/engine.ts';
import {validateReviewAdmission,type ReviewAdmissionRequest} from '../reviewers/admission.ts';
import {validateModelReviewStatus,type ModelReviewStatus} from '../reviewers/transport.ts';
import type {ReviewSubject} from '../reviewers/context.ts';
import {currentPullRequest} from './client.ts';

export interface ModelReviewCheckSource {
 withPublicationLock<T>(key:string,operation:()=>Promise<T>):Promise<T>;
 /** Newest retained admission for the exact subject; order by created_at, then id.
  * Never substitute the requested old admission when newer work is present. */
 latest(subject:ReviewSubject):Promise<ModelReviewStatus|undefined>;
 /** Authoritative admission ordering, never inferred from a remote external ID. */
 olderIds(subject:ReviewSubject,ids:string[],thanId:string):Promise<string[]>;
}
const fail=():never=>{throw Error('invalid-model-review-check-evidence');};
const escape=(v:string)=>v.replace(/[\x00-\x1f\x7f\u2028\u2029]/g,' ').replace(/[\\`*_{}\[\]()<>#!]/g,'\\$&');
function origin(value:string){
 const u=new URL(value);
 if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||u.hostname.length>253||(u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname))))fail();
 return u.origin;
}
/** A complete execution is not a successful behavioral verdict. No model-only
 * finding is promoted to confirmed or blocking from this summary projection. */
export function modelReviewCheckOutput(value:ModelReviewStatus,expected:ReviewSubject,publicUrl:string){
 const checked=validateModelReviewStatus(value),request=checked.admission.request,admissionDigest=checked.admission.digest;
 if(canonical(request.subject)!==canonical(expected))fail();
 const e=checked.execution,terminal=!['queued','dispatched'].includes(e.state),summary=checked.summary?.summary??null;
 const url=`${origin(publicUrl)}/v1/model-reviews/${request.id}`;
 const lines=[`Advisory model review: ${request.mode}; execution ${e.state}.`,`Base: ${expected.baseSha}; head: ${expected.headSha}.`,`Review: ${request.id}; admission: ${admissionDigest}.`,`Profile: ${escape(request.profile.id)}; revision: ${request.profile.revision}.`];
 if(e.cancelRequested)lines.push('Cancellation requested; remote requests may already have incurred charges.');
 if(summary){
  lines.push(`Snapshot: ${value.summary!.digest}; context: ${summary.contextDigest}.`,`Selected coverage: ${summary.coverage.selectedFiles} files, ${summary.coverage.completedRoles}/${summary.coverage.configuredRoles} completed roles; not whole-repository coverage.`);
  for(const role of summary.roles)lines.push(`- ${escape(role.role)}: ${role.status}; request ${role.requestId}; result ${role.digest}.`);
  lines.push(`Retained finding references: ${summary.findings.length}. Findings are advisory proposals; confirmation requires separately verified reproduction evidence.`);
  for(const finding of summary.findings)lines.push(`- Finding ${finding.id}; retained event ${finding.digest}.`);
 }else lines.push('Coverage unknown: no complete retained summary. Missing results are not a clean review.');
 if(request.mode==='synthetic')lines.push('Synthetic fixture execution demonstrates orchestration only; it does not establish model quality or repository correctness.');
 lines.push(`[Authenticated status and retained summary](${url})`,'Evidence requires deployment authentication; credentials are never included in these links.','This Check does not certify merge readiness or absence of defects.');
 const output={title:`AgentCI model review: ${e.state}`,summary:lines.join('\n')};
 if(Buffer.byteLength(output.summary)>60000)fail();
 const incomplete=summary?.roles.some(role=>role.status!=='completed');
 return {output,detailsUrl:url,status:terminal?'completed' as const:'in_progress' as const,...(terminal?{conclusion:e.state==='completed'&&!incomplete?'neutral' as const:'action_required' as const}:{})};
}
export function modelReviewPublicationKey(subject:ReviewSubject){return `model-review:${canonical(subject)}`;}
/** SQL source serializes every publisher for a subject across processes. Newest
 * admission and status are re-read inside that lock, never captured in history. */
export function createModelReviewPublisher(client:Octokit,source:ModelReviewCheckSource,config:{appId:number;installationId:number;organizationId:string;repository:string;publicUrl:string}){
 if(!Number.isSafeInteger(config.appId)||config.appId<1||!Number.isSafeInteger(config.installationId)||config.installationId<1)fail();origin(config.publicUrl);
 return async(requestValue:ReviewAdmissionRequest):Promise<'published'|'superseded'>=>{
  const request=validateReviewAdmission(requestValue),subject=request.subject;
  if(subject.organizationId!==config.organizationId||subject.repository!==config.repository)fail();
  try{return await source.withPublicationLock(modelReviewPublicationKey(subject),async()=>{
   const snapshot=await source.latest(subject);
   if(!snapshot)return 'superseded';
   const selected=validateModelReviewStatus(snapshot).admission.request;
   if(canonical(selected.subject)!==canonical(subject))fail();
   const superseded=selected.id!==request.id;
   if(!superseded&&canonical(selected)!==canonical(request))fail();
   const [owner,repo]=subject.repository.split('/'),name='agentci/model-review',prefix=`agentci:model-review:${subject.pullRequest}:${subject.baseSha}:${subject.headSha}:`,externalId=prefix+request.id;
   // Bound remote inventory. Never silently inspect a prefix and miss a committed
   // create whose response was lost. Oversized histories fail for operator action.
   const runs=[];
   for(let page=1;page<=10;page++){
    const {data}=await client.checks.listForRef({owner:owner!,repo:repo!,ref:subject.headSha,check_name:name,filter:'all',per_page:100,page});
    runs.push(...data.check_runs);if(runs.length>=data.total_count)break;if(page===10)throw Error('model-review-check-inventory-limit');
   }
   const owned=runs.filter(run=>run.name===name&&run.app?.id===config.appId&&run.head_sha===subject.headSha&&run.external_id?.startsWith(prefix));
   const existing=owned.find(run=>run.external_id===externalId);
   const candidates=owned.filter(run=>{
    const id=run.external_id!.slice(prefix.length);
    return run.status!=='completed'&&id!==selected.id&&(!superseded||id===request.id)&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id);
   });
   const older=new Set(await source.olderIds(subject,candidates.map(run=>run.external_id!.slice(prefix.length)),selected.id));
   const obsolete=candidates.filter(run=>older.has(run.external_id!.slice(prefix.length)));
   // Supersession cleanup is a publication too: never write after observing a
   // closed PR or changed subject. Recheck again before the selected Check write.
   if(!await currentPullRequest(client,{...subject,installationId:config.installationId}))return 'superseded';
   // Partial cleanup is safe to retry; it never alters a completed result or the
   // selected/newer admission. Bound each pass to avoid monopolizing the lock.
   for(const run of obsolete.slice(0,20))await client.checks.update({owner:owner!,repo:repo!,check_run_id:run.id,status:'completed',conclusion:'neutral',output:{title:'AgentCI model review: superseded',summary:`This admission was superseded by review ${selected.id}. No completed result or clean review is claimed. Base: ${subject.baseSha}; head: ${subject.headSha}.`} });
   if(obsolete.length>20)throw Error('model-review-check-cleanup-pending');
   if(superseded)return 'superseded';
   const rendered=modelReviewCheckOutput(snapshot,subject,config.publicUrl);
   if(!await currentPullRequest(client,{...subject,installationId:config.installationId}))return 'superseded';
   const params={owner:owner!,repo:repo!,name,head_sha:subject.headSha,external_id:externalId,status:rendered.status,...(rendered.conclusion?{conclusion:rendered.conclusion}:{}),output:rendered.output,details_url:rendered.detailsUrl};
   if(existing)await client.checks.update({...params,check_run_id:existing.id});else await client.checks.create(params);
   return 'published';
  });}catch{throw Error('model-review-publication-unavailable');}
 };
}
