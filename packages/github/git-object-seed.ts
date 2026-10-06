import {execFile} from 'node:child_process';
import {resolve} from 'node:path';
export interface GitBlobSeed {repository:string;read(sha:string,size:number):Promise<Buffer|undefined>}
/** Only the trusted hosted checkout supplies this source. Object bytes remain
 * untrusted until the remote reader verifies a freshly authorized tree reference.
 * No ref checkout, object fetch, filters, hooks, replacement objects or shell. */
export function trustedGitBlobSeed(root:string,repository:string):GitBlobSeed {
 if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository))throw Error('Invalid seed repository');
 const directory=resolve(root),env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('GIT_')));
 Object.assign(env,{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_NO_LAZY_FETCH:'1',GIT_TERMINAL_PROMPT:'0',GIT_ALLOW_PROTOCOL:''});
 let active=false;const waiting:(()=>void)[]=[];
 return {repository,async read(sha,size){
  if(!/^[a-f0-9]{40}$/.test(sha)||!Number.isSafeInteger(size)||size<0||size>2*1024*1024)throw Error('Invalid seed object bounds');
  if(active){if(waiting.length>=16)throw Error('Seed concurrency limit');await new Promise<void>(ready=>waiting.push(ready));}else active=true;
  try{
   const output=await new Promise<Buffer>((done,fail)=>{
    const child=execFile('git',['--no-replace-objects','--no-lazy-fetch','-c','core.hooksPath=/dev/null','-c','protocol.allow=never','-C',directory,'cat-file','--batch'],{env,encoding:'buffer',timeout:2000,killSignal:'SIGKILL',maxBuffer:2*1024*1024+256},(error,stdout,stderr)=>error||stderr.length?fail(Error('Local Git object unavailable')):done(stdout));
    child.stdin!.on('error',()=>{});child.stdin!.end(sha+'\n');
   });
   if(output.equals(Buffer.from(sha+' missing\n')))return undefined;
   const header=Buffer.from(`${sha} blob ${size}\n`);
   if(output.length!==header.length+size+1||!output.subarray(0,header.length).equals(header)||output.at(-1)!==10)throw Error('Local Git object mismatch');
   return output.subarray(header.length,output.length-1);
  }finally{const next=waiting.shift();if(next)next();else active=false;}
 }};
}
