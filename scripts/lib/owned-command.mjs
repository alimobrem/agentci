import {setTimeout as pause} from 'node:timers/promises';
import {spawnSync} from 'node:child_process';
export async function ownedGroupMembers(pid){
 if(process.platform!=='linux')throw Error('Verified Linux CI process groups required');
 const result=spawnSync('ps',['-eo','pid=,pgid=,stat='],{env:{PATH:process.env.PATH,LC_ALL:'C'},encoding:'utf8',timeout:2000,maxBuffer:1024*1024});
 if(result.error||result.status!==0)throw Error('Owned process inventory unavailable');
 const members=[];for(const line of result.stdout.trim().split('\n')){const fields=line.trim().split(/\s+/);if(fields.length!==3||!/^\d+$/.test(fields[0])||!/^\d+$/.test(fields[1]))throw Error('Owned process inventory invalid');if(Number(fields[1])===pid&&!['Z','X'].includes(fields[2][0]))members.push(Number(fields[0]));}return members;
}
export async function terminateOwnedGroup(child){
 if(!Number.isInteger(child.pid))return;
 const signal=value=>{try{process.kill(-child.pid,value);return true;}catch(error){if(error.code==='ESRCH')return false;throw Error('Owned command process group termination failed');}};
 if(!signal('SIGTERM'))return;
 for(let attempt=0;attempt<10;attempt++){await pause(50);if(!(await ownedGroupMembers(child.pid)).length)return;}
 signal('SIGKILL');
 for(let attempt=0;attempt<30;attempt++){if(!(await ownedGroupMembers(child.pid)).length)return;await pause(50);}
 throw Error('Owned command processes remain after forced termination');
}
const verifiedClosures=new WeakSet();
export const ownedCommandClosed=child=>verifiedClosures.has(child);
export async function waitOwnedCommand(child,outputs){
 let cancelled=false,stopping,timer,expired=false;
 const stop=()=>stopping??=terminateOwnedGroup(child);
 let rejectDeadline;const deadline=new Promise((resolve,reject)=>{rejectDeadline=reject;});
 // Arm at exit or cancellation, rather than after waiting for inherited pipes.
 const arm=()=>{if(!timer){timer=setTimeout(()=>{expired=true;rejectDeadline(Error('Owned command drain remained unverified'));},3000);timer.unref();}};
 const handlers=new Map(['SIGINT','SIGTERM'].map(signal=>[signal,()=>{cancelled=true;arm();void stop().catch(()=>{});} ]));
 for(const [signal,handler]of handlers)process.on(signal,handler);
 const closed=new Promise(resolve=>child.once('close',resolve));
 const exited=new Promise((resolve,reject)=>{child.once('error',()=>{arm();reject(Error('Owned command could not start'));});child.once('exit',(code,signal)=>{arm();void stop().then(()=>resolve({code,signal}),reject);});});
 try{const[result]=await Promise.race([Promise.all([exited,outputs,closed]),deadline]);verifiedClosures.add(child);return !cancelled&&result.code===0&&!result.signal?0:1;}
 catch{
  arm();await stop();
  try{await Promise.race([closed,deadline]);if(!expired)verifiedClosures.add(child);}
  finally{if(expired){child.stdout?.destroy();child.stderr?.destroy();}}
  throw Error('Owned command failed; diagnostics withheld');
 }
 finally{clearTimeout(timer);for(const [signal,handler]of handlers)process.off(signal,handler);}
}
