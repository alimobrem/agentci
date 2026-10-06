import {canonical,digest} from '../review/engine.ts';
import type {Snapshot} from '../review/types.ts';
import type {ReviewSubject} from '../reviewers/context.ts';
import type {ModelFinding} from './model.ts';
import type {ReproductionPlan} from './reproduction.ts';
import {createReproductionApprovalRegistry,type ReproductionApprovalEntry} from './approval-registry.ts';
export interface ReproductionConfigIdentity {revision:number;digest:string}
export interface ReproductionConfigReference {planId:string;planDigest:string;findingId:string;findingVersion:number;findingDigest:string;enabled:boolean;expiresAt:string}
export interface ReproductionOperatorConfig {schemaVersion:'v1alpha1';organizationId:string;repository:string;revision:number;approvals:ReproductionConfigReference[]}
export interface ReproductionConfigReaders {
 finding(reference:ReproductionConfigReference):Promise<ModelFinding>;
 plan(reference:ReproductionConfigReference):Promise<ReproductionPlan>;
 snapshot(subject:ReviewSubject,side:'base'|'head'):Promise<Snapshot>;
}
const fail=():never=>{throw Error('invalid-reproduction-config');};
const exact=(v:unknown,keys:string[]):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys.sort().join(',');
const hash=(v:unknown)=>typeof v==='string'&&/^sha256:[a-f0-9]{64}$/.test(v);
export function validateReproductionConfig(value:unknown):ReproductionOperatorConfig {
 const v=value as ReproductionOperatorConfig;
 if(!exact(v,['schemaVersion','organizationId','repository','revision','approvals'])||v.schemaVersion!=='v1alpha1'||typeof v.organizationId!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v.organizationId)||typeof v.repository!=='string'||! /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(v.repository)||v.repository.length>256||!Number.isSafeInteger(v.revision)||v.revision<1||!Array.isArray(v.approvals)||v.approvals.length>32||Buffer.byteLength(canonical(v))>65536)fail();
 const ids=new Set<string>();for(const r of v.approvals){if(!exact(r,['planId','planDigest','findingId','findingVersion','findingDigest','enabled','expiresAt'])||typeof r.planId!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(r.planId)||ids.has(r.planId)||![r.planDigest,r.findingId,r.findingDigest].every(hash)||!Number.isSafeInteger(r.findingVersion)||r.findingVersion<1||r.findingVersion>9998||typeof r.enabled!=='boolean'||typeof r.expiresAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(r.expiresAt)||!Number.isFinite(Date.parse(r.expiresAt))||new Date(r.expiresAt).toISOString()!==r.expiresAt)fail();ids.add(r.planId);}
 return structuredClone(v);
}
/** Operator-owned readers only; config never accepts commands or snapshot bytes. */
export async function loadReproductionConfig(value:unknown,readers:ReproductionConfigReaders){
 const config=validateReproductionConfig(value),entries:ReproductionApprovalEntry[]=[];
 for(const ref of config.approvals){if(!ref.enabled)continue;const current=await readers.finding(structuredClone(ref)),plan=await readers.plan(structuredClone(ref));
  if(current.id!==ref.findingId||current.version!==ref.findingVersion||digest(canonical(current))!==ref.findingDigest||current.subject.organizationId!==config.organizationId||current.subject.repository!==config.repository||plan.id!==ref.planId||digest(canonical(plan))!==ref.planDigest)fail();
  const base=await readers.snapshot(structuredClone(current.subject),'base'),head=await readers.snapshot(structuredClone(current.subject),'head');entries.push({current,plan,base,head});
 }
 const registry=await createReproductionApprovalRegistry(entries);return {config,identity:{revision:config.revision,digest:digest(canonical(config))},registry};
}
