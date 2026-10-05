import {canonical} from '../review/engine.ts';
import {validateModelResponse} from './response.ts';
import {ProviderFailure,type ModelEvent,type ModelRequest,type ModelResponse,type ModelUsage} from './types.ts';
const object=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value:Record<string,unknown>,keys:string[])=>Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
/** Deltas are provisional display data. Only finish() produces an actionable result. */
export class ModelStreamValidator {
 private failed=false;private started=false;private terminal:ModelResponse|undefined;private count=0;private bytes=0;private text='';private usage:ModelUsage|undefined;
 private readonly tools=new Map<string,{name:string;arguments:string}>();
 private readonly request:ModelRequest;
 constructor(request:ModelRequest,private readonly attemptId:string){this.request=structuredClone(request);}
 accept(input:unknown):ModelEvent{
  try{
   if(this.failed||this.terminal||++this.count>100000||!object(input))throw Error();
   const type=input.type;
   if(type==='start'){
    if(this.started||!exact(input,['type','requestId','attemptId','provider','model'])||input.requestId!==this.request.requestId||input.attemptId!==this.attemptId||input.provider!==this.request.provider||input.model!==this.request.model)throw Error();this.started=true;
   }else{
    if(!this.started)throw Error();
    if(type==='text-delta'){
     if(this.usage||!exact(input,['type','text'])||typeof input.text!=='string'||!input.text.length)throw Error();this.text+=input.text;
    }else if(type==='tool-delta'){
     if(this.usage||!exact(input,['type','id','name','argumentsDelta'])||typeof input.id!=='string'||!input.id.length||input.id.length>256||typeof input.argumentsDelta!=='string')throw Error();
     let tool=this.tools.get(input.id);
     if(!tool){if(this.tools.size>=32||typeof input.name!=='string'||!this.request.tools.some(tool=>tool.name===input.name))throw Error();tool={name:input.name,arguments:''};this.tools.set(input.id,tool);}
     else if(input.name!==null&&input.name!==tool.name)throw Error();
     tool.arguments+=input.argumentsDelta;
    }else if(type==='usage'){
     if(this.usage||!exact(input,['type','usage']))throw Error();
     this.usage=validateModelResponse({schemaVersion:'v1alpha1',requestId:this.request.requestId,attemptId:this.attemptId,provider:this.request.provider,model:this.request.model,status:'incomplete',text:'',structuredOutput:null,toolCalls:[],usage:input.usage,providerRequestId:null},this.request,this.attemptId).usage;
    }else if(type==='terminal'){
     if(!exact(input,['type','response']))throw Error();const response=validateModelResponse(input.response,this.request,this.attemptId);
     if(response.text!==this.text||this.usage&&canonical(this.usage)!==canonical(response.usage))throw Error();
     if(response.status==='completed'){
      const calls=[...this.tools].map(([id,tool])=>({id,name:tool.name,arguments:JSON.parse(tool.arguments)}));
      if(canonical(calls)!==canonical(response.toolCalls))throw Error();
     }
     this.terminal=response;
    }else throw Error();
   }
   this.bytes+=Buffer.byteLength(JSON.stringify(input));if(this.bytes>2097152||this.text.length>524288)throw Error();
   return structuredClone(input) as unknown as ModelEvent;
  }catch{this.failed=true;throw new ProviderFailure('invalid-output',false,'possibly-sent');}
 }
 finish():ModelResponse{
  if(this.failed||!this.terminal)throw new ProviderFailure('invalid-output',false,'possibly-sent');return structuredClone(this.terminal);
 }
}
