import {canonical} from '../review/engine.ts';
import {xAIResponse} from './xai-response.ts';
import {ModelStreamValidator} from './stream.ts';
import {ProviderFailure,type ModelEvent,type ModelRequest} from './types.ts';
const object=(v:unknown):v is Record<string,any>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
type Item={index:number;id?:string;type:string;callId?:string;name?:string;arguments:string;text:string;done?:Record<string,any>};
/** xAI permits omitted sequence/locator fields; resolve them only when unambiguous. */
export class XAIStreamTranslator {
 private sequence:number|undefined;private id:string|undefined;private ended=false;private failed=false;private bytes=0;private events=0;
 private readonly items:Item[]=[];private readonly validator:ModelStreamValidator;
 constructor(private readonly request:ModelRequest,private readonly attemptId:string,private readonly acceptedModels:readonly string[]=[request.model]){this.validator=new ModelStreamValidator(request,attemptId);}
 private item(event:Record<string,any>,type?:string):Item{
  const matches=this.items.filter(item=>(event.output_index===undefined||event.output_index===item.index)&&(event.item_id===undefined||event.item_id===item.id)&&(!type||item.type===type)&&!item.done);
  if(matches.length!==1)throw Error();return matches[0]!;
 }
 accept(event:unknown,requestId:string|null):ModelEvent[]{
  try{
   if(this.failed||this.ended||!object(event)||++this.events>100000||(this.bytes+=Buffer.byteLength(JSON.stringify(event)))>4194304)throw Error();
   if(event.type==='unknown'&&object(event.raw)&&['response.refusal.delta','response.refusal.done'].includes(event.raw.type))event=event.raw;
   if(!object(event))throw Error();
   if(event.sequence_number!==undefined){if(!Number.isSafeInteger(event.sequence_number)||event.sequence_number<0||this.sequence!==undefined&&event.sequence_number!==this.sequence+1)throw Error();this.sequence=event.sequence_number;}
   else if(this.sequence!==undefined&&event.type!=='ping')throw Error();
   if(event.type==='ping')return [];
   const result:ModelEvent[]=[];
   if(event.type==='response.created'){
    if(this.id||!object(event.response)||typeof event.response.id!=='string'||!event.response.id||!this.acceptedModels.includes(event.response.model))throw Error();this.id=event.response.id;
    result.push({type:'start',requestId:this.request.requestId,attemptId:this.attemptId,provider:'xai',model:this.request.model});
   }else{
    if(!this.id)throw Error();
    if(event.type==='response.output_item.added'){
     const item=event.item;if(!object(item)||!['message','function_call','reasoning'].includes(item.type)||event.output_index!==this.items.length||this.items.length>=256||item.id!==undefined&&(typeof item.id!=='string'||!item.id||this.items.some(i=>i.id===item.id)))throw Error();
     const state:Item={index:event.output_index,id:item.id,type:item.type,arguments:'',text:''};
     if(item.type==='function_call'){
      if(typeof item.call_id!=='string'||!item.call_id||typeof item.name!=='string'||typeof item.arguments!=='string')throw Error();
      state.callId=item.call_id;state.name=item.name;state.arguments=item.arguments;result.push({type:'tool-delta',id:state.callId!,name:state.name!,argumentsDelta:state.arguments});
     }
     this.items.push(state);
    }else if(event.type==='response.output_text.delta'||event.type==='response.refusal.delta'){
     const item=this.item(event,'message');if(typeof event.delta!=='string')throw Error();item.text+=event.delta;if(event.delta)result.push({type:'text-delta',text:event.delta});
    }else if(event.type==='response.function_call_arguments.delta'){
     const item=this.item(event,'function_call');if(typeof event.delta!=='string')throw Error();item.arguments+=event.delta;result.push({type:'tool-delta',id:item.callId!,name:null,argumentsDelta:event.delta});
    }else if(event.type==='response.output_text.done'||event.type==='response.refusal.done'){
     if(this.item(event,'message').text!==(event.type==='response.refusal.done'?event.refusal:event.text))throw Error();
    }else if(event.type==='response.function_call_arguments.done'){
     const item=this.item(event,'function_call');if(item.arguments!==event.arguments||event.name!==undefined&&event.name!==item.name)throw Error();
    }else if(event.type==='response.output_item.done'){
     const item=this.item({...event,item_id:event.item?.id});if(!object(event.item)||event.item.type!==item.type||event.item.id!==item.id)throw Error();
     if(item.type==='function_call'&&(event.item.arguments!==item.arguments||event.item.call_id!==item.callId||event.item.name!==item.name))throw Error();
     item.done=event.item;
    }else if(event.type==='response.completed'||event.type==='response.incomplete'){
     const raw=event.response;if(!object(raw)||raw.id!==this.id||raw.status!==(event.type==='response.completed'?'completed':'incomplete'))throw Error();
     if(raw.status==='completed'&&(!Array.isArray(raw.output)||raw.output.length!==this.items.length||this.items.some((item,index)=>!item.done||canonical(item.done)!==canonical(raw.output[index]))))throw Error();
     const response=xAIResponse(raw,this.request,this.attemptId,requestId,this.acceptedModels);result.push({type:'usage',usage:response.usage},{type:'terminal',response});this.ended=true;
    }else if(event.type==='response.in_progress'){
     if(!object(event.response)||event.response.id!==this.id||!this.acceptedModels.includes(event.response.model))throw Error();
    }else if(['response.content_part.added','response.content_part.done'].includes(event.type)){
     this.item(event,'message');if(!Number.isSafeInteger(event.content_index)||event.content_index<0||!object(event.part)||!['output_text','refusal'].includes(event.part.type))throw Error();
    }else if(['response.reasoning_text.delta','response.reasoning_text.done','response.reasoning_summary_text.delta','response.reasoning_summary_text.done'].includes(event.type)){
     this.item(event,'reasoning');if(event.type.endsWith('.delta')&&typeof event.delta!=='string')throw Error();
    }else if(event.type==='error'||event.type==='response.failed')throw new ProviderFailure('transport',false,'possibly-sent');
    else throw Error();
   }
   return result.map(value=>this.validator.accept(value));
  }catch(error){this.failed=true;if(error instanceof ProviderFailure)throw error;throw new ProviderFailure('invalid-output',false,'possibly-sent');}
 }
 finish(){if(this.failed||!this.ended)throw new ProviderFailure('invalid-output',false,'possibly-sent');return this.validator.finish();}
}
