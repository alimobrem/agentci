import type {Pool} from 'pg';
import type {Octokit} from '@octokit/rest';
import {canonical} from '../../packages/review/engine.ts';
import type {ReviewSubject} from '../../packages/reviewers/context.ts';
import type {ReproductionRuntime} from '../../packages/runtime/reproductions.ts';
import {appliedReproductionConfig,parseReproductionCatalog,reproductionCatalogReaders} from '../../packages/runtime/reproduction-catalog.ts';
import {createRemoteSnapshotReader} from '../../packages/github/client.ts';
import {createReproductionApprovalRegistry} from '../../packages/findings/approval-registry.ts';
import {FindingReads} from '../../packages/storage/finding-reads.ts';
import {FindingHistoryStore} from '../../packages/storage/finding-history.ts';
import {FindingReproductionStore} from '../../packages/storage/finding-reproduction.ts';
import {ReproductionAuthorityStore} from '../../packages/storage/reproduction-authority.ts';
import {ReproductionEvalStore} from '../../packages/storage/reproduction-evals.ts';
import {ReproductionNonExecutionStore} from '../../packages/storage/reproduction-non-execution.ts';
import {ReproductionDispatchStore,type DispatchSettlementReader,type ReproductionDispatchClaim} from '../../packages/storage/reproduction-dispatch.ts';
import {EvalStore} from '../../packages/storage/evals.ts';
import {createReproductionConsumerRuntime} from './reproduction-consumer-runtime.ts';

/** Controller-owned composition only: startup reads applied identity, never installs
 * approval. No snapshot/network access is required to start outage recovery. */
export async function initializeReproductionController(pool:Pool,github:Octokit,config:{organizationId:string;repository:string;installationId:number;cursorKey?:string;evidenceToken?:string;operatorToken?:string},supplied:ReproductionRuntime){
 config={...config};
 const scope={organizationId:config.organizationId.toLowerCase(),repository:config.repository},key=config.cursorKey;
 if(!key||key.length<32||/[\r\n]/.test(key)||key===config.evidenceToken||key===config.operatorToken||!Number.isSafeInteger(config.installationId)||config.installationId<1||supplied.evalTaskQueue!=='agentci-eval-v1')throw Error('reproduction-controller-config-unavailable');
 const catalog=parseReproductionCatalog(supplied.catalog.definition,scope,supplied.catalog.digest),expected=structuredClone(supplied.expected),evalTaskQueue=supplied.evalTaskQueue;
 const configIdentity=async()=> (await appliedReproductionConfig(pool,scope)).identity;
 if(canonical(await configIdentity())!==canonical(expected))throw Error('reproduction-controller-config-unavailable');
 const scoped=(subject:ReviewSubject)=>{if(subject.organizationId!==scope.organizationId||subject.repository!==scope.repository)throw Error('reproduction-subject-unavailable');};
 const remote=createRemoteSnapshotReader(github),snapshots=async(subject:ReviewSubject,side:'base'|'head')=>{scoped(subject);if(side!=='base'&&side!=='head')throw Error('reproduction-subject-unavailable');return remote(scope.repository,side==='base'?subject.baseSha:subject.headSha);};
 const readers=reproductionCatalogReaders(pool,scope,catalog,key,snapshots),[owner,repo]=scope.repository.split('/');
 const authority=new ReproductionAuthorityStore(pool,scope,readers,async(reference,signal)=>{
  const subject=(await readers.plan(reference)).finding.subject;scoped(subject);signal.throwIfAborted();
  // Fresh repository installation and PR reads: HTTP failures remain unavailable,
  // never become a fabricated permission-denied/non-execution result.
  const request={signal,timeout:4500};
  const installation=await github.apps.getRepoInstallation({owner:owner!,repo:repo!,request});signal.throwIfAborted();
  if(installation.data.id!==config.installationId||installation.data.suspended_at!==null)return false;
  const {data}=await github.pulls.get({owner:owner!,repo:repo!,pull_number:subject.pullRequest,request});signal.throwIfAborted();
  return data.number===subject.pullRequest&&data.base.repo.full_name===scope.repository&&data.state==='open'&&data.base.sha===subject.baseSha&&data.head.sha===subject.headSha;
 });
 // Recovery only reads retained jobs; selection fails closed. Preparing a new
 // stage constructs its own fully validated registry from immutable historical
 // finding+plan and exact source snapshots, avoiding shared mutable authority.
 const staging=new ReproductionEvalStore(pool,scope,await createReproductionApprovalRegistry([])),evals=new EvalStore(pool,scope.organizationId,scope.repository),proofs=new ReproductionNonExecutionStore(pool,scope),findings=new FindingReads(pool,scope,key);
 let reproduction:FindingReproductionStore;
 const history=new FindingHistoryStore(pool,scope,{reviewer:async()=>{throw Error('reproduction-cannot-ingest-reviewer');},receipt:(id,subject)=>reproduction.readReceipt(id,subject),nonExecution:(id,subject)=>proofs.read(id,subject)});
 reproduction=new FindingReproductionStore(pool,scope,history,evals,{approvedPlan:async()=>{throw Error('reproduction-consumer-cannot-reserve');}},staging);
 let settlementReader:DispatchSettlementReader|undefined;
 const dispatch=new ReproductionDispatchStore(pool,scope,(...args)=>{if(!settlementReader)throw Error('reproduction-settlement-unavailable');return settlementReader(...args);});
 await staging.ready();await dispatch.ready();
 const runtime=createReproductionConsumerRuntime({pool,scope,authority,staging,reproduction,history,proofs,evals,dispatch,snapshots,evalTaskQueue,prepareStaging:async(plan,base,head)=>{
  scoped(plan.finding.subject);
  const original=await findings.finding(plan.approval.reviewId,plan.finding.id,plan.finding.version-1);
  const registry=await createReproductionApprovalRegistry([{current:original.event.finding,plan,base,head}]);
  return new ReproductionEvalStore(pool,scope,registry);
 }});
 settlementReader=runtime.settlementReader;
 return {dispatch,activities:runtime.activities,configIdentity,markRuntimeQuiescent:runtime.markRuntimeQuiescent,settle:async(entry:ReproductionDispatchClaim)=>{if(!await dispatch.settle(entry))await dispatch.release(entry);}};
}
