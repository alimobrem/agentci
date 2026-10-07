import type {Pool} from 'pg';
import {canonical,digest} from '../review/engine.ts';
import type {Snapshot} from '../review/types.ts';
import type {ReviewSubject} from '../reviewers/context.ts';
import type {ReproductionPlan} from '../findings/reproduction.ts';
import {validateModelFinding} from '../findings/model.ts';
import {FindingReads} from '../storage/finding-reads.ts';
import {loadReproductionConfig,type ReproductionConfigIdentity,type ReproductionConfigReference,type ReproductionOperatorConfig} from '../findings/reproduction-config.ts';
export interface ReproductionCatalogDefinition {schemaVersion:'v1alpha1';organizationId:string;repository:string;plans:Array<{digest:string;plan:ReproductionPlan}>}
const fail=():never=>{throw Error('reproduction-catalog-unavailable');};
const exact=(v:unknown,keys:string[])=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys.sort().join(',');
/** Operator-owned input only. Queue requests never accept this document or commands. */
export function parseReproductionCatalog(value:unknown,scope:{organizationId:string;repository:string},expectedDigest:string){
 const v=value as ReproductionCatalogDefinition;
 if(!exact(v,['schemaVersion','organizationId','repository','plans'])||v.schemaVersion!=='v1alpha1'||v.organizationId!==scope.organizationId||v.repository!==scope.repository||!Array.isArray(v.plans)||v.plans.length>32||Buffer.byteLength(canonical(v))>32*1024*1024||expectedDigest!==digest(canonical(v)))fail();
 const copy=structuredClone(v),plans=new Map<string,ReproductionPlan>();
 for(const entry of copy.plans){if(!exact(entry,['digest','plan'])||entry.digest!==digest(canonical(entry.plan))||entry.plan?.schemaVersion!=='v1alpha1'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(entry.plan.id)||plans.has(entry.plan.id))fail();const f=validateModelFinding(entry.plan.finding,entry.plan.finding.subject);if(f.subject.organizationId!==scope.organizationId||f.subject.repository!==scope.repository||f.state!=='reproduction-pending')fail();plans.set(entry.plan.id,entry.plan);}
 return {definition:structuredClone(copy),digest:expectedDigest,plan:(id:string)=>{const plan=plans.get(id);return plan?structuredClone(plan):undefined;}};
}
export type ReproductionCatalog=ReturnType<typeof parseReproductionCatalog>;
/** Prefer immutable retained DB plans after reservation. Before the first queue,
 * the explicit operator-owned catalog breaks the approval/reservation cycle. */
export function reproductionCatalogReaders(pool:Pool,scope:{organizationId:string;repository:string},catalog:ReproductionCatalog,cursorKey:string,snapshots:(subject:ReviewSubject,side:'base'|'head')=>Promise<Snapshot>){
 const reads=new FindingReads(pool,scope,cursorKey);
 const plan=async(reference:ReproductionConfigReference):Promise<ReproductionPlan>=>{
  reference=structuredClone(reference);
  const row=(await pool.query('SELECT id,finding_id,finding_version,digest,plan FROM agentci_reproduction_plans WHERE organization_id=$1 AND repository=$2 AND id=$3',[scope.organizationId,scope.repository,reference.planId])).rows[0];
  const artifact=catalog.plan(reference.planId),selected=row?row.plan as ReproductionPlan:artifact;
  if(!selected||digest(canonical(selected))!==reference.planDigest||selected.id!==reference.planId||selected.finding.id!==reference.findingId||selected.finding.version!==reference.findingVersion+1||selected.finding.subject.organizationId!==scope.organizationId||selected.finding.subject.repository!==scope.repository)fail();
  if(row&&(row.digest!==reference.planDigest||row.id!==selected!.id||row.finding_id!==selected!.finding.id||Number(row.finding_version)!==selected!.finding.version))fail();
  // A changed artifact never replaces or silently hides corrupt retained data.
  if(artifact&&canonical(artifact)!==canonical(selected))fail();return structuredClone(selected!);
 };
 return {plan,finding:async(reference:ReproductionConfigReference)=>{const approved=await plan(reference),record=await reads.finding(approved.approval.reviewId,reference.findingId,reference.findingVersion);if(digest(canonical(record.event.finding))!==reference.findingDigest)fail();return record.event.finding;},snapshot:snapshots};
}
/** Read-only applied identity. This neither installs config nor grants permission. */
export async function appliedReproductionConfig(pool:Pool,scope:{organizationId:string;repository:string}):Promise<{identity:ReproductionConfigIdentity;config:ReproductionOperatorConfig}>{
 const row=(await pool.query('SELECT a.revision,v.digest,v.config FROM agentci_reproduction_authority a JOIN agentci_reproduction_config_versions v USING(organization_id,repository,revision) WHERE a.organization_id=$1 AND a.repository=$2',[scope.organizationId,scope.repository])).rows[0];
 if(!row||row.digest!==digest(canonical(row.config))||row.config.organizationId!==scope.organizationId||row.config.repository!==scope.repository||Number(row.revision)!==row.config.revision)fail();
 return {identity:{revision:Number(row.revision),digest:row.digest},config:structuredClone(row.config)};
}
export async function loadAppliedReproductionRegistry(pool:Pool,scope:{organizationId:string;repository:string},readers:ReturnType<typeof reproductionCatalogReaders>){const applied=await appliedReproductionConfig(pool,scope),loaded=await loadReproductionConfig(applied.config,readers);if(canonical(loaded.identity)!==canonical(applied.identity))fail();return loaded;}
