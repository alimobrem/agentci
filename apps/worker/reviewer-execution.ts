import type {Pool} from 'pg';
import {canonical,digest} from '../../packages/review/engine.ts';
import type {Snapshot} from '../../packages/review/types.ts';
import {nameUuid} from '../../packages/evals/request-id.ts';
import {PostgresBudgetLedger} from '../../packages/providers/budget.ts';
import {ProviderFailure,type ModelProvider} from '../../packages/providers/types.ts';
import {ReviewAdmissionStore} from '../../packages/storage/review-admissions.ts';
import {ReviewDispatchStore} from '../../packages/storage/review-dispatch.ts';
import {ReviewerProfileStore} from '../../packages/storage/reviewer-profiles.ts';
import {ReviewerResultStore} from '../../packages/storage/reviewer-results.ts';
import {FindingHistoryStore} from '../../packages/storage/finding-history.ts';
import {bindReviewerProfile} from '../../packages/reviewers/profile.ts';
import {createSnapshotReviewContext} from '../../packages/reviewers/snapshot-context.ts';
import {createReviewerExecutor} from '../../packages/reviewers/execute.ts';
import {createPersistentReviewer} from '../../packages/reviewers/persistent.ts';
import type {TrustedCodingProvenance} from '../../packages/reviewers/independence.ts';
import {findingsFromReviewer,deduplicateFindings,type ModelFinding} from '../../packages/findings/model.ts';
/** Trusted activity implementation; dependencies are controller-owned. The
 * authorizer must verify current subject/policy authority and coding provenance.
 * Caller/model data cannot register providers, select a ledger or supply files.
 */
export function createAdmittedReviewExecution(options:{
 pool:Pool;scope:{organizationId:string;repository:string};
 admissions:Pick<ReviewAdmissionStore,'get'>;
 registrations:readonly {provider:ModelProvider;execution:'fixture'|'external'}[];
 authorize:(admission:NonNullable<Awaited<ReturnType<ReviewAdmissionStore['get']>>>)=>Promise<TrustedCodingProvenance|null>;
 readSnapshot:(repository:string,sha:string)=>Promise<Snapshot>;
}){
 const {pool}=options,scope={...options.scope},dispatch=new ReviewDispatchStore(pool,scope),profiles=new ReviewerProfileStore(pool,scope);
 return async(id:string,signal?:AbortSignal)=>{
  const check=async()=>{if(signal?.aborted)throw new ProviderFailure('cancelled');const state=await dispatch.get(id);if(!state||state.terminal)throw Error('review-execution-unavailable');if(state.cancelRequested)throw new ProviderFailure('cancelled');return state;};
  try{
   const state=await check(),admission=await options.admissions.get(id);if(!admission||admission.digest!==state.requestDigest)throw Error('review-execution-unavailable');
   const {request}=admission,selected=await profiles.resolve(request.profile.id,request.profile.revision),bound=bindReviewerProfile(request,selected.profile,state.admittedAtMs);
   const coding=await options.authorize(structuredClone(admission));
   const context=await createSnapshotReviewContext(request.subject,options.readSnapshot)(bound.profile.selection,signal);
   const ledger=new PostgresBudgetLedger(pool,{...scope,id:bound.profile.budget.id,limitUsdMicros:bound.profile.budget.limitUsdMicros});
   const results=new ReviewerResultStore(pool,{...scope,budgetId:bound.profile.budget.id});
   const execute=createPersistentReviewer(createReviewerExecutor(options.registrations,scope,ledger),results);
   const roles:{requestId:string;role:string;digest:string;status:string}[]=[],proposals:ModelFinding[]=[];
   for(const role of bound.roles){
    await check();await profiles.resolve(request.profile.id,request.profile.revision);
    // Recheck authority before each possible provider dispatch. Provenance is
    // fixed for this invocation and participates in immutable request identity.
    if(canonical(await options.authorize(structuredClone(admission)))!==canonical(coding))throw Error('review-execution-unavailable');
    const retained=await execute({requestId:role.requestId,config:role.config,subject:request.subject,documents:context.documents,coding,differentProvider:bound.profile.differentProvider,mode:request.mode==='live'?'external':'synthetic'},signal);
    roles.push({requestId:role.requestId,role:role.config.role,digest:retained.digest,status:retained.result.status});
    proposals.push(...findingsFromReviewer(retained.result,request.subject,context.documents));
   }
   await check();
   const history=new FindingHistoryStore(pool,scope,{reviewer:async(requestId,subject)=>{if(!roles.some(r=>r.requestId===requestId))throw Error('review-evidence-unavailable');const retained=await results.get(requestId,subject);if(!retained)throw Error('review-evidence-unavailable');return {result:retained.result,documents:context.documents};},receipt:async()=>{throw Error('finding-receipt-unavailable');}});
   const findings:{id:string;digest:string}[]=[];
   for(const finding of deduplicateFindings(proposals,request.subject)){
    await check();const saved=await history.ingest(finding,request.subject,nameUuid(request.id,`agentci:review-finding:v1:${finding.id}`));findings.push({id:finding.id,digest:saved.digest});
   }
   const summary={schemaVersion:'v1alpha1' as const,admissionId:request.id,admissionDigest:admission.digest,profileRevision:bound.revision,contextDigest:context.digest,mode:request.mode,coverage:{selectedFiles:context.documents.length,configuredRoles:roles.length,completedRoles:roles.filter(r=>r.status==='completed').length,wholeRepository:false},roles,findings};
   return {summary,digest:digest(canonical(summary))};
  }catch(error){if(error instanceof ProviderFailure)throw error;throw Error('review-execution-unavailable');}
 };
}
