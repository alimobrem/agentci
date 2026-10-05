import {randomUUID} from 'node:crypto';
import {invokeModel,streamModel} from './execute.ts';
import type {BudgetLedger} from './budget.ts';
import {ProviderFailure,type ModelProvider,type ModelRequest,type ModelResponse} from './types.ts';

export interface ProviderSmokeRecord {
 scenario:'structured-response'|'streamed-response'|'tool-proposal'|'tool-result';requestId:string;attemptId:string;
 provider:string;requestedModel:string;observedModel:string;
 usage:ModelResponse['usage'];elapsedMs:number;
}
/** Uses the normal budgeted execution path. Caller supplies the durable shared ledger.
 * Synthetic transports test this suite too; these records alone do not prove a live run.
 */
export interface ProviderSmokeOptions {
 appendToolResults?:(request:ModelRequest,response:ModelResponse,results:{id:string;content:string}[])=>ModelRequest;
}
export async function runProviderSmoke(provider:ModelProvider,model:string,ledger:BudgetLedger,signal?:AbortSignal,options:ProviderSmokeOptions={}):Promise<ProviderSmokeRecord[]>{
 const records:ProviderSmokeRecord[]=[];
 for(const scenario of ['structured-response','streamed-response','tool-proposal'] as const){
  const request:ModelRequest={
   schemaVersion:'v1alpha1',requestId:randomUUID(),provider:provider.id,model,
   system:'Return exactly the JSON object requested by the user.',developer:'',
   messages:[{role:'user',content:'Return {"ok":true} using the supplied response schema.'}],
   tools:[],responseSchema:{type:'object',properties:{ok:{type:'boolean',enum:[true]}},required:['ok'],additionalProperties:false},
   parameters:{maxOutputTokens:1024},metadata:{purpose:'agentci-provider-conformance'},
   policy:{deadlineAt:Date.now()+60_000,maxAttempts:1,baseDelayMs:0,maxDelayMs:0},providerExtensions:{}
  };
  if(scenario==='tool-proposal'){
   request.system='Propose the requested tool call. Do not perform any external action. After receiving its result, return exactly {"ok":true} without another tool call.';
   request.messages=[{role:'user',content:'Call check_fixture with marker equal to agentci-smoke. Before receiving its result, do not answer with text.'}];
   request.responseSchema=null;
   request.tools=[{name:'check_fixture',description:'Synthetic acceptance tool. The proposal is validated but never executed.',inputSchema:{type:'object',properties:{marker:{type:'string',enum:['agentci-smoke']}},required:['marker'],additionalProperties:false}}];
  }
  const started=performance.now();let startedStream=false;
  const response=scenario!=='streamed-response'?await invokeModel(provider,request,ledger,signal):await streamModel(provider,request,ledger,event=>{if(event.type==='start')startedStream=true;},signal);
  if(response.status!=='completed'||!response.observedModel||response.usage.inputTokens===null||response.usage.outputTokens===null||scenario==='tool-proposal'&&response.toolCalls.length!==1||scenario==='streamed-response'&&!startedStream)throw new ProviderFailure('invalid-output',false,'possibly-sent');
  records.push({scenario,requestId:request.requestId,attemptId:response.attemptId,provider:provider.id,requestedModel:model,observedModel:response.observedModel,usage:response.usage,elapsedMs:Math.ceil(performance.now()-started)});
  if(scenario==='tool-proposal'&&options.appendToolResults){
   // Supply a constant fixture result; never dispatch model-proposed tools.
   const next=options.appendToolResults(request,response,[{id:response.toolCalls[0]!.id,content:'{"ok":true}'}]);
   next.policy.deadlineAt=Date.now()+60_000;
   const continuedAt=performance.now(),continued=await invokeModel(provider,next,ledger,signal);
   let output;try{output=JSON.parse(continued.text);}catch{throw new ProviderFailure('invalid-output',false,'possibly-sent');}
   if(continued.status!=='completed'||continued.toolCalls.length||!continued.observedModel||continued.usage.inputTokens===null||continued.usage.outputTokens===null||!output||typeof output!=='object'||Array.isArray(output)||Object.keys(output).join(',')!=='ok'||output.ok!==true)throw new ProviderFailure('invalid-output',false,'possibly-sent');
   records.push({scenario:'tool-result',requestId:next.requestId,attemptId:continued.attemptId,provider:provider.id,requestedModel:model,observedModel:continued.observedModel,usage:continued.usage,elapsedMs:Math.ceil(performance.now()-continuedAt)});
  }
 }
 return records;
}
