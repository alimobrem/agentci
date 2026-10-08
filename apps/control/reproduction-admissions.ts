import type {Pool} from 'pg';
import type {Octokit} from '@octokit/rest';
import type {ReproductionRuntime} from '../../packages/runtime/reproductions.ts';
import {parseReproductionCatalog,reproductionCatalogReaders,appliedReproductionConfig} from '../../packages/runtime/reproduction-catalog.ts';
import {createRemoteSnapshotReader} from '../../packages/github/client.ts';
import {createReproductionApprovalRegistry} from '../../packages/findings/approval-registry.ts';
import {ReproductionAuthorityStore} from '../../packages/storage/reproduction-authority.ts';
import {ReproductionReservations,ReproductionReservationConflict} from '../../packages/storage/reproduction-reservations.ts';
import {canonical,digest} from '../../packages/review/engine.ts';
import {validateFindingReproductionRequest,validateFindingReproductionAccepted,type FindingReproductionRequest} from '../../packages/findings/reproduction-transport.ts';

/** Explicit reproduction opt-in, without applying authority, starting jobs or workflows. */
export async function createReproductionAdmissions(pool:Pool,github:Octokit,config:{organizationId:string;repository:string;installationId:number;cursorKey?:string;evidenceToken?:string;operatorToken?:string},supplied:ReproductionRuntime){
 const scope={organizationId:config.organizationId.toLowerCase(),repository:config.repository},key=config.cursorKey,installationId=config.installationId;
 if(!key||key.length<32||/[\r\n]/.test(key)||key===config.evidenceToken||key===config.operatorToken||!config.operatorToken||!Number.isSafeInteger(installationId)||installationId<1||supplied.evalTaskQueue!=='agentci-eval-v1')throw Error('reproduction-admission-unavailable');
 const catalog=parseReproductionCatalog(supplied.catalog.definition,scope,supplied.catalog.digest),expected=structuredClone(supplied.expected);
 const current=await appliedReproductionConfig(pool,scope);if(canonical(current.identity)!==canonical(expected))throw Error('reproduction-admission-unavailable');
 const remote=createRemoteSnapshotReader(github),snapshots=async(subject:FindingReproductionRequest['subject'],side:'base'|'head',signal?:AbortSignal)=>{
  if(subject.organizationId!==scope.organizationId||subject.repository!==scope.repository)throw Error('reproduction-admission-unavailable');
  return remote(scope.repository,side==='base'?subject.baseSha:subject.headSha,signal);
 };
 const readers=reproductionCatalogReaders(pool,scope,catalog,key,snapshots),[owner,repo]=scope.repository.split('/');
 const authority=new ReproductionAuthorityStore(pool,scope,readers,async(ref,signal)=>{
  const subject=(await readers.plan(ref)).finding.subject;signal.throwIfAborted();const request={signal,timeout:4500};
  const installation=await github.apps.getRepoInstallation({owner:owner!,repo:repo!,request});signal.throwIfAborted();
  if(installation.data.id!==installationId||installation.data.suspended_at!==null)return false;
  const {data}=await github.pulls.get({owner:owner!,repo:repo!,pull_number:subject.pullRequest,request});signal.throwIfAborted();
  return data.number===subject.pullRequest&&data.base.repo.full_name===scope.repository&&data.state==='open'&&data.base.sha===subject.baseSha&&data.head.sha===subject.headSha;
 });
 return async(findingId:string,input:FindingReproductionRequest)=>{
  const signal=AbortSignal.timeout(10000);
  const value=validateFindingReproductionRequest(input),plan=catalog.plan(value.approvalId);
  if(!plan||plan.approval.reviewId!==value.reviewId||plan.finding.id!==findingId||canonical(plan.finding.subject)!==canonical(value.subject))throw new ReproductionReservationConflict('approval-conflict');
  const applied=await authority.read(expected),ref=applied.approvals.find(r=>r.planId===value.approvalId);
  if(!ref||!ref.enabled)throw Error('reproduction-admission-unavailable');
  const original=await readers.finding(ref),base=await snapshots(value.subject,'base',signal),head=await snapshots(value.subject,'head',signal);
  signal.throwIfAborted();
  const registry=await createReproductionApprovalRegistry([{current:original,plan,base,head}]),reservations=new ReproductionReservations(pool,scope,registry);
  const {schemaVersion,reviewId,...selector}=value;
  signal.throwIfAborted();let reservationError:unknown;
  return authority.withApproval(expected,plan.id,async c=>{
   let result;try{result=await reservations.reserveInTransaction(c,findingId,selector);}catch(error){reservationError=error;throw error;}
   return validateFindingReproductionAccepted({schemaVersion,id:result.reproductionId,operationId:result.operationId,reviewId:result.reviewId,subject:value.subject,finding:{id:result.findingId,queuedVersion:result.queuedVersion,digest:digest(canonical(plan.finding))},planDigest:result.planDigest,requestDigest:result.requestDigest},{id:plan.id,reviewId,subject:value.subject,operationId:value.operationId,findingId,planDigest:value.approvalDigest,queuedVersion:value.expectedVersion+1});
  }).catch(error=>{if(reservationError instanceof ReproductionReservationConflict)throw reservationError;throw error;});
 };
}
