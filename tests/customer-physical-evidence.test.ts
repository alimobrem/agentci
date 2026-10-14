import test from 'node:test';import assert from 'node:assert/strict';
// @ts-ignore Trusted harness evidence predicate; real Temporal path covered separately.
import {verifyCustomerCancelledUnitAbsence} from '../scripts/lib/customer-physical-evidence.mjs';
const evidence=()=>({parentStatus:'CANCELLED',history:{events:[{eventId:1,workflowExecutionStartedEventAttributes:{}},{eventId:2,workflowExecutionCanceledEventAttributes:{}}]},workflowId:'exact-owned-unit',cancelRequested:true,unitStatus:'cancelled',trials:[] as unknown[]});
test('never-started cancellation requires closed parent history with no exact child initiation',()=>{
 verifyCustomerCancelledUnitAbsence(evidence());
 const terminated=evidence();terminated.parentStatus='TERMINATED';terminated.history.events[1]={eventId:2,workflowExecutionTerminatedEventAttributes:{}} as any;verifyCustomerCancelledUnitAbsence(terminated);
 const otherChild=evidence();otherChild.history.events.splice(1,0,{eventId:2,startChildWorkflowExecutionInitiatedEventAttributes:{workflowId:'exact-owned-cleanup'}} as any);otherChild.history.events[2]!.eventId=3;verifyCustomerCancelledUnitAbsence(otherChild);
});
test('missing child cannot waive execution, cancellation, complete-history or scheduled-child evidence',()=>{
 const changes=[{parentStatus:'COMPLETED'},{parentStatus:'RUNNING'},{parentStatus:'FAILED'},{cancelRequested:false},{unitStatus:'completed'},{unitStatus:'running'},{trials:[{trial:1}]},{history:{events:[]}},{history:{events:[{eventId:1,workflowExecutionStartedEventAttributes:{}}]}},{history:{events:[{eventId:1,workflowExecutionTerminatedEventAttributes:{}}]}},{history:{events:[{eventId:1,workflowExecutionStartedEventAttributes:{}},{eventId:3,workflowExecutionCanceledEventAttributes:{}}]}},{history:{events:[{eventId:1,workflowExecutionStartedEventAttributes:{}},{eventId:2,startChildWorkflowExecutionInitiatedEventAttributes:{workflowId:'exact-owned-unit'}},{eventId:3,workflowExecutionCanceledEventAttributes:{}}]}},{history:{events:Array.from({length:10001},()=>({workflowExecutionCanceledEventAttributes:{}}))}}];
 for(const change of changes)assert.throws(()=>verifyCustomerCancelledUnitAbsence({...evidence(),...change}),/Cancelled unit absence is unverified/);
});
