import {anthropicResponse} from './anthropic-response.ts';
import {ModelStreamValidator} from './stream.ts';
import {ProviderFailure,type ModelEvent,type ModelRequest} from './types.ts';
const object=(v:unknown):v is Record<string,any>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
/** Ordered Messages stream. Only explicit message_stop can yield terminal output. */
export class AnthropicStreamTranslator {
 private message:Record<string,any>|undefined;private active=-1;private finalDelta=false;private ended=false;private failed=false;private count=0;private bytes=0;
 private readonly blocks:Record<string,any>[]=[];private readonly arguments=new Map<number,string>();private readonly validator:ModelStreamValidator;
 constructor(private readonly request:ModelRequest,private readonly attemptId:string,private readonly acceptedModels:readonly string[]=[request.model]){this.validator=new ModelStreamValidator(request,attemptId);}
 accept(event:unknown,requestId:string|null):ModelEvent[]{
  try{
   if(this.failed||this.ended||!object(event)||++this.count>100000)throw Error();
   this.bytes+=Buffer.byteLength(JSON.stringify(event));if(this.bytes>4194304)throw Error();
   const result:ModelEvent[]=[];
   if(event.type==='ping')return [];
   if(event.type==='error')throw new ProviderFailure('transport',false,'possibly-sent');
   if(event.type==='message_start'){
    const m=event.message;
    if(this.message||!object(m)||m.type!=='message'||m.role!=='assistant'||typeof m.id!=='string'||!m.id||!this.acceptedModels.includes(m.model)||!Array.isArray(m.content)||m.content.length||m.stop_reason!==null||!object(m.usage))throw Error();
    this.message=structuredClone(m);result.push({type:'start',requestId:this.request.requestId,attemptId:this.attemptId,provider:this.request.provider,model:this.request.model});
   }else{
    if(!this.message)throw Error();
    if(event.type==='content_block_start'){
     if(this.finalDelta||this.active!==-1||event.index!==this.blocks.length||this.blocks.length>=256||!object(event.content_block))throw Error();
     const block=structuredClone(event.content_block);this.active=event.index;
     if(block.type==='text'){if(typeof block.text!=='string')throw Error();if(block.text)result.push({type:'text-delta',text:block.text});}
     else if(block.type==='tool_use'){
      if(typeof block.id!=='string'||typeof block.name!=='string'||!object(block.input)||Object.keys(block.input).length)throw Error();
      this.arguments.set(event.index,'');result.push({type:'tool-delta',id:block.id,name:block.name,argumentsDelta:''});
     }else if(!['thinking','redacted_thinking'].includes(block.type))throw Error();
     this.blocks.push(block);
    }else if(event.type==='content_block_delta'){
     if(this.active<0||event.index!==this.active||!object(event.delta))throw Error();
     const block=this.blocks[this.active]!,delta=event.delta;
     if(block.type==='text'&&delta.type==='text_delta'&&typeof delta.text==='string'){block.text+=delta.text;if(delta.text)result.push({type:'text-delta',text:delta.text});}
     else if(block.type==='tool_use'&&delta.type==='input_json_delta'&&typeof delta.partial_json==='string'){
      this.arguments.set(this.active,this.arguments.get(this.active)!+delta.partial_json);result.push({type:'tool-delta',id:block.id,name:null,argumentsDelta:delta.partial_json});
     }else if(block.type==='thinking'&&((delta.type==='thinking_delta'&&typeof delta.thinking==='string')||(delta.type==='signature_delta'&&typeof delta.signature==='string'))){if(delta.type==='thinking_delta')block.thinking=(block.thinking??'')+delta.thinking;else block.signature=(block.signature??'')+delta.signature;}
     else throw Error();
    }else if(event.type==='content_block_stop'){
     if(this.active<0||event.index!==this.active)throw Error();
     if(this.arguments.get(this.active)===''){const block=this.blocks[this.active]!;this.arguments.set(this.active,'{}');result.push({type:'tool-delta',id:block.id,name:null,argumentsDelta:'{}'});}
     this.active=-1;
    }else if(event.type==='message_delta'){
     if(this.active!==-1||!object(event.delta)||!object(event.usage))throw Error();this.finalDelta=true;
     if(event.delta.model!==undefined&&event.delta.model!==this.message.model)throw Error();
     for(const key of ['input_tokens','output_tokens','cache_creation_input_tokens','cache_read_input_tokens'])if(event.usage[key]!==undefined){
      const n=event.usage[key],previous=this.message.usage[key];if(!Number.isSafeInteger(n)||n<0||typeof previous==='number'&&n<previous)throw Error();this.message.usage[key]=n;
     }
     if(event.delta.stop_reason!==undefined){if(this.message.stop_reason!==null&&event.delta.stop_reason!==this.message.stop_reason)throw Error();this.message.stop_reason=event.delta.stop_reason;}
     if(event.delta.stop_sequence!==undefined)this.message.stop_sequence=event.delta.stop_sequence;
    }else if(event.type==='message_stop'){
     if(this.active!==-1||!this.finalDelta)throw Error();
     const completed=['end_turn','stop_sequence','tool_use'].includes(this.message.stop_reason);
     for(const [index,args] of this.arguments){if(completed)this.blocks[index]!.input=JSON.parse(args||'{}');}
     const response=anthropicResponse({...this.message,content:this.blocks},this.request,this.attemptId,requestId,this.acceptedModels);
     result.push({type:'usage',usage:response.usage},{type:'terminal',response});this.ended=true;
    }else throw Error();
   }
   return result.map(item=>this.validator.accept(item));
  }catch(error){this.failed=true;if(error instanceof ProviderFailure)throw error;throw new ProviderFailure('invalid-output',false,'possibly-sent');}
 }
 finish(){if(this.failed||!this.ended)throw new ProviderFailure('invalid-output',false,'possibly-sent');return this.validator.finish();}
}
