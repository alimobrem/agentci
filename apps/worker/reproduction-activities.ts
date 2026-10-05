import {ApplicationFailure} from '@temporalio/activity';
import {FindingReproductionConflict,FindingReproductionStore} from '../../packages/storage/finding-reproduction.ts';
import type {Snapshot} from '../../packages/review/types.ts';
/** Readers must fetch exact retained revisions; approved plans are reserved before dispatch. */
export function createReproductionActivities(store:FindingReproductionStore,snapshots:(repository:string,sha:string)=>Promise<Snapshot>){
 const guarded=async<T>(operation:()=>Promise<T>):Promise<T>=>{
  try{return await operation();}catch(error){
   if(error instanceof FindingReproductionConflict)throw ApplicationFailure.nonRetryable('Invalid reproduction identity or state','FindingReproductionConflict');
   throw ApplicationFailure.retryable('Reproduction storage or input unavailable','FindingReproductionUnavailable');
  }
 };
 return {
  stageFindingReproduction:(id:string)=>guarded(async()=>{
   const plan=await store.get(id);if(!plan)throw new FindingReproductionConflict();
   const subject=plan.finding.subject;
   const [base,head]=await Promise.all([snapshots(subject.repository,subject.baseSha),snapshots(subject.repository,subject.headSha)]);
   return store.stage(id,base,head);
  }),
  finalizeFindingReproduction:(id:string)=>guarded(async()=>{
   const result=await store.finalize(id);return {findingId:result.event.finding.id,version:result.event.finding.version,state:result.event.finding.state};
  }),
  cancelFindingReproduction:(id:string)=>guarded(()=>store.cancel(id)),
 };
}
export type ReproductionActivities=ReturnType<typeof createReproductionActivities>;
