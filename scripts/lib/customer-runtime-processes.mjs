import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {resolve,join} from 'node:path';
const controllerKeys=['PATH','HOME','DATABASE_URL','TEMPORAL_ADDRESS','TEMPORAL_NAMESPACE','AGENTCI_REPOSITORY','AGENTCI_ORGANIZATION_ID','AGENTCI_PUBLIC_URL','GITHUB_APP_ID','GITHUB_INSTALLATION_ID','GITHUB_PRIVATE_KEY_FILE','GITHUB_WEBHOOK_SECRET','AGENTCI_EVIDENCE_TOKEN','AGENTCI_OPERATOR_TOKEN','AGENTCI_CURSOR_KEY','AGENTCI_PORT','AGENTCI_REVIEWER_CONFIG_FILE','AGENTCI_REPRODUCTION_CATALOG_FILE','AGENTCI_REPRODUCTION_CATALOG_DIGEST','AGENTCI_REPRODUCTION_CONFIG_REVISION','AGENTCI_REPRODUCTION_CONFIG_DIGEST'];
const evaluatorKeys=['PATH','HOME','AGENTCI_REPOSITORY','AGENTCI_ORGANIZATION_ID','AGENTCI_EVAL_DATABASE_URL','PGUSER','PGPASSWORD','TEMPORAL_ADDRESS','TEMPORAL_NAMESPACE','AGENTCI_CONTAINER_ENGINE','AGENTCI_EVAL_RUNNER_IMAGE','AGENTCI_EVAL_ENGINES_IMAGE','AGENTCI_EVAL_PROVIDERS_FILE','DOCKER_HOST','CONTAINER_HOST'];
export function customerRuntimeEnvironment(kind,values){if(!['api','worker','evaluator','operator'].includes(kind))throw Error('Unknown owned runtime role');const allowed=kind==='evaluator'?evaluatorKeys:controllerKeys;return Object.fromEntries(allowed.filter(key=>values[key]!==undefined).map(key=>[key,values[key]]));}
/** Supervisor owns only processes it spawned. It never forwards child output into artifacts. */
export class CustomerRuntimeProcesses{
 constructor(root,node=process.execPath){this.root=resolve(root);this.node=node;this.children=new Map();this.events=[];}
 async start(role,values){if(!['api','worker','evaluator'].includes(role)||this.children.has(role))throw Error('Owned runtime role already exists');const module={api:'apps/control/main.js',worker:'apps/worker/main.js',evaluator:'apps/eval-worker/main.js'}[role];return this.launch(role,join(this.root,'dist',module),[],values);}
 launch(role,file,args,values){const child=spawn(this.node,[file,...args],{env:customerRuntimeEnvironment(role,values),stdio:['ignore','pipe','pipe']});
  // Output may contain backend exception data. Drain it but never retain or print it.
  child.stdout.on('data',()=>{});child.stderr.on('data',()=>{});child.on('error',()=>{});
  const exited=new Promise(resolveExit=>{let settled=false;const finish=(code,signal)=>{if(settled)return;settled=true;this.events.push({role,pid:child.pid,code,signal});resolveExit({code,signal});};child.once('error',()=>finish(1,null));child.once('close',finish);});
  this.children.set(role,{child,exited});this.events.push({role,pid:child.pid,event:'started'});return child.pid;
 }
 async stop(role,signal='SIGTERM'){if(!['SIGTERM','SIGKILL'].includes(signal))throw Error('Unsupported owned signal');const owned=this.children.get(role);if(!owned)return;const {child,exited}=owned;if(child.pid&&child.exitCode===null&&child.signalCode===null){child.kill(signal);let timer;try{await Promise.race([exited,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Owned process stop timeout')),15000);})]);}catch{child.kill('SIGKILL');await exited;}finally{clearTimeout(timer);}}else await exited;this.children.delete(role);}
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
 async close(){const failures=[];for(const role of [...this.children.keys()].reverse()){try{await this.stop(role);}catch{failures.push(role);}}if(failures.length)throw Error('Owned process cleanup incomplete: '+failures.join(','));return {ownedProcessesRemaining:this.children.size,events:this.events};}
}

export async function withCustomerServiceLifetime(session,run,onClosed=async()=>{}){
 try{return await run();}finally{const cleanup=await session.close();await onClosed(cleanup);}
}
