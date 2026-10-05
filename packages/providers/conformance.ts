import {randomUUID} from 'node:crypto';
import {invokeModel,streamModel} from './execute.ts';
import type {BudgetLedger} from './budget.ts';
import {ProviderFailure,type ModelProvider,type ModelRequest,type ModelResponse} from './types.ts';

export interface ProviderSmokeRecord {
 scenario:'structured-response'|'streamed-response';requestId:string;attemptId:string;
 provider:string;requestedModel:string;observedModel:string;
 usage:ModelResponse['usage'];elapsedMs:number;
}
/** Uses the normal budgeted execution path. Caller supplies the durable shared ledger.
 * Synthetic transports test this suite too; these records alone do not prove a live run.
 */
export async function runProviderSmoke(provider:ModelProvider,model:string,ledger:BudgetLedger,signal?:AbortSignal):Promise<ProviderSmokeRecord[]>{
 const records:ProviderSmokeRecord[]=[];
 for(const scenario of ['structured-response','streamed-response'] as const){
  const request:ModelRequest={
   schemaVersion:'v1alpha1',requestId:randomUUID(),provider:provider.id,model,
   system:'Return exactly the JSON object requested by the user.',developer:'',
   messages:[{role:'user',content:'Return {"ok":true} using the supplied response schema.'}],
   tools:[],responseSchema:{type:'object',properties:{ok:{type:'boolean',enum:[true]}},required:['ok'],additionalProperties:false},
   parameters:{maxOutputTokens:1024},metadata:{purpose:'agentci-provider-conformance'},
   policy:{deadlineAt:Date.now()+60_000,maxAttempts:1,baseDelayMs:0,maxDelayMs:0},providerExtensions:{}
  };
  const started=performance.now();let startedStream=false;
  const response=scenario==='structured-response'?await invokeModel(provider,request,ledger,signal):await streamModel(provider,request,ledger,event=>{if(event.type==='start')startedStream=true;},signal);
  if(response.status!=='completed'||!response.observedModel||scenario==='streamed-response'&&!startedStream)throw new ProviderFailure('invalid-output',false,'possibly-sent');
  records.push({scenario,requestId:request.requestId,attemptId:response.attemptId,provider:provider.id,requestedModel:model,observedModel:response.observedModel,usage:response.usage,elapsedMs:Math.ceil(performance.now()-started)});
 }
 return records;
}
