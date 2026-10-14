import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,access,lstat} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
import {spawn,type ChildProcess} from 'node:child_process';
import {Pool} from 'pg';
import {Connection} from '@temporalio/client';
// @ts-ignore Shared operational ESM fixture manager.
import {startCustomerDatabase,stopCustomerDatabase,customerDatabaseUrl,databaseCommand} from '../../scripts/lib/customer-ci-database.mjs';

const temporalImage='temporalio/temporal:latest@sha256:ad4c82c97bd12b417d1ea942610dbcd511afb250c4d5ed26c694009533df447e';
const noProxy='127.0.0.1,localhost,0.0.0.0';
const alive=(pid:number)=>{try{process.kill(pid,0);return true;}catch(error){if((error as NodeJS.ErrnoException).code==='ESRCH')return false;throw error;}};
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function poll<T>(read:()=>Promise<T|undefined>,timeoutMs=10000):Promise<T>{
 const deadline=Date.now()+timeoutMs;
 while(Date.now()<deadline){const value=await read();if(value!==undefined)return value;await pause(20);}
 throw Error('Owned fixture observation deadline exceeded');
}
async function stopChild(child:ChildProcess|undefined){
 if(!child||child.exitCode!==null||child.signalCode!==null)return;
 child.kill('SIGKILL');await new Promise<void>(resolve=>child.once('close',()=>resolve()));
}

for(const persistFailure of [false,true])test('actual lifetime wrapper terminates unquiesced harness without late actions or recovery deletion'+(persistFailure?' even when terminal persistence throws':''),{timeout:60000},async()=>{
 const root=await mkdtemp(join(tmpdir(),'agentci-terminal-lifetime-'));
 const runId=String(Date.now()),nonce=randomUUID().replaceAll('-','').slice(0,16),source='df2f4bc5466f1846f8f91053cc813fac7dce26e6';
 const name=`agentci-terminal-temporal-${runId}-${nonce}`,label=`agentci.test.terminal-owner=${nonce}`;
 let databasePath:string|undefined,temporalCreated=false,foreign:ChildProcess|undefined,harness:ChildProcess|undefined,pool:Pool|undefined,workerPid:number|undefined;
 let outputBytes=0;const outputDigest=createHash('sha256');
 let watchdog:ReturnType<typeof setTimeout>|undefined,watchdogExpired=false;
 try{
  await startCustomerDatabase({base:root,runId,attempt:'1',source,mask:()=>{},onState:(path:string)=>{databasePath=path;}});
  assert.ok(databasePath);
  const databaseUrl=await customerDatabaseUrl(databasePath);
  pool=new Pool({connectionString:databaseUrl,connectionTimeoutMillis:2000,statement_timeout:2000});
  await pool.query('CREATE TABLE customer_terminal_retained_fixture (id integer PRIMARY KEY)');
  await pool.query('INSERT INTO customer_terminal_retained_fixture(id) VALUES(1)');
  databaseCommand(['run','--detach','--name',name,'--label',label,'--publish','127.0.0.1::7233','--memory','1024m','--cpus','1',temporalImage,'server','start-dev','--ip','0.0.0.0','--headless']);temporalCreated=true;
  const ports=JSON.parse(databaseCommand(['inspect','--format','{{json .NetworkSettings.Ports}}',name]));
  assert.equal(ports['7233/tcp'][0].HostIp,'127.0.0.1');
  const temporalAddress='127.0.0.1:'+ports['7233/tcp'][0].HostPort;
  await poll(async()=>{let connection:Connection|undefined;try{connection=await Connection.connect({address:temporalAddress,connectTimeout:'1 second'});return true;}catch{return undefined;}finally{await connection?.close();}});
  foreign=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{env:{PATH:process.env.PATH,NO_PROXY:noProxy,no_proxy:noProxy},stdio:'ignore'});
  assert.ok(foreign.pid);assert.ok(alive(foreign.pid));
  const privateRoot=join(root,'private'),runtimeRoot=join(root,'runtime');await mkdir(privateRoot,{mode:0o700});await mkdir(runtimeRoot,{mode:0o700});
  const paths={startedPath:join(privateRoot,'started.json'),evidencePath:join(privateRoot,'terminal.json'),attemptPath:join(privateRoot,'persist-attempt.json'),latePath:join(privateRoot,'late.txt'),readyPath:join(privateRoot,'teardown-ready.json'),zeroPath:join(privateRoot,'closed-zero.json')};
  const config={databaseUrl,temporalAddress,privateRoot,runtimeRoot,...paths,persistFailure,cleanupTimeoutMs:150,shutdownTimeoutMs:250,lateDelayMs:4000};
  const configPath=join(privateRoot,'fixture.json');await writeFile(configPath,JSON.stringify(config),{mode:0o600});
  harness=spawn(process.execPath,[join(process.cwd(),'tests/helpers/customer-terminal-lifetime-child.mjs'),configPath],{cwd:process.cwd(),env:{PATH:process.env.PATH,NO_PROXY:noProxy,no_proxy:noProxy},stdio:['ignore','pipe','pipe']});
  watchdog=setTimeout(()=>{watchdogExpired=true;harness?.kill('SIGKILL');},8000);
  for(const stream of [harness.stdout,harness.stderr])stream?.on('data',(bytes:Buffer)=>{outputBytes+=bytes.length;outputDigest.update(bytes);});
  const exited=new Promise<{code:number|null;signal:NodeJS.Signals|null}>(resolve=>harness!.once('close',(code,signal)=>{clearTimeout(watchdog);resolve({code,signal});}));
  const started=await poll(async()=>{try{return JSON.parse(await readFile(paths.startedPath,'utf8')) as {workerPid:number;backendPid:number;keyPath:string;startedAt:number;queryActive:boolean;temporalConnected:boolean};}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;if(watchdogExpired||harness!.exitCode!==null||harness!.signalCode!==null)throw Error('Harness exited before its lifetime wrapper');return undefined;}},8000);
  workerPid=started.workerPid;assert.equal(started.queryActive,true);assert.equal(started.temporalConnected,true);
  let exitTimer:ReturnType<typeof setTimeout>|undefined;
  const exit=await Promise.race([exited,new Promise<never>((_,reject)=>{exitTimer=setTimeout(()=>reject(Error('Lifetime wrapper did not exit within bounded deadline')),2500);})]).finally(()=>clearTimeout(exitTimer));
  assert.equal(watchdogExpired,false);assert.equal(exit.code,1);assert.equal(exit.signal,null);const elapsed=Date.now()-started.startedAt;assert.ok(elapsed<2500,'Configured cleanup plus shutdown must bound actual harness lifetime');
  await poll(async()=>alive(started.workerPid)?undefined:true,1500);
  assert.ok(alive(foreign.pid),'Unregistered external sentinel must remain alive');
  const persistAttempt=JSON.parse(await readFile(paths.attemptPath,'utf8'));assert.equal(persistAttempt.result,'unverified-persistence-attempt');assert.equal(persistAttempt.grpcCloseCalled,true);
  if(persistFailure)await assert.rejects(access(paths.evidencePath),(error:NodeJS.ErrnoException)=>error.code==='ENOENT');
  else{const terminal=JSON.parse(await readFile(paths.evidencePath,'utf8'));
   assert.equal(terminal.result,'recovery-required-unverified');assert.equal(terminal.ownedProcessesRemaining,'unverified');assert.equal(terminal.grpcCloseCalled,true);
   assert.ok(!terminal.diagnostics.events.some((event:{outcome:string})=>event.outcome==='passed'),'Terminal journal cannot certify successful cleanup');}
  assert.equal((await lstat(started.keyPath)).mode&0o777,0o600);assert.equal((await lstat(dirname(started.keyPath))).mode&0o777,0o700);
  await access(databasePath);assert.ok(databaseCommand(['ps','--quiet','--filter','name=^/'+JSON.parse(await readFile(databasePath,'utf8')).name+'$']));
  assert.equal(Number((await pool.query('SELECT count(*) AS count FROM customer_terminal_retained_fixture')).rows[0].count),1,'Real database state remains usable until parent cleanup');
  await pause(Math.max(0,started.startedAt+config.lateDelayMs+250-Date.now()));
  for(const path of [paths.latePath,paths.readyPath,paths.zeroPath,paths.evidencePath+'.tmp',dirname(databasePath)+'.teardown.json'])await assert.rejects(access(path),(error:NodeJS.ErrnoException)=>error.code==='ENOENT');
  await access(started.keyPath);await access(databasePath);assert.ok(alive(foreign.pid));assert.equal(alive(started.workerPid),false);
  // Output is never retained as text; this fixture does not claim server-side
  // cancellation of the already running read-only pg_sleep statement.
  assert.ok(outputBytes<65536,'Fixture child output stays bounded');
  console.log(JSON.stringify({fixture:'actual-terminal-lifetime',persistFailure,cleanupTimeoutMs:150,shutdownTimeoutMs:250,elapsedMs:elapsed,exitCode:exit.code,watchdogExpired,ownedWorkerDead:!alive(started.workerPid),foreignSentinelAlive:alive(foreign.pid),privateKeyRetained:true,databaseRetained:true,noLateActions:true,terminalResult:persistFailure?'persistence-threw':'recovery-required-unverified',childOutputBytes:outputBytes,childOutputSha256:outputDigest.digest('hex')}));
 }finally{
  clearTimeout(watchdog);
  await stopChild(harness);if(workerPid&&alive(workerPid))process.kill(workerPid,'SIGKILL');await stopChild(foreign);await pool?.end();
  if(temporalCreated){const facts=JSON.parse(databaseCommand(['inspect','--format','{"name":{{json .Name}},"image":{{json .Config.Image}},"labels":{{json .Config.Labels}}}',name]));assert.equal(facts.name,'/'+name);assert.equal(facts.image,temporalImage);assert.equal(facts.labels['agentci.test.terminal-owner'],nonce);databaseCommand(['rm','--force','--volumes',name]);}
  if(databasePath)await stopCustomerDatabase(databasePath);await rm(root,{recursive:true,force:true});
 }
});
