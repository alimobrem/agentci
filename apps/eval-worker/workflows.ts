import {proxyActivities,ActivityCancellationType} from '@temporalio/workflow';
import type {EvalActivities} from './activities.ts';
const activities=proxyActivities<EvalActivities>({startToCloseTimeout:'1 day',heartbeatTimeout:'30 seconds',
  cancellationType:ActivityCancellationType.WAIT_CANCELLATION_COMPLETED,
  retry:{maximumAttempts:5,initialInterval:'1 second',maximumInterval:'30 seconds'}});
/** Workflow history carries identifiers, not snapshots, provider credentials or raw evaluator reports. */
export async function evaluateUnit(id:string):Promise<string>{return activities.runEvalUnit(id);}

const cleanup=proxyActivities<Pick<EvalActivities,'cleanupCancelledEvalUnit'>>({startToCloseTimeout:'5 minutes',retry:{maximumAttempts:5,initialInterval:'1 second',maximumInterval:'30 seconds'}});
/** Independent recovery work; no dependency on the terminated review parent's lifetime. */
export async function cleanupCancelledEvalUnit(id:string):Promise<string>{return cleanup.cleanupCancelledEvalUnit(id);}
