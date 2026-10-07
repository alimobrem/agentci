import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {isAbsolute} from 'node:path';
import {canonical,digest} from '../review/engine.ts';
import {validateReproductionConfig,type ReproductionConfigIdentity} from '../findings/reproduction-config.ts';
import type {ReproductionRuntime} from '../runtime/reproductions.ts';
import type {ReproductionAuthorityStore} from '../storage/reproduction-authority.ts';
export class ReproductionOperatorArguments extends Error {constructor(){super('invalid-reproduction-operator-arguments');}}
const fail=():never=>{throw new ReproductionOperatorArguments();};
/** Operator-local command, not a public mutation route. Parse and pin before
 * connecting to privileged services. Never accepts plan commands or credentials. */
export async function parseReproductionApply(args:string[]){
 if(args[0]!=='apply'||args.length!==7)fail();const options:Record<string,string>={};
 for(let i=1;i<args.length;i+=2){const key=args[i]!,value=args[i+1];if(!['--config','--config-digest','--expected'].includes(key)||!value||value.startsWith('--')||Object.hasOwn(options,key))fail();options[key]=value!;}
 const path=options['--config'],hash=options['--config-digest'],prior=options['--expected'];if(!path||!isAbsolute(path)||!hash||!/^sha256:[a-f0-9]{64}$/.test(hash)||!prior)fail();
 let expected:ReproductionConfigIdentity|null=null;
 if(prior!=='initial'){const match=/^([1-9][0-9]*):(sha256:[a-f0-9]{64})$/.exec(prior!);if(!match||!Number.isSafeInteger(Number(match[1])))fail();expected={revision:Number(match![1]),digest:match![2]!};}
 const file=await open(path!,constants.O_RDONLY|constants.O_NONBLOCK);let raw:unknown;
 try{if(!(await file.stat()).isFile())fail();const buffer=Buffer.alloc(65537);let size=0;while(size<buffer.length){const {bytesRead}=await file.read(buffer,size,buffer.length-size,null);if(!bytesRead)break;size+=bytesRead;}if(size>65536)fail();raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,size)));}finally{await file.close();}
 const config=validateReproductionConfig(raw);if(digest(canonical(config))!==hash)fail();return {config,expected,identity:{revision:config.revision,digest:hash!}};
}
export interface ReproductionOperatorConnection {runtime:ReproductionRuntime;authority:Pick<ReproductionAuthorityStore,'apply'>;close:()=>Promise<void>}
export async function applyReproductionOperator(args:string[],connect:()=>Promise<ReproductionOperatorConnection>){
 const request=await parseReproductionApply(args),connection=await connect();
 try{if(canonical(request.identity)!==canonical(connection.runtime.expected))fail();return await connection.authority.apply(request.config,request.expected);}finally{await connection.close();}
}
