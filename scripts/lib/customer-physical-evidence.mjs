/** A staged SQL unit is not evidence that its Temporal child was scheduled.
 * Only exact NotFound plus a closed parent's complete history can establish
 * this narrow cancelled-before-child case. The caller must still independently
 * verify authenticated settlement, exact completed cleanup, and zero containers.
 */
export function verifyCustomerCancelledUnitAbsence({parentStatus,history,workflowId,cancelRequested,unitStatus,trials}){
 const events=history?.events;
 const terminal=parentStatus==='CANCELLED'?'workflowExecutionCanceledEventAttributes':parentStatus==='TERMINATED'?'workflowExecutionTerminatedEventAttributes':null;
 if(!terminal||cancelRequested!==true||unitStatus!=='cancelled'||!Array.isArray(trials)||trials.length||!Array.isArray(events)||!events.length||events.length>10000||!events[0]?.workflowExecutionStartedEventAttributes||!events.at(-1)?.[terminal]||typeof workflowId!=='string'||!workflowId||events.some((event,index)=>String(event.eventId)!==String(index+1)||event.startChildWorkflowExecutionInitiatedEventAttributes?.workflowId===workflowId))throw Error('Cancelled unit absence is unverified');
}
