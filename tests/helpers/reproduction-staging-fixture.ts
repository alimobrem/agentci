import {randomUUID} from 'node:crypto';import {readFile} from 'node:fs/promises';import {Pool} from 'pg';
import {findingsFromReviewer,deduplicateFindings} from '../../packages/findings/model.ts';
import {canonical,digest} from '../../packages/review/engine.ts';import {nameUuid} from '../../packages/evals/request-id.ts';import {createReproductionApprovalRegistry} from '../../packages/findings/approval-registry.ts';import {compileFindingReproduction} from '../../packages/findings/reproduction.ts';import {FindingHistoryStore} from '../../packages/storage/finding-history.ts';import {ReviewAdmissionStore} from '../../packages/storage/review-admissions.ts';import {ReproductionReservations} from '../../packages/storage/reproduction-reservations.ts';import {reproductionFixture} from '../fixtures/reproduction.ts';
const url=process.env.AGENTCI_TEST_DATABASE_URL;if(!url)throw Error('Reproduction reservation acceptance requires real PostgreSQL');
export async function reproductionStagingFixture(overrides:{organizationId?:string;repository?:string;planId?:string;extraFiles?:Record<string,string>;image?:string}={}){
 const schema=`reservation_${randomUUID().replaceAll('-','')}`,admin=new Pool({connectionString:url});await admin.query(`CREATE SCHEMA ${schema}`);const pool=new Pool({connectionString:url,options:`-c search_path=${schema}`});
 try{
  for(const name of ['001_m1','002_m2','006_m3_finding_history','007_m3_reproduction','008_m3_review_admissions','009_m3_review_dispatch','011_m3_review_summaries','012_m3_review_recovery','014_m3_reproduction_reservations'])await pool.query(await readFile(new URL(`../../deploy/migrations/${name}.sql`,import.meta.url),'utf8'));
  await pool.query(await readFile(new URL('../../deploy/migrations/014_m3_reproduction_reservations.sql',import.meta.url),'utf8'));
  const f=reproductionFixture(overrides.image);
  if(overrides.extraFiles){Object.assign(f.base.files,overrides.extraFiles);Object.assign(f.head.files,overrides.extraFiles);}
  f.reviewer.subject={...f.reviewer.subject,...(overrides.organizationId?{organizationId:overrides.organizationId}:{}),...(overrides.repository?{repository:overrides.repository}:{})};
  const {buildReviewContext}=await import('../../packages/reviewers/context.ts');f.reviewer.contextDigest=buildReviewContext(f.reviewer.subject,f.documents).digest;
  f.initial=deduplicateFindings(findingsFromReviewer(f.reviewer,f.reviewer.subject,f.documents),f.reviewer.subject)[0]!;f.finding={...f.initial,state:'reproduction-pending',version:2};
  f.approval={...f.approval,id:overrides.planId??f.approval.id,findingDigest:digest(canonical(f.finding))};f.plan=compileFindingReproduction(f.finding,f.approval,f.base,f.head,f.policy,f.limits);
  const subject=f.initial.subject,scope={organizationId:subject.organizationId,repository:subject.repository};
  const admissions=new ReviewAdmissionStore(pool,scope,{approve:async r=>({requestDigest:digest(canonical(r)),policyDigest:digest('policy'),profileRevision:r.profile.revision,mode:r.mode})});
  const request={schemaVersion:'v1alpha1' as const,id:f.approval.reviewId,subject,profile:{id:'fixture',revision:digest('fixture')},mode:'synthetic' as const};await admissions.admit(request);
  const history=new FindingHistoryStore(pool,scope,{reviewer:async()=>({result:f.reviewer,documents:f.documents}),receipt:async()=>({findingId:f.finding.id,subjectDigest:digest(canonical(subject)),assertionDigest:f.plan.assertionDigest,evidenceDigest:digest('retained-error'),actor:'reproduction',outcome:'error',reason:'Fixture execution error'})});
  await history.ingest(f.initial,subject,nameUuid(request.id,`agentci:review-finding:v1:${f.initial.id}`));
  const registry=await createReproductionApprovalRegistry([{current:f.initial,plan:f.plan,base:f.base,head:f.head}]);
  const store=new ReproductionReservations(pool,scope,registry),selector={subject,expectedVersion:1,operationId:randomUUID(),approvalId:f.plan.id,approvalDigest:digest(canonical(f.plan))};
  const counts=async()=>{const result=[];for(const table of ['agentci_finding_events','agentci_reproduction_plans','agentci_reproduction_operations','agentci_reproduction_dispatch_intents'])result.push(Number((await pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count));return result;};
  return {f,pool,schema,scope,store,selector,registry,history,admissions,request,counts,close:async()=>{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}};
 }catch(e){await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();throw e;}
}
