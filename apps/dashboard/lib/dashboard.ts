import type {ReviewAdmissionRequest} from 'agentci/client';
import type {Principal} from './session';
import {authorize} from './session';
export interface ReviewBinding {admission:ReviewAdmissionRequest;apiOrigin:string;readToken:string}
export const DASHBOARD_READ_DEADLINE_MS=15000, MAX_DASHBOARD_BYTES=8*1024*1024, MAX_DASHBOARD_FINDINGS=64;
/** Operational display limits, not milestone quality/acceptance thresholds. No partial view is certified. */
export async function readDashboard(principal:Principal,binding:ReviewBinding,callerSignal?:AbortSignal,options:{deadlineMs?:number;maxBytes?:number}={}){
 const admission=structuredClone(binding.admission);authorize(principal,admission.subject.organizationId,admission.subject.repository);
 const deadlineMs=options.deadlineMs??DASHBOARD_READ_DEADLINE_MS,maxBytes=options.maxBytes??MAX_DASHBOARD_BYTES;
 if(!Number.isInteger(deadlineMs)||deadlineMs<1||deadlineMs>DASHBOARD_READ_DEADLINE_MS||!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>MAX_DASHBOARD_BYTES)throw Error('invalid-read-budget');
 const signal=AbortSignal.any([AbortSignal.timeout(deadlineMs),...(callerSignal?[callerSignal]:[])]);signal.throwIfAborted();
 let bytes=0;const account=(value:unknown)=>{signal.throwIfAborted();bytes+=Buffer.byteLength(JSON.stringify(value));if(bytes>maxBytes)throw Object.assign(Error('bounded-dashboard-read'),{code:'response-too-large'});};
 const {ModelReviewClient}=await import(/* webpackIgnore: true */ 'agentci/client');signal.throwIfAborted();
 const client=new ModelReviewClient({url:binding.apiOrigin,readToken:binding.readToken,maxAttempts:1,timeoutMs:10000,maxReadBytes:maxBytes});
 const status=await client.show(admission,{signal});account(status);
 if(!status.summary)return {admission,status,findings:[],evidence:'unavailable' as const};
 if(status.summary.summary.findings.length>MAX_DASHBOARD_FINDINGS)throw Object.assign(Error('bounded-dashboard-read'),{code:'response-too-large'});
 const refs=await client.findings(admission,{signal});account(refs);if(refs.items.length>MAX_DASHBOARD_FINDINGS)throw Object.assign(Error('bounded-dashboard-read'),{code:'response-too-large'});
 // Retained pinned versions only. One signal/deadline covers every admission and finding read.
 const findings=[];for(const ref of refs.items){signal.throwIfAborted();const record=await client.finding(admission,ref.id,{version:ref.version,signal});account(record);if(record.digest!==ref.digest)throw Error('identity-mismatch');findings.push(record);}
 signal.throwIfAborted();return {admission,status,findings,evidence:'retained' as const};
}
