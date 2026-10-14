import {readFileSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {generateKeyPairSync} from 'node:crypto';
import {Pool} from 'pg';
import {Connection} from '@temporalio/client';
import {CustomerRuntimeProcesses,customerCleanupPhases,withCustomerServiceLifetime} from '../../scripts/lib/customer-runtime-processes.mjs';
import {customerRecoveryOwner} from '../../scripts/lib/customer-recovery-owner.mjs';
import {terminateCustomerHarness} from '../../scripts/lib/customer-terminal-recovery.mjs';
import {customerDiagnostics,customerDiagnosticFacts} from '../../scripts/lib/customer-diagnostics.mjs';
import {withCustomerKey} from '../../scripts/lib/customer-acceptance-preflight.mjs';

// This is a disposable, explicitly invoked child fixture. Configuration contains
// only test-owned connection material and is never written to output/artifacts.
const config=JSON.parse(readFileSync(process.argv[2],'utf8'));
const atomic=(path,value)=>{const temporary=path+'.tmp';writeFileSync(temporary,JSON.stringify(value),{mode:0o600});renameSync(temporary,path);};
let pool,connection,runtime,owner;
try{
 pool=new Pool({connectionString:config.databaseUrl,max:2,connectionTimeoutMillis:2000,statement_timeout:10000,application_name:'agentci-terminal-owned'});
 connection=await Connection.connect({address:config.temporalAddress,connectTimeout:'3 seconds'});
 let grpcCloseCalls=0;
 const closeGrpc=connection.client.close.bind(connection.client);
 connection.client.close=()=>{grpcCloseCalls++;closeGrpc();};
 // Only the owned high-level close is noncooperative; the real gRPC client close
 // remains callable by the production recovery owner.
 connection.close=()=>new Promise(()=>{});
 runtime=new CustomerRuntimeProcesses(config.runtimeRoot);
 const evaluator={state:()=>({phase:'not-started'}),close:async()=>{}};
 const journal=customerDiagnostics(()=>customerDiagnosticFacts(runtime,evaluator));
 owner=customerRecoveryOwner({pool,runtime,evaluator,connection:()=>connection,journal});
 mkdirSync(join(config.runtimeRoot,'dist/apps/worker'),{recursive:true});
 writeFileSync(join(config.runtimeRoot,'dist/apps/worker/main.js'),"process.on('SIGTERM',()=>{});setInterval(()=>{},1000);\n",{mode:0o600});
 const workerPid=await runtime.start('worker',{PATH:process.env.PATH,HOME:config.privateRoot});
 process.kill(workerPid,0);
 const sleep=pool.query('SELECT pg_sleep(8)');
 // Attach rejection handling before forced closure; no backend exception text is
 // printed or forwarded into retained evidence.
 void sleep.catch(()=>{});
 let queryActive=false,backendPid;
 for(let n=0;n<100;n++){
  const observed=await pool.query("SELECT pid,state,query FROM pg_stat_activity WHERE application_name='agentci-terminal-owned' AND state='active' AND query='SELECT pg_sleep(8)'");
  if(observed.rows[0]){backendPid=Number(observed.rows[0].pid);queryActive=true;break;}
  await new Promise(resolve=>setTimeout(resolve,10));
 }
 if(!queryActive)throw Error('Owned read-only query did not start');
 const secret=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});
 await withCustomerKey(secret,config.privateRoot,async keyPath=>{
  const close=customerCleanupPhases([
   ['assertionContainers',async()=>{
    atomic(config.startedPath,{workerPid,backendPid,keyPath,startedAt:Date.now(),queryActive:true,temporalConnected:true});
    await owner.diagnostic(async()=>{
     // Deliberately ignore cancellation. Process termination, not cooperation,
     // must prevent this callback from writing after the deadline race.
     await new Promise(resolve=>setTimeout(resolve,config.lateDelayMs));
     writeFileSync(config.latePath,'late callback must not execute',{mode:0o600});
    });
    return {ownedAssertionContainers:0};
   }],
   ['controllerProcesses',async()=>runtime.close('SIGKILL')],
   ['teardownReady',async()=>{writeFileSync(config.readyPath,'must not publish',{mode:0o600});return {ownedProcessesRemaining:0};}]
  ]);
  const session={close,quiesce:options=>owner.quiesce(options),forceQuiesce:()=>owner.force()};
  return withCustomerServiceLifetime(session,async()=>{throw Error('Synthetic scenario requires recovery');},async()=>{
   writeFileSync(config.zeroPath,'must not report successful close',{mode:0o600});
  },{attempts:1,timeoutMs:config.cleanupTimeoutMs,shutdownTimeoutMs:config.shutdownTimeoutMs,onUnquiesced:()=>terminateCustomerHarness(session,()=>{
   // Production hook requires synchronous persistence. Atomic replacement makes
   // an incomplete write distinguishable from retained unverified evidence.
   atomic(config.attemptPath,{schemaVersion:1,result:'unverified-persistence-attempt',grpcCloseCalled:grpcCloseCalls>0});
   if(config.persistFailure)throw Error('Synthetic terminal persistence failure');
   atomic(config.evidencePath,{schemaVersion:1,result:'recovery-required-unverified',ownedProcessesRemaining:'unverified',privateStateRetained:true,grpcCloseCalled:grpcCloseCalls>0,diagnostics:journal.snapshot()});
  })});
 });
 process.exitCode=2;
}catch{
 // No successful fallback on an unexpected fixture/setup failure.
 try{owner?.force();}catch{}
 try{connection?.client.close();}catch{}
 try{runtime?.forceStop();}catch{}
 process.exit(2);
}
