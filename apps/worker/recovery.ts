import {WorkflowExecutionAlreadyStartedError,WorkflowNotFoundError,type Client} from '@temporalio/client';
import type {ReviewAttempts} from '../../packages/storage/review-attempts.ts';
import type {EvalStore} from '../../packages/storage/evals.ts';
import type {EvalReviewActivities} from './eval-activities.ts';
const terminal=new Set(['FAILED','CANCELLED','TIMED_OUT','TERMINATED']);
/** Out-of-workflow recovery survives parent termination; only immutable unit IDs reach the evaluator. */
export async function reconcileReviewAttempts(attempts:ReviewAttempts,evals:EvalStore,client:Client,activities:Pick<EvalReviewActivities,'cancelEvalReview'|'failEvalReview'>,options:{shouldStop?:()=>boolean}={}):Promise<void>{
  for(let i=0;i<10;i++){
    if(options.shouldStop?.())return;
    const entry=await attempts.claim();if(!entry)return;
    let maintenance:Promise<void>|undefined,leaseFailure:unknown;
    const timer=setInterval(()=>{if(!maintenance)maintenance=attempts.renew(entry).catch(error=>{leaseFailure=error;}).finally(()=>{maintenance=undefined;});},15000);timer.unref();
    try{
      const rpc=<T>(operation:()=>Promise<T>)=>{if(leaseFailure)throw leaseFailure;return client.connection.withDeadline(Date.now()+10000,operation);};
      const handle=client.workflow.getHandle(entry.workflowId,entry.runId),description=await rpc(()=>handle.describe());
      if(description.workflowId!==entry.workflowId||description.runId!==entry.runId||description.type!=='reviewPullRequestWithEvals')throw new Error('Tracked workflow identity mismatch');
      const status=description.status.name;
      if(status==='COMPLETED'){await attempts.close(entry,status);continue;}
      if(!terminal.has(status)){await attempts.release(entry);continue;}
      await attempts.renew(entry);
      const plan=await evals.recoveryPlan(entry.id);
      let pending=false;
      if(plan){
        const s=plan.subject,j=entry.job;if(s.repository!==j.repository||s.pullRequest!==j.pullRequest||s.baseSha!==j.baseSha||s.headSha!==j.headSha)throw new Error('Tracked comparison identity mismatch');
        await activities.cancelEvalReview(entry.job,entry.id,plan.id);
        const after=await evals.recoveryPlan(entry.id);if(!after||after.id!==plan.id)throw new Error('Cancelled attempt unavailable');
        const completedUnits=new Set(after.completedUnitIds);
        for(const unitId of plan.unitIds){
          if(options.shouldStop?.())throw new Error('Recovery stopping with retained work');
          await attempts.renew(entry);
          const child=client.workflow.getHandle(`agentci:eval:${plan.id}:${unitId}`);
          try{
            const state=await rpc(()=>child.describe());
            if(state.type!=='evaluateUnit'||state.taskQueue!==entry.evalTaskQueue)throw new Error('Evaluator workflow identity mismatch');
            if(state.status.name==='RUNNING'){await rpc(()=>child.cancel());pending=true;}
            else if(!['COMPLETED','FAILED','CANCELLED','TERMINATED','TIMED_OUT'].includes(state.status.name))throw new Error('Evaluator workflow state unavailable');
          }catch(error){if(!(error instanceof WorkflowNotFoundError))throw error;}
          if(completedUnits.has(unitId))continue;
          const workflowId=`agentci:cleanup:${plan.id}:${unitId}`;let cleanup;
          try{cleanup=await rpc(()=>client.workflow.start('cleanupCancelledEvalUnit',{args:[unitId],workflowId,taskQueue:entry.evalTaskQueue,workflowIdReusePolicy:'ALLOW_DUPLICATE_FAILED_ONLY'}));}
          catch(error){if(!(error instanceof WorkflowExecutionAlreadyStartedError))throw error;cleanup=client.workflow.getHandle(workflowId);}
          const state=await rpc(()=>cleanup.describe());
          if(state.type!=='cleanupCancelledEvalUnit'||state.taskQueue!==entry.evalTaskQueue)throw new Error('Cleanup workflow identity mismatch');
          if(state.status.name!=='COMPLETED')pending=true;
          else if(await rpc(()=>cleanup.result())!==unitId)throw new Error('Cleanup result identity mismatch');
        }
      }else await activities.failEvalReview(entry.job,entry.id);
      await attempts.renew(entry);
      if(leaseFailure)throw leaseFailure;
      if(pending)await attempts.release(entry);else await attempts.close(entry,status);
    }catch{
      // SQL and Temporal remain authoritative; neither transport failure nor lease loss is a clean closure.
      try{await attempts.release(entry);}catch{}
      throw new Error('Review recovery unavailable; retained attempt will retry');
    }finally{clearInterval(timer);await maintenance;}
  }
}
