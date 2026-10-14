import type {ModelReviewExportOutput,ModelFindingHistory} from 'agentci/client';
import type {Principal} from './session';
import {authorize} from './session';
import type {ReviewBinding} from './dashboard';
import {DASHBOARD_READ_DEADLINE_MS,MAX_DASHBOARD_BYTES,MAX_DASHBOARD_FINDINGS} from './dashboard';
function budget(signal?:AbortSignal){return AbortSignal.any([AbortSignal.timeout(DASHBOARD_READ_DEADLINE_MS),...(signal?[signal]:[])]);}
async function client(binding:ReviewBinding,signal:AbortSignal){
 const {ModelReviewClient}=await import(/* webpackIgnore: true */ 'agentci/client');signal.throwIfAborted();
 return new ModelReviewClient({url:binding.apiOrigin,readToken:binding.readToken,maxAttempts:1,timeoutMs:10000,maxReadBytes:MAX_DASHBOARD_BYTES});
}
/** Nothing private is returned until the authoritative iterator completes naturally. */
export async function readFindingHistory(principal:Principal,binding:ReviewBinding,id:string,caller?:AbortSignal){
 const admission=structuredClone(binding.admission);authorize(principal,admission.subject.organizationId,admission.subject.repository);
 const signal=budget(caller),sdk=await client(binding,signal);
 const status=await sdk.show(admission,{signal});
 if(!status.summary)throw Object.assign(Error('Review incomplete'),{code:'review-not-complete'});
 if(status.summary.summary.findings.length>MAX_DASHBOARD_FINDINGS)throw Object.assign(Error('Finding bound exceeded'),{code:'response-too-large'});
 const manifest=await sdk.findings(admission,{signal});
 if(manifest.summaryDigest!==status.summary.digest)throw Error('Summary changed during history read');
 const reference=manifest.items.find(f=>f.id===id);
 if(!reference)throw Object.assign(Error('Finding not retained by this review'),{code:'not-found'});
 const records:ModelFindingHistory['items']=[];let final:ModelFindingHistory|undefined,pages=0;
 for await(const page of sdk.findingHistory(admission,id,{signal})){signal.throwIfAborted();records.push(...page.items);final=page;pages++;}
 signal.throwIfAborted();
 if(!final||final.nextCursor!==null)throw Error('Incomplete history');
 if(records[reference.version-1]?.digest!==reference.digest)throw Error('History does not retain summary-pinned evidence');
 return {kind:'history' as const,admission,findingId:id,summaryReference:reference,summaryDigest:status.summary.digest,throughVersion:final.throughVersion,pageCount:pages,records,complete:true as const};
}
/** The end frame is still provisional; only the SDK EOF certificate releases the buffer. */
export async function readReviewExport(principal:Principal,binding:ReviewBinding,caller?:AbortSignal){
 const admission=structuredClone(binding.admission);authorize(principal,admission.subject.organizationId,admission.subject.repository);
 const signal=budget(caller),sdk=await client(binding,signal),records:Extract<ModelReviewExportOutput,{type:'record'}>['frame'][]=[];
 let certificate:Extract<ModelReviewExportOutput,{type:'complete'}>['data']|undefined;
 for await(const item of sdk.modelReviewExport(admission,{signal,timeoutMs:DASHBOARD_READ_DEADLINE_MS})){signal.throwIfAborted();if(item.type==='record')records.push(item.frame);else certificate=item.data;}
 signal.throwIfAborted();if(!certificate?.complete)throw Error('Incomplete export');
 return {kind:'export' as const,admission,records,certificate};
}
