/** Fixed runner harness. Repository commands and reports remain untrusted data. */
export const RUNNER_BOOTSTRAP = String.raw`
import {mkdir,writeFile,realpath,open} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,relative,isAbsolute,dirname} from 'node:path';
const options=JSON.parse(process.argv[1]);
const chunks=[];let inputBytes=0;
for await(const chunk of process.stdin){inputBytes+=chunk.length;if(inputBytes>64*1024*1024)throw Error('input limit');chunks.push(chunk);}
const files=JSON.parse(Buffer.concat(chunks).toString('utf8'));
for(const [name,text] of Object.entries(files)){
  const path=resolve('/workspace',name),rel=relative('/workspace',path);
  if(rel==='..'||rel.startsWith('../')||isAbsolute(rel)||typeof text!=='string')throw Error('unsafe input');
  await mkdir(dirname(path),{recursive:true});await writeFile(path,text,{mode:0o600,flag:'wx'});
}
const start=performance.now(), hashes={stdout:createHash('sha256'),stderr:createHash('sha256')};
let bytes=0,reason=null;
const child=spawn(options.argv[0],options.argv.slice(1),{cwd:'/workspace',env:{PATH:process.env.PATH,HOME:'/tmp',TMPDIR:'/tmp',PYTHONDONTWRITEBYTECODE:'1',PYTEST_DISABLE_PLUGIN_AUTOLOAD:'1',AGENTCI_MODEL_VARIANT:options.model??''},stdio:['ignore','pipe','pipe'],detached:true});
const terminate=()=>{try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}};
const timer=setTimeout(()=>{reason='timeout';terminate();},options.timeoutMs);
for(const name of ['stdout','stderr'])child[name].on('data',chunk=>{bytes+=chunk.length;hashes[name].update(chunk);if(bytes>options.maxOutputBytes){reason='output-limit';terminate();}});
const completed=await new Promise(resolve=>{child.on('error',()=>{reason='spawn-error';resolve({code:null,signal:null});});child.on('close',(code,signal)=>resolve({code,signal}));});
clearTimeout(timer);
const result={status:reason==='timeout'?'timeout':reason?'error':'completed',exitCode:completed.code,signal:completed.signal,stdoutDigest:'sha256:'+hashes.stdout.digest('hex'),stderrDigest:'sha256:'+hashes.stderr.digest('hex'),latencyMs:performance.now()-start};
if(reason)result.error=reason;
if(options.report&&!reason){
  try{
    const path=resolve('/workspace',options.report),actual=await realpath(path),rel=relative('/workspace',actual);
    if(rel==='..'||rel.startsWith('../')||isAbsolute(rel))throw Error('unsafe');
    const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    try{
      const info=await file.stat();if(!info.isFile()||info.size>options.maxOutputBytes)throw Error('unsafe');
      const buffer=Buffer.alloc(options.maxOutputBytes+1);let used=0;
      while(used<buffer.length){const {bytesRead}=await file.read(buffer,used,buffer.length-used,null);if(!bytesRead)break;used+=bytesRead;}
      if(used>options.maxOutputBytes)throw Error('limit');
      result.report=buffer.subarray(0,used).toString('utf8');
    }finally{await file.close();}
  }catch{result.reportError='missing-or-invalid-report';}
}
console.log(JSON.stringify(result));
`;
