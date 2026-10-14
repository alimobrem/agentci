import {randomUUID} from 'node:crypto';
import {Connection} from '@temporalio/client';
import Long from 'long';
/** Register before initialize. Bound connect, raw RPC and transport shutdown. */
export function ownedCustomerNamespace(address,{connect=options=>Connection.connect(options),timeoutMs=30000,closeTimeoutMs=5000}={}){
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000||!Number.isSafeInteger(closeTimeoutMs)||closeTimeoutMs<1||closeTimeoutMs>5000)throw Error('Invalid owned namespace deadline');
 const namespace='customer-staged-'+randomUUID(),abort=new AbortController();let connection,connecting,connectSettled=false,registration='not-attempted',latched=false,closed=false;
 const failure=()=>{const error=Error('Owned namespace operation requires recovery');error.customerRecoveryRequired=true;return error;};
 const healthy=()=>{if(latched||abort.signal.aborted)throw failure();};
 const force=()=>{latched=true;abort.abort();try{connection?.client?.close();}catch{}};
 const bounded=async(pending,ms,onTimeout)=>{let timer;try{return await Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>{onTimeout();reject(failure());},ms);})]);}finally{clearTimeout(timer);}};
 const close=async()=>{
  force();if(closed)return {namespace,temporaryConnections:0,registration};
  if(connecting&&!connectSettled)await bounded(connecting.catch(()=>{}),closeTimeoutMs,force);
  if(connection)await bounded(Promise.resolve().then(()=>connection.close()),closeTimeoutMs,force);
  closed=true;return {namespace,temporaryConnections:0,registration};
 };
 return {namespace,state:()=>({registration,latched,closed}),async initialize(){
  healthy();const deadline=Date.now()+timeoutMs;
  connecting=Promise.resolve().then(()=>connect({address,connectTimeout:'5 seconds'})).then(value=>{connection=value;connectSettled=true;if(latched){try{value.client?.close();}catch{}throw failure();}return value;},()=>{connectSettled=true;throw failure();});
  const registrationWork=connecting.then(async value=>{healthy();registration='uncertain';await value.withDeadline(deadline,()=>value.withAbortSignal(abort.signal,()=>value.workflowService.registerNamespace({namespace,workflowExecutionRetentionPeriod:{seconds:Long.fromNumber(86400)},description:'Owned ephemeral customer staged cancellation'})));healthy();registration='confirmed';});
  try{await bounded(registrationWork,timeoutMs,force);await close();}
  catch{force();throw failure();}
  return namespace;
 },close,quiesce:close,forceQuiesce:force};
}
