import {canonical,digest} from '../review/engine.ts';
import type {Snapshot} from '../review/types.ts';
import type {ReviewSubject} from '../reviewers/context.ts';
import {validateModelFinding,type ModelFinding} from './model.ts';
import {createFindingTransitions} from './lifecycle.ts';
import {compileFindingReproduction,type ReproductionPlan} from './reproduction.ts';

export interface ReproductionSelector {
 subject:ReviewSubject;expectedVersion:number;operationId:string;approvalId:string;approvalDigest:string;
}
/** Privileged operator input, never a customer request or model-produced registry. */
export interface ReproductionApprovalEntry {current:ModelFinding;plan:ReproductionPlan;base:Snapshot;head:Snapshot}
const fail=():never=>{throw Error('invalid-reproduction-approval');};
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const hash=(v:unknown)=>typeof v==='string'&&/^sha256:[a-f0-9]{64}$/.test(v);
const exact=(v:unknown,keys:string[]):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Object.keys(v).sort().join(',')===keys.sort().join(',');
/** A detached selection is authority input for a future atomic mutation, not a
 * reservation, dispatch receipt, authorization of the HTTP caller, or replay ledger. */
export interface SelectedReproductionApproval {request:ReproductionSelector;requestDigest:string;currentDigest:string;planDigest:string;plan:ReproductionPlan}
export interface ReproductionApprovalRegistry {select(value:unknown,current:ModelFinding):SelectedReproductionApproval}
export async function createReproductionApprovalRegistry(value:readonly ReproductionApprovalEntry[]):Promise<ReproductionApprovalRegistry>{
 try{
  if(!Array.isArray(value)||value.length>32||Buffer.byteLength(canonical(value))>32*1024*1024)fail();
  // Clone before the first await: callers cannot substitute a plan during validation.
  const entries=structuredClone(value),plans=new Map<string,{currentDigest:string;planDigest:string;plan:ReproductionPlan}>();
  const queue=createFindingTransitions(async()=>{throw Error('Queue cannot read a receipt');});
  for(const entry of entries){
   if(!exact(entry,['current','plan','base','head']))fail();
   const current=validateModelFinding(entry.current,entry.current.subject);
   // Leave room for queue + terminal evidence in the existing 10,000-event bound.
   if(current.version>9998)fail();
   const queued=(await queue(current,{type:'queue'},current.version)).finding;
   const plan=compileFindingReproduction(queued,entry.plan.approval,entry.base,entry.head,entry.plan.runner,entry.plan.limits);
   if(canonical(plan)!==canonical(entry.plan)||plans.has(plan.id))fail();
   plans.set(plan.id,{currentDigest:digest(canonical(current)),planDigest:digest(canonical(plan)),plan});
  }
  return {select(value,currentValue){
   try{
    if(!exact(value,['subject','expectedVersion','operationId','approvalId','approvalDigest'])||Buffer.byteLength(canonical(value))>8192||!uuid(value.operationId)||!uuid(value.approvalId)||!hash(value.approvalDigest)||!Number.isSafeInteger(value.expectedVersion)||(value.expectedVersion as number)<1||(value.expectedVersion as number)>9998)fail();
    const request=structuredClone(value) as unknown as ReproductionSelector;
    const current=validateModelFinding(currentValue,request.subject),selected=plans.get(request.approvalId);
    if(!selected||request.expectedVersion!==current.version||canonical(request.subject)!==canonical(current.subject)||selected.currentDigest!==digest(canonical(current))||request.approvalDigest!==selected.planDigest)fail();
    return {request,requestDigest:digest(canonical(request)),currentDigest:selected!.currentDigest,planDigest:selected!.planDigest,plan:structuredClone(selected!.plan)};
   }catch{return fail();}
  }};
 }catch{return fail();}
}
