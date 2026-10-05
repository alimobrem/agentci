import {lstat,open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {isAbsolute,join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import type {PreflightCheck} from './preflight.ts';
const run=promisify(execFile);
export interface MountPreflightConfig {engine:'docker'|'podman';image:string;directory:string;files:string[]}
export type MountCommand=(engine:string,args:string[],options:{timeout:number;maxBuffer:number})=>Promise<{stdout:string}>;
const probeScript="const fs=require('node:fs'),crypto=require('node:crypto');const result={};for(const name of JSON.parse(process.argv[1])){const fd=fs.openSync('/probe/'+name,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{const s=fs.fstatSync(fd);if(!s.isFile()||s.size>1048576)throw Error('invalid probe file');const b=Buffer.alloc(1048577);let n=0,k;while(n<b.length&&(k=fs.readSync(fd,b,n,b.length-n,null))>0)n+=k;if(n>1048576)throw Error('oversized probe file');result[name]=crypto.createHash('sha256').update(b.subarray(0,n)).digest('hex');}finally{fs.closeSync(fd);}}process.stdout.write(JSON.stringify(result));";
async function boundedFileHash(path:string){
 const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const stat=await file.stat();if(!stat.isFile()||stat.size>1048576)throw new Error('Invalid probe file');
  const bytes=Buffer.alloc(1048577);let size=0;
  while(size<bytes.length){const read=await file.read(bytes,size,bytes.length-size,null);if(!read.bytesRead)break;size+=read.bytesRead;}
  if(size>1048576)throw new Error('Oversized probe file');return createHash('sha256').update(bytes.subarray(0,size)).digest('hex');
 }finally{await file.close();}
}
export function validMountConfig(config:MountPreflightConfig):boolean {return !(!config||!['docker','podman'].includes(config.engine)||typeof config.image!=='string'||! /^(?:[a-z0-9][a-z0-9./:_-]*@)?sha256:[a-f0-9]{64}$/.test(config.image)||typeof config.directory!=='string'||!isAbsolute(config.directory)||/[,\x00-\x1f]/.test(config.directory)||!Array.isArray(config.files)||!config.files.length||config.files.length>64||new Set(config.files).size!==config.files.length||config.files.some(file=>typeof file!=='string'||!/^[a-zA-Z0-9_-]+\.(sql|json)$/.test(file)));}
export async function preflightMount(config:MountPreflightConfig,command:MountCommand=run):Promise<PreflightCheck>{
 const result=(passed:boolean,code:string):PreflightCheck=>({id:'deployment:mount',passed,code});
 if(!validMountConfig(config))return result(false,'invalid-mount-probe-config');
 const expected:Record<string,string>={};
 try{
  const directory=await lstat(config.directory);if(!directory.isDirectory()||directory.isSymbolicLink())return result(false,'mount-source-unavailable');
  for(const file of config.files)expected[file]=await boundedFileHash(join(config.directory,file));
 }catch{return result(false,'mount-source-unavailable');}
 const name=`agentci-preflight-${randomUUID()}`;
 let outcome:PreflightCheck;
 try{
  const {stdout}=await command(config.engine,['run','--pull=never','--rm','--name',name,'--network=none','--user=1001:1001','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--pids-limit=32','--memory=64m','--cpus=0.25','--mount',`type=bind,src=${config.directory},dst=/probe,readonly`,'--entrypoint','node',config.image,'-e',probeScript,JSON.stringify(config.files)],{timeout:30000,maxBuffer:65536});
  const actual=JSON.parse(stdout);
  const matches=actual&&typeof actual==='object'&&!Array.isArray(actual)&&Object.keys(actual).length===config.files.length&&config.files.every(file=>actual[file]===expected[file]);
  outcome=result(!!matches,matches?'daemon-mount-bytes-match':'daemon-mount-content-mismatch');
 }catch{outcome=result(false,'daemon-mount-unavailable');}
 finally{
  // Only remove this invocation's random container, including a timed-out run.
  try{await command(config.engine,['rm','--force',name],{timeout:10000,maxBuffer:65536});}catch{ /* --rm may already have removed it; see inspect below. */ }
 }
 try{
  const {stdout}=await command(config.engine,['ps','-a','--filter',`name=^/${name}$`,'--format','{{.Names}}'],{timeout:10000,maxBuffer:65536});
  if(stdout.trim())return result(false,'mount-probe-cleanup-unconfirmed');
 }catch{return result(false,'mount-probe-cleanup-unconfirmed');}
 return outcome;
}
