import type {ReviewAdmissionRequest} from 'agentci/client';
import type {Principal} from './session';
import {authorize} from './session';
export interface ReviewBinding {admission:ReviewAdmissionRequest;apiOrigin:string;readToken:string}
export async function readDashboard(principal:Principal,binding:ReviewBinding,signal?:AbortSignal){
 const admission=structuredClone(binding.admission);authorize(principal,admission.subject.organizationId,admission.subject.repository);
 if(signal?.aborted)throw Error('interrupted');
 const {ModelReviewClient}=await import(/* webpackIgnore: true */ 'agentci/client');
 const client=new ModelReviewClient({url:binding.apiOrigin,readToken:binding.readToken,maxAttempts:1,timeoutMs:10000});
 const status=await client.show(admission,{signal});
 if(!status.summary)return {admission,status,findings:[],evidence:'unavailable' as const};
 const refs=await client.findings(admission,{signal});
 // Retained pinned versions only. No current-version substitution after a disposition.
 const findings=[];for(const ref of refs.items){if(signal?.aborted)throw Error('interrupted');const record=await client.finding(admission,ref.id,{version:ref.version});if(record.digest!==ref.digest)throw Error('identity-mismatch');findings.push(record);}
 return {admission,status,findings,evidence:'retained' as const};
}
