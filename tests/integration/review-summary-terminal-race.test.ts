import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {fileURLToPath} from 'node:url';
import {canonical,digest} from '../../packages/review/engine.ts';
import {ReviewAdmissionStore} from '../../packages/storage/review-admissions.ts';
import {ReviewDispatchStore} from '../../packages/storage/review-dispatch.ts';
import {ReviewSummaryStore} from '../../packages/storage/review-summaries.ts';
import {ReviewerProfileStore} from '../../packages/storage/reviewer-profiles.ts';
import {createAdmittedReviewExecution} from '../../apps/worker/reviewer-execution.ts';
import {reconcileAdmittedReviews} from '../../apps/worker/reviewer-recovery.ts';
import {findingProposalSchema} from '../../packages/findings/model.ts';
import type {ModelProvider} from '../../packages/providers/types.ts';
import type {Client} from '@temporalio/client';
const root=fileURLToPath(new URL('../../',import.meta.url)),url=process.env.AGENTCI_TEST_DATABASE_URL;
if(!url)throw Error('Requires disposable real PostgreSQL');
const latch=()=>{let release!:()=>void;const promise=new Promise<void>(r=>release=r);return {promise,release};};
for(const ordering of ['summary-before-terminal','terminal-before-summary'])test(ordering,{timeout:15000},async()=>{
 const schema=`race_${randomUUID().replaceAll('-','')}`,admin=new Pool({connectionString:url});await admin.query(`CREATE SCHEMA ${schema}`);
 const originalSave=ReviewSummaryStore.prototype.save;
 const pool=new Pool({connectionString:url,options:`-c search_path=${schema}`}),atInsert=latch(),allowInsert=latch(),atTerminal=latch(),allowTerminal=latch();let running:ReturnType<ReturnType<typeof createAdmittedReviewExecution>>|undefined,recovering:Promise<void>|undefined;
 try{
  for(const name of ['004_m3_model_budget','005_m3_reviewer_results','006_m3_finding_history','008_m3_review_admissions','009_m3_review_dispatch','010_m3_reviewer_profiles','011_m3_review_summaries','012_m3_review_recovery'])await pool.query(await readFile(`${root}/deploy/migrations/${name}.sql`,'utf8'));
  const scope={organizationId:randomUUID(),repository:'owner/repo'},input=JSON.parse(await readFile(`${root}/specs/api/fixtures/reviewer-profile.json`,'utf8'));
  input.budget.id=randomUUID();input.reviewers[0].responseSchema=findingProposalSchema;
  const profile=await new ReviewerProfileStore(pool,scope).put(input),admissions=new ReviewAdmissionStore(pool,scope,{approve:async r=>({requestDigest:digest(canonical(r)),policyDigest:digest('fixture-authority'),profileRevision:r.profile.revision,mode:r.mode})});
  const id=randomUUID();await admissions.admit({schemaVersion:'v1alpha1',id,subject:{...scope,pullRequest:1,baseSha:'a'.repeat(40),headSha:'b'.repeat(40)},profile:{id:profile.profile.id,revision:profile.revision},mode:'synthetic'});
  const dispatch=new ReviewDispatchStore(pool,scope),summaries=new ReviewSummaryStore(pool,scope),claim=(await dispatch.claim())!,runId=randomUUID();await dispatch.acknowledge(claim,runId);
  let calls=0;
  const provider:ModelProvider={id:'fixture',upstreamIdentity:'fixture',capabilities:()=>({stream:false,tools:false,structuredOutput:true,developerInstructions:false,extensions:false}),estimateCost:()=>({upperBoundUsdMicros:10,pricingRevision:'fixture',maxInputTokens:20000,maxOutputTokens:256}),async invoke(request,context){calls++;return {schemaVersion:'v1alpha1',requestId:request.requestId,attemptId:context.attemptId,provider:request.provider,model:request.model,status:'completed',text:'',structuredOutput:{findings:[]},toolCalls:[],usage:{inputTokens:1,outputTokens:1,costUsdMicros:1,costKind:'reported',pricingRevision:null},providerRequestId:null};},async *stream(){throw Error('unused');}};
  // Gate entry to the production summary transaction, before any shared lock.
  // Both serializations stay deterministic when summary and terminal commits share a lock.
  ReviewSummaryStore.prototype.save=async function(...args){atInsert.release();await allowInsert.promise;return originalSave.apply(this,args);};
  running=createAdmittedReviewExecution({pool,scope,admissions,registrations:[{provider,execution:'fixture'}],authorize:async()=>null,readSnapshot:async(_repo,sha)=>({sha,files:{'src/main.ts':'const value = true;\n'}})})(id);
  // Observe rejection immediately so a fixed implementation can legitimately
  // fence late writes without an unhandled-rejection artifact.
  const executionResult=running.then(value=>({value}),error=>({error}));
  await atInsert.promise;
  const handle={describe:async()=>({workflowId:claim.workflowId,runId,type:'reviewAdmittedRequest',taskQueue:'race-test',memo:{admissionDigest:claim.requestDigest},status:{name:'TERMINATED'}})};
  const client={connection:{withDeadline:async<T>(_deadline:unknown,fn:()=>Promise<T>)=>fn()},workflow:{getHandle:()=>handle}};
  const recoveryStore={claimRecovery:dispatch.claimRecovery.bind(dispatch),releaseRecovery:dispatch.releaseRecovery.bind(dispatch),requestCancellation:dispatch.requestCancellation.bind(dispatch),finishRecovery:async(...args:Parameters<ReviewDispatchStore['finishRecovery']>)=>{atTerminal.release();await allowTerminal.promise;return dispatch.finishRecovery(...args);}};
  recovering=reconcileAdmittedReviews(recoveryStore,summaries,client as unknown as Client,{taskQueue:'race-test'});
  await atTerminal.promise; // Recovery has already read no summary.
  if(ordering==='summary-before-terminal'){allowInsert.release();await executionResult;allowTerminal.release();await recovering;}
  else{allowTerminal.release();await recovering;allowInsert.release();await executionResult;}
  const state=(await dispatch.get(id))!,saved=await summaries.get(id),execution=await executionResult,reclaim=await dispatch.claimRecovery();assert.equal(reclaim,undefined);
  console.log(JSON.stringify({ordering,terminal:state.terminal?.status,summaryPresent:!!saved,matchingDigest:state.terminal?.digest===saved?.digest,executionRejected:'error' in execution,providerCalls:calls,reclaimable:!!reclaim}));
  if(ordering==='summary-before-terminal'){
   assert.ok(saved);assert.equal(state.terminal?.status,'completed','A committed complete summary must win stale recovery intent');assert.equal(state.terminal?.digest,saved.digest);
   const content='const value = true;\n';
   assert.deepEqual(await summaries.save(saved.summary,[{kind:'source',side:'head',path:'src/main.ts',content,digest:digest(content)}]),saved,'Exact summary retries remain readable after terminal completion');
   assert.deepEqual((await dispatch.finish(id,runId,'completed',saved.digest)).terminal,state.terminal);
  }else{
   assert.equal(state.terminal?.status,'terminated');assert.equal(saved,undefined,'An immutable terminal outcome must fence subsequent first summary insertion');assert.ok('error' in execution);assert.equal(state.terminal?.digest,digest(canonical({admissionDigest:claim.requestDigest,runId,status:'terminated'})));
  }
  assert.equal(calls,1);
 }finally{allowInsert.release();allowTerminal.release();await Promise.allSettled([running,recovering].filter(Boolean));ReviewSummaryStore.prototype.save=originalSave;await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
