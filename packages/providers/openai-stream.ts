import {openAIResponse} from './openai-response.ts';
import {ModelStreamValidator} from './stream.ts';
import {ProviderFailure,type ModelEvent,type ModelRequest} from './types.ts';
const object=(v:unknown):v is Record<string,any>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
/** Translates a complete ordered Responses SSE stream; no terminal event is invented at EOF. */
export class OpenAIStreamTranslator {
 private sequence=-1;private responseId:string|undefined;private ended=false;private failed=false;
 private readonly validator:ModelStreamValidator;
 private readonly items=new Map<string,{index:number;type:string;callId?:string;name?:string;arguments:string}>();
 constructor(private readonly request:ModelRequest,private readonly attemptId:string){this.validator=new ModelStreamValidator(request,attemptId);}
 accept(event:unknown,requestId:string|null):ModelEvent[]{
  try{
   if(this.failed||this.ended||!object(event)||!Number.isSafeInteger(event.sequence_number)||event.sequence_number!==this.sequence+1)throw Error();this.sequence=event.sequence_number;
   const result:ModelEvent[]=[];
   if(event.type==='response.created'){
    if(this.responseId||!object(event.response)||typeof event.response.id!=='string'||!event.response.id.length)throw Error();this.responseId=event.response.id;
    result.push({type:'start',requestId:this.request.requestId,attemptId:this.attemptId,provider:this.request.provider,model:this.request.model});
   }else{
    if(!this.responseId)throw Error();
    if(event.type==='response.output_item.added'){
     const item=event.item;if(!object(item)||typeof item.id!=='string'||!item.id.length||this.items.has(item.id)||!Number.isSafeInteger(event.output_index)||event.output_index<0||[...this.items.values()].some(i=>i.index===event.output_index)||this.items.size>=256)throw Error();
     if(!['message','function_call','reasoning'].includes(item.type))throw Error();
     const state={index:event.output_index,type:item.type,arguments:''} as {index:number;type:string;callId?:string;name?:string;arguments:string};
     if(item.type==='function_call'){
      if(typeof item.call_id!=='string'||typeof item.name!=='string'||typeof item.arguments!=='string')throw Error();state.callId=item.call_id;state.name=item.name;state.arguments=item.arguments;
      result.push({type:'tool-delta',id:item.call_id,name:item.name,argumentsDelta:item.arguments});
     }
     this.items.set(item.id,state);
    }else if(['response.output_text.delta','response.refusal.delta','response.function_call_arguments.delta'].includes(event.type)){
     const item=this.items.get(event.item_id);if(!item||item.index!==event.output_index||typeof event.delta!=='string')throw Error();
     if(event.type==='response.function_call_arguments.delta'){
      if(item.type!=='function_call')throw Error();item.arguments+=event.delta;
      result.push({type:'tool-delta',id:item.callId!,name:null,argumentsDelta:event.delta});
     }else{if(item.type!=='message')throw Error();if(event.delta)result.push({type:'text-delta',text:event.delta});}
    }else if(event.type==='response.function_call_arguments.done'){
     const item=this.items.get(event.item_id);if(!item||item.type!=='function_call'||item.index!==event.output_index||event.arguments!==item.arguments)throw Error();
    }else if(['response.completed','response.incomplete'].includes(event.type)){
     if(!object(event.response)||event.response.id!==this.responseId||event.response.status!==(event.type==='response.completed'?'completed':'incomplete'))throw Error();
     const response=openAIResponse(event.response,this.request,this.attemptId,requestId);result.push({type:'usage',usage:response.usage},{type:'terminal',response});this.ended=true;
    }else if(event.type==='response.failed'||event.type==='error')throw new ProviderFailure('transport',false,'possibly-sent');
    else if(!['response.in_progress','response.output_item.done','response.content_part.added','response.content_part.done','response.output_text.done','response.refusal.done','response.reasoning_summary_part.added','response.reasoning_summary_part.done','response.reasoning_summary_text.delta','response.reasoning_summary_text.done','response.reasoning_text.delta','response.reasoning_text.done','response.output_text.annotation.added'].includes(event.type))throw Error();
   }
   return result.map(item=>this.validator.accept(item));
  }catch(error){this.failed=true;if(error instanceof ProviderFailure)throw error;throw new ProviderFailure('invalid-output',false,'possibly-sent');}
 }
 finish(){if(this.failed||!this.ended)throw new ProviderFailure('invalid-output',false,'possibly-sent');return this.validator.finish();}
}
