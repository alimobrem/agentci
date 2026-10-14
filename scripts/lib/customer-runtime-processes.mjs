import {spawn} from 'node:child_process';
import {resolve,join} from 'node:path';
import {customerAbort} from './customer-diagnostics.mjs';
const controllerKeys=['PATH','HOME','DATABASE_URL','TEMPORAL_ADDRESS','TEMPORAL_NAMESPACE','AGENTCI_REPOSITORY','AGENTCI_ORGANIZATION_ID','AGENTCI_PUBLIC_URL','GITHUB_APP_ID','GITHUB_INSTALLATION_ID','GITHUB_PRIVATE_KEY_FILE','GITHUB_WEBHOOK_SECRET','AGENTCI_EVIDENCE_TOKEN','AGENTCI_OPERATOR_TOKEN','AGENTCI_CURSOR_KEY','AGENTCI_PORT','AGENTCI_REVIEWER_CONFIG_FILE','AGENTCI_REPRODUCTION_CATALOG_FILE','AGENTCI_REPRODUCTION_CATALOG_DIGEST','AGENTCI_REPRODUCTION_CONFIG_REVISION','AGENTCI_REPRODUCTION_CONFIG_DIGEST'];
const workerKeys=[...controllerKeys,'AGENTCI_EVAL_RUNNER_IMAGE','AGENTCI_MODEL_REVIEW_CHECKS'];
const evaluatorKeys=['PATH','HOME','AGENTCI_REPOSITORY','AGENTCI_ORGANIZATION_ID','AGENTCI_EVAL_DATABASE_URL','PGUSER','PGPASSWORD','TEMPORAL_ADDRESS','TEMPORAL_NAMESPACE','AGENTCI_CONTAINER_ENGINE','AGENTCI_EVAL_RUNNER_IMAGE','AGENTCI_EVAL_ENGINES_IMAGE','AGENTCI_EVAL_PROVIDERS_FILE','DOCKER_HOST','CONTAINER_HOST'];
export function customerRuntimeEnvironment(kind,values){if(!['api','worker','evaluator','operator'].includes(kind))throw Error('Unknown owned runtime role');const allowed=kind==='evaluator'?evaluatorKeys:kind==='worker'?workerKeys:controllerKeys;return Object.fromEntries(allowed.filter(key=>values[key]!==undefined).map(key=>[key,values[key]]));}
/** Promise rejection after AbortSignal does not prove child termination. Keep
 * ownership until an actual exit/close, including TERM-ignoring commands. */
export function trackCustomerCommand(commands,pending){
 const child=pending.child;if(!child)return pending;
 let resolveExit;const exited=new Promise(resolve=>{resolveExit=resolve;});
 const finish=()=>{if(child.pid&&child.exitCode===null&&child.signalCode===null)return;commands.delete(child);resolveExit();};
 commands.set(child,exited);child.once('exit',finish);child.once('close',finish);child.on('error',()=>{if(!child.pid)finish();});finish();return pending;
}
export async function closeCustomerCommands(commands){
 for(const child of commands.keys()){if(child.pid&&child.exitCode===null&&child.signalCode===null){try{child.kill('SIGKILL');}catch{}}}
 let timer;try{await Promise.race([Promise.allSettled([...commands.values()]),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Owned command stop timeout')),5000);})]);}finally{clearTimeout(timer);}
 if(commands.size)throw Error('Owned commands remain unverified');
}
/** Supervisor owns only processes it spawned. It never forwards child output into artifacts. */
export class CustomerRuntimeProcesses{
 constructor(root,node=process.execPath){this.root=resolve(root);this.node=node;this.children=new Map();this.commands=new Map();this.events=[];}
 trackCommand(pending){return trackCustomerCommand(this.commands,pending);}
 isAlive(role){const child=this.children.get(role)?.child;return !!(child?.pid&&child.exitCode===null&&child.signalCode===null);}
 state(role){const child=this.children.get(role)?.child;if(!child)return {state:'absent',pid:null,code:null,signal:null};return {state:this.isAlive(role)?'running':child.exitCode!==null||child.signalCode!==null?'exited':'unverified',pid:child.pid??null,code:child.exitCode,signal:child.signalCode};}
 async ensure(role,values,{signal}={}){customerAbort(signal);if(this.children.has(role)&&!this.isAlive(role))await this.stop(role);customerAbort(signal);if(!this.children.has(role))await this.start(role,values);if(!this.isAlive(role))throw Error('Owned process unavailable');return this.children.get(role).child.pid;}
 async start(role,values){if(!['api','worker','evaluator'].includes(role)||this.children.has(role))throw Error('Owned runtime role already exists');const module={api:'apps/control/main.js',worker:'apps/worker/main.js',evaluator:'apps/eval-worker/main.js'}[role];return this.launch(role,join(this.root,'dist',module),[],values);}
 launch(role,file,args,values){const child=spawn(this.node,[file,...args],{env:customerRuntimeEnvironment(role,values),stdio:['ignore','pipe','pipe']});
  // Output may contain backend exception data. Drain it but never retain or print it.
  child.stdout.on('data',()=>{});child.stderr.on('data',()=>{});child.on('error',()=>{});
  const exited=new Promise(resolveExit=>{let settled=false;const finish=(code,signal)=>{if(settled)return;settled=true;child.stdout.destroy();child.stderr.destroy();this.events.push({role,pid:child.pid,code,signal});resolveExit({code,signal});};child.once('error',()=>finish(1,null));child.once('exit',(code,signal)=>{if(role!=='operator')finish(code,signal);});child.once('close',finish);});
  this.children.set(role,{child,exited});this.events.push({role,pid:child.pid,event:'started'});return child.pid;
 }
 async stop(role,signal='SIGTERM'){if(!['SIGTERM','SIGKILL'].includes(signal))throw Error('Unsupported owned signal');const owned=this.children.get(role);if(!owned)return;const {child,exited}=owned;const wait=async ms=>{let timer;try{return await Promise.race([exited,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Owned process stop timeout')),ms);})]);}finally{clearTimeout(timer);}};if(this.isAlive(role)){child.kill(signal);try{await wait(signal==='SIGKILL'?5000:15000);}catch{child.kill('SIGKILL');await wait(5000);}}else await wait(5000);this.children.delete(role);}
 async restart(role,values,{signal='SIGTERM'}={}){const previous=this.children.get(role)?.child.pid;await this.stop(role,signal);const current=await this.start(role,values);if(previous===current)throw Error('Owned restart did not replace process');return {role,previousPid:previous,currentPid:current,signal};}
 async applyAuthority(configPath,configDigest,expected,values){
  if(this.children.has('api')||this.children.has('worker'))throw Error('Drain API and worker before authority application');
  if(this.children.has('operator'))throw Error('Owned operator already active');
  const file=join(this.root,'dist/cmd/reproduction-operator/main.js');
  this.launch('operator',file,['apply','--config',resolve(configPath),'--config-digest',configDigest,'--expected',expected],values);
  const owned=this.children.get('operator');let output='';owned.child.stdout.on('data',bytes=>{output+=bytes;if(output.length>4096)owned.child.kill('SIGKILL');});let timer;
  try{const result=await Promise.race([owned.exited,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Owned authority deadline exceeded')),30000);})]);if(result.code!==0)throw Error('Explicit authority application failed');const applied=JSON.parse(output);if(Object.keys(applied).join(',')!=='applied'||applied.applied.digest!==configDigest||applied.applied.revision!==Number(values.AGENTCI_REPRODUCTION_CONFIG_REVISION))throw Error('Applied authority identity mismatch');return applied.applied;
  }finally{clearTimeout(timer);await this.stop('operator','SIGKILL');}
 }
 forceStop(){for(const child of [...this.children.values()].map(owned=>owned.child).concat([...this.commands.keys()])){if(child.pid&&child.exitCode===null&&child.signalCode===null){try{child.kill('SIGKILL');}catch{}}}}
 async close(signal='SIGTERM'){const failures=[];for(const role of [...this.children.keys()].reverse()){try{await this.stop(role,signal);}catch{failures.push(role);}}try{await closeCustomerCommands(this.commands);}catch{failures.push('engine-command');}if(failures.length||this.commands.size)throw Error('Owned process cleanup incomplete');return {ownedProcessesRemaining:this.children.size+this.commands.size,events:this.events};}
}

/** Completed phases are retained; a failed phase keeps its dependencies usable. */
export function customerCleanupItems(items,clear){
 const completed=new Set();
 return async({signal}={})=>{for(const item of items){customerAbort(signal);if(completed.has(item))continue;await clear(item,{signal});customerAbort(signal);completed.add(item);}};
}
export function customerCleanupPhases(phases){
 const completed=new Map();let inFlight;
 return ({signal}={})=>{
  if(inFlight)return inFlight;
  inFlight=(async()=>{for(const [name,action] of phases){customerAbort(signal);if(completed.has(name))continue;try{const result=await action({signal});customerAbort(signal);completed.set(name,result);}catch{const error=Error('Customer owned cleanup incomplete: '+name);error.customerRecoveryRequired=true;throw error;}}return Object.fromEntries(completed);})().finally(()=>{inFlight=null;});
  return inFlight;
 };
}
export async function withCustomerServiceLifetime(session,run,onClosed=async()=>{},{attempts=3,timeoutMs=120000,shutdownTimeoutMs=10000,onUnquiesced}={}){
 if(!Number.isSafeInteger(attempts)||attempts<1||attempts>3||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>120000)throw Error('Invalid customer cleanup retry bound');
 if(!Number.isSafeInteger(shutdownTimeoutMs)||shutdownTimeoutMs<1||shutdownTimeoutMs>30000||onUnquiesced!==undefined&&typeof onUnquiesced!=='function')throw Error('Invalid customer shutdown bound');
 try{return await run();}finally{
  const deadline=Date.now()+timeoutMs,controller=new AbortController();let cleanup,closed=false,pending;
  for(let attempt=0;attempt<attempts&&Date.now()<deadline;attempt++){
   let timer;try{pending=session.close({signal:controller.signal});cleanup=await Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Customer cleanup deadline exceeded'));},Math.max(1,deadline-Date.now()));})]);closed=true;break;}catch{}finally{clearTimeout(timer);}
  }
  if(!closed){
   controller.abort();const shutdown=new AbortController();let timer;
   const failure=()=>{const error=Error('Customer cleanup requires recovery; private key and dependency paths retained');error.customerRecoveryRequired=true;return error;};
   // Arm before invoking quiesce. On expiry, synchronously fence and terminate
   // owned handles; the trusted entrypoint then persists unverified evidence and
   // exits rather than leaving asynchronous callbacks running after a race.
   const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{shutdown.abort();try{session.forceQuiesce?.();}catch{}try{onUnquiesced?.();}catch{}finally{reject(failure());}},shutdownTimeoutMs);});
   try{const quiescence=Promise.resolve().then(()=>session.quiesce?.({signal:shutdown.signal}));const joined=await Promise.race([Promise.allSettled([quiescence,...(pending?[pending]:[])]),deadline]);if(joined[0].status==='rejected'){shutdown.abort();try{session.forceQuiesce?.();}catch{}try{onUnquiesced?.();}catch{}}}catch{}finally{clearTimeout(timer);}
   throw failure();
  }
  await onClosed(cleanup);
 }
}
