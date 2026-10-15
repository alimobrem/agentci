import {semanticView,comparisonView,reviewerView,unavailableViews} from './evidence-views';
import type {ReviewAdmissionRequest} from 'agentci/client';
import type {Principal} from './session';
import {authorize} from './session';
export interface ReviewBinding {admission:ReviewAdmissionRequest;apiOrigin:string;readToken:string;semanticEvidenceId?:string;comparison?:{id:string;attemptId:string};reviewerComparison?:boolean}
export const DASHBOARD_READ_DEADLINE_MS=15000, MAX_DASHBOARD_BYTES=8*1024*1024, MAX_DASHBOARD_FINDINGS=64;
/** Operational display limits, not milestone quality/acceptance thresholds. No partial view is certified. */
export async function readDashboard(principal:Principal,binding:ReviewBinding,callerSignal?:AbortSignal,options:{deadlineMs?:number;maxBytes?:number}={}){
 binding=structuredClone(binding);if(binding.comparison&&!binding.semanticEvidenceId||[binding.semanticEvidenceId,binding.comparison?.id,binding.comparison?.attemptId].some(id=>id!==undefined&&!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id))||binding.reviewerComparison!==undefined&&typeof binding.reviewerComparison!=='boolean')throw Error('invalid-review-configuration');const admission=binding.admission;authorize(principal,admission.subject.organizationId,admission.subject.repository);
 const deadlineMs=options.deadlineMs??DASHBOARD_READ_DEADLINE_MS,maxBytes=options.maxBytes??MAX_DASHBOARD_BYTES;
 if(!Number.isInteger(deadlineMs)||deadlineMs<1||deadlineMs>DASHBOARD_READ_DEADLINE_MS||!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>MAX_DASHBOARD_BYTES)throw Error('invalid-read-budget');
 const budgetController=new AbortController(),signal=AbortSignal.any([AbortSignal.timeout(deadlineMs),budgetController.signal,...(callerSignal?[callerSignal]:[])]);signal.throwIfAborted();
 const {ModelReviewClient,AgentCIClient,AgentCIError}=await import(/* webpackIgnore: true */ 'agentci/client');signal.throwIfAborted();
 let bytes=0;const readBudget={consume(size:number){signal.throwIfAborted();bytes+=size;if(bytes>maxBytes){budgetController.abort();throw new AgentCIError('response-too-large');}}};
 const client=new ModelReviewClient({url:binding.apiOrigin,readToken:binding.readToken,maxAttempts:1,timeoutMs:10000,maxReadBytes:maxBytes,readBudget});
 const views=unavailableViews();
 const status=await client.show(admission,{signal});
 if(!status.summary)return {admission,status,findings:[],views,evidence:'unavailable' as const};
 if(status.summary.summary.findings.length>MAX_DASHBOARD_FINDINGS)throw Object.assign(Error('bounded-dashboard-read'),{code:'response-too-large'});
 const refs=await client.findings(admission,{signal});if(refs.summaryDigest!==status.summary.digest||refs.nextCursor!==null||refs.items.length!==status.summary.summary.findings.length)throw Error('identity-mismatch');if(refs.items.length>MAX_DASHBOARD_FINDINGS)throw Object.assign(Error('bounded-dashboard-read'),{code:'response-too-large'});
 // Retained pinned versions only. One signal/deadline covers every admission and finding read.
 const findings=[];for(const ref of refs.items){signal.throwIfAborted();const record=await client.finding(admission,ref.id,{version:ref.version,signal});if(record.digest!==ref.digest)throw Error('identity-mismatch');findings.push(record);}
 if(binding.semanticEvidenceId){
  const legacy=new AgentCIClient({url:binding.apiOrigin,token:binding.readToken,timeoutMs:10000,readBudget});
  const record=await legacy.evidence(binding.semanticEvidenceId,admission.subject,{signal});
  if(record.evidence.organizationId!==admission.subject.organizationId)throw Error('identity-mismatch');
  views.semantic=semanticView(record);
  if(binding.comparison){const comparison=await legacy.evalComparison(binding.comparison.id,{...admission.subject,reviewId:binding.semanticEvidenceId,attemptId:binding.comparison.attemptId},{signal});views.comparison=comparisonView(comparison);}
 }else if(binding.comparison)throw Error('invalid-review-configuration');
 if(binding.reviewerComparison&&status.execution.state==='completed'){
  const items:ReturnType<typeof reviewerView>[]= [];let certificate;
  for await(const item of client.modelReviewExport(admission,{signal,timeoutMs:deadlineMs})){
   if(item.type==='record'&&item.frame.type==='reviewer')items.push(reviewerView(item.frame.data));
   if(item.type==='complete')certificate=item.data;
  }
  if(!certificate||certificate.header.review.summary?.digest!==status.summary.digest||certificate.header.review.execution.state!=='completed')throw Error('identity-mismatch');
  views.reviewers={availability:'verified-complete',snapshotDigest:certificate.header.snapshotDigest,endDigest:certificate.endDigest,missingRoles:certificate.header.configuredRoles.filter(r=>certificate.header.missingRoleIds.includes(r.requestId)),items,semanticAgreement:'not-established'};
 }
 signal.throwIfAborted();return {admission,status,findings,views,evidence:'retained' as const};
}
