import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
// @ts-expect-error operational ESM observer
import {nativeStorageScanArgs,nativeStorageBaselineSha256,parseNativeStorageCounters,createNativeStorageRunner,runNativeScanWithStorage} from '../scripts/lib/eval-worker-native-storage.mjs';
// @ts-expect-error operational ESM pin/classifier
import {NATIVE_SCAN_IMAGE} from '../scripts/lib/eval-worker-native-evidence.mjs';

const owner='agentci-smoke-'+'1'.repeat(16),containerId='2'.repeat(64),imageId='sha256:'+'3'.repeat(64);
const expected={containerName:owner+'-worker-scan',owner,scannerImage:NATIVE_SCAN_IMAGE};
const args=()=>nativeStorageScanArgs({...expected,imageId});
const row=()=>Buffer.from('4096 262144 131072 131070 65536 32768\n');
const inspected=(change:Record<string,unknown>={})=>JSON.stringify({id:containerId,owner,image:NATIVE_SCAN_IMAGE,running:true,readOnly:true,tmpfs:{'/tmp':'rw,nosuid,nodev,size=1g'},binds:['/var/run/docker.sock:/var/run/docker.sock'],user:'',entrypoint:['trivy'],cmd:args().slice(12),privileged:false,capAdd:null,mounts:null,...change});
const flush=async()=>{for(let n=0;n<12;n++)await Promise.resolve();};
class Child extends EventEmitter{
 stdout=new PassThrough();stderr=new PassThrough();exitCode:number|null=null;signalCode:string|null=null;kills:string[]=[];closed=false;ignoreTerm=false;ignoreAll=false;
 close(status:number|null=0,signal:string|null=null){if(this.closed)return;this.closed=true;this.exitCode=status;this.signalCode=signal;this.stdout.end();this.stderr.end();this.emit('close',status,signal);}
 kill(signal:string){this.kills.push(signal);if(!this.ignoreAll&&!(this.ignoreTerm&&signal==='SIGTERM'))queueMicrotask(()=>this.close(null,signal));return true;}
}
type Call={command:string,args:string[],options:any,child:Child};
function transport(action:(call:Call)=>void){
 const calls:Call[]=[];
 const spawn=(command:string,argv:string[],options:any)=>{const child=new Child(),call={command,args:argv,options,child};calls.push(call);queueMicrotask(()=>action(call));return child;};
 return {calls,run:createNativeStorageRunner(spawn)};
}
function normalProbe(call:Call){if(call.args[0]==='inspect'){call.child.stdout.end(inspected());call.child.close();}else if(call.args[0]==='exec'){call.child.stdout.end(row());call.child.close();}}

test('statfs numeric decoder enforces exact six fields, safe products and block/inode conservation',()=>{
 const value=parseNativeStorageCounters(row());assert.equal(value.totalBytes,1073741824);assert.equal(value.usedBytes,536870912);assert.equal(value.freeBytes,value.availableBytes+value.reservedBytes);assert.equal(value.usedInodes+value.freeInodes,value.totalInodes);
 for(const bad of ['', '4096 1 1 1 1 1','4096 1 1 1 1 1\n\n','4096 1 1 1 1 1 extra\n','4096 -1 0 0 1 1\n','4096 1 2 1 1 1\n','4096 1 1 2 1 1\n','4096 1 1 1 1 2\n','0 1 1 1 1 1\n','4096 0 0 0 1 1\n','4096 1 1 1 0 0\n','9007199254740991 2 1 1 1 1\n','1 9007199254740992 0 0 1 1\n','4096\t1 1 1 1 1\n','4096 1 1 1 1 1\r\n'])assert.throws(()=>parseNativeStorageCounters(Buffer.from(bad)),/Invalid native scanner storage input/,bad);
 assert.throws(()=>parseNativeStorageCounters(Buffer.from([0xff])));assert.throws(()=>parseNativeStorageCounters('4096 1 1 1 1 1\n'));
});

test('scanner argv exactly preserves existing PID1, socket, tmpfs, cache, user and scanner pin',()=>{
 assert.deepEqual(args(),['run','--rm','--name',expected.containerName,'--label','agentci.image-smoke.owner='+owner,'--read-only','--tmpfs','/tmp:rw,nosuid,nodev,size=1g','-v','/var/run/docker.sock:/var/run/docker.sock',NATIVE_SCAN_IMAGE,'image','--cache-dir','/tmp/trivy-cache','--scanners','vuln','--format','json',imageId]);
 for(const change of [{owner:owner+'x'},{owner:null},{containerName:'foreign'},{scannerImage:'different'},{imageId:'foreign'}])assert.throws(()=>nativeStorageScanArgs({...expected,imageId,...change}));
 const f=transport(()=>assert.fail('must reject before child'));return assert.rejects(f.run([...args(),'--user','root'],expected),/Invalid native scanner storage input/);
});

test('real PATH-specific fake Docker captures byte buffers and default bounds without inheriting private environment',async()=>{
 const root=await mkdtemp(join(tmpdir(),'native-storage-transport-')),previous=process.env.PATH,privateValue=process.env.AGENTCI_STORAGE_TEST_PRIVATE;
 try{
  const log=join(root,'calls.jsonl');await writeFile(join(root,'docker'),`#!${process.execPath}\nimport fs from 'node:fs';const a=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(log)},JSON.stringify({args:a,envKeys:Object.keys(process.env)})+'\\n');if(a[0]==='run'){process.stdout.write(Buffer.from([255,0,65]));process.stderr.write(Buffer.from([254,0,66]));setTimeout(()=>process.exit(7),900);}else if(a[0]==='inspect'){console.log(${JSON.stringify(inspected())});}else{process.stdout.write(${JSON.stringify(row().toString())});}\n`,{mode:0o700});
  process.env.PATH=root;process.env.AGENTCI_STORAGE_TEST_PRIVATE='PRIVATE-CANARY';
  let failure:any;try{await runNativeScanWithStorage(args(),expected);assert.fail('Expected original exit7');}catch(error){failure=error;}
  assert.equal(failure.status,7);assert.equal(failure.code,7);assert.equal(failure.signal,null);assert.deepEqual(failure.stdout,Buffer.from([255,0,65]));assert.deepEqual(failure.stderr,Buffer.from([254,0,66]));assert.ok(failure.storage.paths.tmp.validSamples>0);assert.ok(failure.storage.paths.cache.validSamples>0);assert.equal(failure.storage.hostChildren.active,0);assert.equal(failure.storage.hostChildren.started,failure.storage.hostChildren.closed);assert.equal(failure.storage.hostChildren.cleanup,'complete');
  const calls=(await readFile(log,'utf8')).trim().split('\n').map(line=>JSON.parse(line));assert.deepEqual(calls.find(call=>call.args[0]==='run').args,args());for(const call of calls){assert.deepEqual(call.envKeys.filter((key:string)=>process.platform==='darwin'&&key==='__CF_USER_TEXT_ENCODING'?false:true),['PATH']);if(call.args[0]==='exec')assert.deepEqual(call.args.slice(0,-1),['exec',containerId,'/bin/busybox','stat','-f','-c','%s %b %f %a %c %d']);}
  const publicText=JSON.stringify(failure.storage);for(const privateText of ['PRIVATE-CANARY','https:','PATH','PRIVATE'])assert.ok(!publicText.includes(privateText));assert.equal(failure.storage.lifecycle.before,'unavailable-before-scanner-start');assert.equal(failure.storage.lifecycle.after,'unavailable-after-scanner-lifetime');assert.equal(failure.storage.baseline.result,'matched');assert.equal(failure.storage.baseline.sha256,nativeStorageBaselineSha256(args(),expected));assert.equal(failure.storage.baseline.sha256,createHash('sha256').update(JSON.stringify(failure.storage.baseline.observed)).digest('hex'));assert.equal(failure.storage.baseline.observed.owner,owner);assert.equal(failure.storage.baseline.observed.readOnly,true);
 }finally{process.env.PATH=previous;if(privateValue===undefined)delete process.env.AGENTCI_STORAGE_TEST_PRIVATE;else process.env.AGENTCI_STORAGE_TEST_PRIVATE=privateValue;await rm(root,{recursive:true,force:true});}
});

test('foreign, malformed and raced container identities never receive docker exec',async()=>{
 for(const change of [{owner:'foreign'},{image:'foreign'},{id:'foreign'},{running:'true'},{env:'PRIVATE-CANARY'}]){
  const f=transport(call=>{if(call.args[0]==='inspect'){call.child.stdout.end(inspected(change));call.child.close();}});const running=f.run(args(),expected);await flush();f.calls[0]!.child.close();const result=await running;assert.equal(f.calls.filter(call=>call.args[0]==='exec').length,0);assert.equal(result.storage.unavailableCounts['identity-mismatch'],1);assert.equal(result.storage.containerId,null);assert.ok(!JSON.stringify(result.storage).includes('PRIVATE-CANARY'));
 }
 const f=transport(call=>{if(call.args[0]==='inspect'){call.child.stdout.end('not-json PRIVATE-CANARY');call.child.close();}});const running=f.run(args(),expected);await flush();f.calls[0]!.child.close();assert.equal((await running).storage.unavailableCounts['invalid-inspect'],1);
});

test('missing paths and malformed counters are explicit unavailability without changing scanner success',async()=>{
 const f=transport(call=>{if(call.args[0]==='inspect')normalProbe(call);else if(call.args[0]==='exec'){call.child.stderr.end('PRIVATE-CANARY /tmp/not-public');if(call.args.at(-1)==='/tmp')call.child.stdout.end('wrong records\n');call.child.close(call.args.at(-1)==='/tmp'?0:1);}});
 const running=f.run(args(),expected);await flush();f.calls[0]!.child.close();const result=await running;assert.equal(result.status,0);assert.equal(result.storage.paths.tmp.validSamples,0);assert.equal(result.storage.paths.cache.validSamples,0);assert.equal(result.storage.unavailableCounts['invalid-counters'],1);assert.equal(result.storage.unavailableCounts['path-or-container-unavailable'],1);assert.ok(!JSON.stringify(result.storage).includes('PRIVATE-CANARY'));for(const call of f.calls){assert.equal(call.command,'docker');assert.deepEqual(Object.keys(call.options.env),['PATH']);assert.deepEqual(call.options.stdio,['ignore','pipe','pipe']);}
});

test('actual baseline changes and stopped containers fail closed before any filesystem probe',async()=>{
 for(const change of [{readOnly:false},{tmpfs:{'/tmp':'size=2g'}},{binds:[]},{user:'1001'},{entrypoint:['sh']},{cmd:['image','--help']},{privileged:true},{capAdd:['SYS_ADMIN']},{mounts:[{Type:'volume'}]}]){
  const f=transport(call=>{if(call.args[0]==='inspect'){call.child.stdout.end(inspected(change));call.child.close();}});const running=f.run(args(),expected);await flush();f.calls[0]!.child.close();const result=await running;assert.equal(result.storage.unavailableCounts['baseline-mismatch'],1);assert.equal(result.storage.baseline.result,'not-observed');assert.equal(f.calls.filter(call=>call.args[0]==='exec').length,0);
 }
 const stopped=transport(call=>{if(call.args[0]==='inspect'){call.child.stdout.end(inspected({running:false}));call.child.close();}});const running=stopped.run(args(),expected);await flush();stopped.calls[0]!.child.close();assert.equal((await running).storage.unavailableCounts['container-not-running'],1);
});

test('timeout and cancellation stop owned host children and preserve scanner buffers and classifier codes',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const f=transport(call=>{if(call.args[0]==='run'){call.child.stdout.write(Buffer.from([255]));call.child.stderr.write('PRIVATE-CANARY');}else normalProbe(call);});
 const running=f.run(args(),expected);const caught=running.catch((error:any)=>error);await flush();t.mock.timers.tick(180000);await flush();const failure=await caught;assert.equal(failure.code,'ETIMEDOUT');assert.equal(failure.status,null);assert.equal(failure.signal,'SIGTERM');assert.deepEqual(failure.stdout,Buffer.from([255]));assert.equal(failure.stderr.toString(),'PRIVATE-CANARY');assert.equal(failure.storage.lifecycle.termination,'timeout');assert.equal(failure.storage.hostChildren.active,0);assert.ok(f.calls[0]!.child.kills.includes('SIGTERM'));assert.ok(f.calls.every(call=>!['kill','rm'].includes(call.args[0]!)));
 const controller=new AbortController(),cancel=transport(call=>{if(call.args[0]==='run')call.child.stderr.write('cancel-bytes');});const cancelled=cancel.run(args(),{...expected,signal:controller.signal}).catch((error:any)=>error);await flush();controller.abort();await flush();const aborted=await cancelled;assert.equal(aborted.code,'ABORT_ERR');assert.equal(aborted.stderr.toString(),'cancel-bytes');assert.equal(aborted.storage.lifecycle.termination,'cancelled');assert.equal(aborted.storage.hostChildren.active,0);assert.ok(cancel.calls.every(call=>call.child.closed));
 const prior=new AbortController();prior.abort();const empty=transport(()=>assert.fail('pre-cancelled observer must not spawn'));const already=await empty.run(args(),{...expected,signal:prior.signal}).catch((error:any)=>error);assert.equal(already.code,'ABORT_ERR');assert.equal(empty.calls.length,0);
});

test('output bounds, all recognized signals and spawn errors preserve original execution failure instead of probe outcome',async()=>{
 for(const mode of ['overflow','SIGTERM','SIGBUS','SIGUSR1','spawn']){
  const f=transport(call=>{if(call.args[0]!=='run')return normalProbe(call);if(mode==='overflow'){call.child.stderr.write('retained-stderr');call.child.stdout.write(Buffer.alloc(8*1024*1024+1,65));}else if(mode.startsWith('SIG')){call.child.stdout.write('retained-stdout');call.child.close(null,mode);}else{call.child.emit('error',Object.assign(Error('PRIVATE-CANARY'),{code:'ENOENT'}));call.child.close(null,null);}});
  const failure:any=await f.run(args(),expected).catch((error:any)=>error);assert.ok(Buffer.isBuffer(failure.stdout));assert.ok(Buffer.isBuffer(failure.stderr));assert.equal(failure.storage.hostChildren.active,0);if(mode==='overflow'){assert.equal(failure.code,'ENOBUFS');assert.equal(failure.stdout.length,8*1024*1024);assert.equal(failure.stderr.toString(),'retained-stderr');assert.equal(failure.storage.lifecycle.termination,'output-limit');}else if(mode.startsWith('SIG')){assert.equal(failure.signal,mode);assert.equal(failure.status,null);assert.equal(failure.stdout.toString(),'retained-stdout');}else{assert.equal(failure.code,'ENOENT');assert.equal(failure.storage.lifecycle.termination,'spawn-failed');}assert.ok(!JSON.stringify(failure.storage).includes('PRIVATE-CANARY'));
 }
});

test('all samples and extrema witnesses are retained and probing stops at its hard bound',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let count=0;
 const f=transport(call=>{if(call.args[0]==='inspect')normalProbe(call);else if(call.args[0]==='exec'){count++;call.child.stdout.end(Buffer.from(`4096 100 ${count===5?1:90} 1 100 50\n`));call.child.close();}});const running=f.run(args(),expected);await flush();for(let n=0;n<40;n++){t.mock.timers.tick(500);await flush();}const afterBound=f.calls.length;assert.equal(count,64);t.mock.timers.tick(10000);await flush();assert.equal(f.calls.length,afterBound);f.calls[0]!.child.close();const result=await running;for(const path of Object.values(result.storage.paths) as any[]){assert.equal(path.samples.length,32);assert.equal(path.validSamples,32);assert.equal(path.samples[0].elapsedMs>=0,true);}assert.equal(result.storage.attempts.inspect,1);assert.equal(result.storage.attempts.stat,64);assert.equal(result.storage.boundsReached.stat,true);assert.equal(result.storage.unavailableCounts['stat-attempt-limit'],1);assert.equal(result.storage.paths.tmp.minimumFreeBytes,4096);assert.equal(result.storage.paths.tmp.maximumUsedBytes,99*4096);assert.ok(result.storage.paths.tmp.samples.some((sample:any)=>sample.freeBytes===4096));assert.equal(result.storage.hostChildren.active,0);
});

test('pre-start image-pull availability attempts do not consume the stat quota and exec stays bound to the first immutable ID',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let available=false;
 const f=transport(call=>{if(call.args[0]==='inspect'&&!available){call.child.stderr.write('PRIVATE-CANARY');call.child.close(1);}else normalProbe(call);});const running=f.run(args(),expected);await flush();for(let n=0;n<50;n++){t.mock.timers.tick(500);await flush();}assert.equal(f.calls.filter(call=>call.args[0]==='exec').length,0);available=true;t.mock.timers.tick(500);await flush();f.calls[0]!.child.close();const result=await running;assert.equal(result.storage.attempts.inspect,52);assert.equal(result.storage.attempts.stat,2);assert.equal(result.storage.paths.tmp.validSamples,1);for(const call of f.calls.filter(call=>call.args[0]==='exec'))assert.equal(call.args[1],containerId);assert.ok(!JSON.stringify(result.storage).includes('PRIVATE-CANARY'));
});

test('probe timeout and scanner completion await TERM/KILL closure and never certify unclosed host children',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const f=transport(call=>{if(call.args[0]==='inspect')normalProbe(call);else if(call.args[0]==='exec')call.child.ignoreTerm=true;});const running=f.run(args(),expected);await flush();const probe=f.calls.find(call=>call.args[0]==='exec')!;t.mock.timers.tick(500);await flush();assert.deepEqual(probe.child.kills,['SIGTERM']);t.mock.timers.tick(100);await flush();assert.deepEqual(probe.child.kills,['SIGTERM','SIGKILL']);f.calls[0]!.child.close();await flush();t.mock.timers.tick(100);await flush();const result=await running;assert.equal(result.storage.unavailableCounts['probe-timeout'],1);assert.equal(result.storage.hostChildren.active,0);assert.ok(f.calls.every(call=>call.child.closed));
 const stubborn=transport(call=>{if(call.args[0]==='inspect')normalProbe(call);else if(call.args[0]==='exec')call.child.ignoreAll=true;});const failed=stubborn.run(args(),expected).catch((error:any)=>error);await flush();stubborn.calls[0]!.child.close();await flush();t.mock.timers.tick(500);await flush();const unknown=await failed;assert.equal(unknown.code,'OBSERVER_CLEANUP_UNVERIFIED');assert.equal(unknown.storage.hostChildren.cleanup,'unverified');assert.equal(unknown.storage.hostChildren.active,1);for(const call of stubborn.calls)call.child.close();
});

test('availability polling has its own hard child bound within the original 180 second scanner timeout',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=transport(call=>{if(call.args[0]==='inspect')call.child.close(1);});const failed=f.run(args(),expected).catch((error:any)=>error);await flush();for(let n=0;n<360;n++){t.mock.timers.tick(500);await flush();}const result=await failed;assert.equal(result.code,'ETIMEDOUT');assert.equal(result.storage.attempts.inspect,360);assert.equal(result.storage.attempts.stat,0);assert.equal(result.storage.boundsReached.inspect,true);assert.equal(result.storage.hostChildren.started,361);assert.equal(result.storage.hostChildren.closed,361);assert.equal(result.storage.unavailable.length,32);assert.equal(result.storage.hostChildren.active,0);
});
