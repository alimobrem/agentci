import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {dashboardShutdownMarkers,validateDashboardShutdown} from './dashboard-shutdown.mjs';
export const PUBLIC_LOGIN_FAILURE_SHA256=createHash('sha256').update('Sign-in unavailable').digest('hex');
const hash=b=>createHash('sha256').update(b).digest('hex');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
/** Fixture runs as an additional UID1001 exec process, never as PID1, a loader, or application code. No TLS certificate is presented or accepted. */
export const nativeDrainFixture=String.raw`
import net from 'node:net';import http from 'node:http';import fs from 'node:fs';import crypto from 'node:crypto';
let socket,hello=false,requestStarted=false,complete=false,bytes=0,helloBytes=0,helloPrefix=Buffer.alloc(0);const sockets=new Set();
const issuer=net.createServer(s=>{if(sockets.size>=2){s.destroy();return;}sockets.add(s);s.once('close',()=>sockets.delete(s));s.on('error',()=>{});s.on('data',b=>{helloBytes+=b.length;if(helloBytes>65536){s.destroy();return;}helloPrefix=Buffer.concat([helloPrefix,b]).subarray(0,6);if(helloPrefix.length===6){if(helloPrefix[0]!==22||helloPrefix[1]!==3||helloPrefix[5]!==1){s.destroy();return;}hello=true;socket=s;}});});
issuer.listen(4443,'127.0.0.1');
const control=http.createServer((req,res)=>{res.setHeader('content-type','application/json');if(req.url==='/start'&&!requestStarted){requestStarted=true;const request=http.request({host:'127.0.0.1',port:3000,path:'/auth/login',method:'POST',headers:{origin:'https://dashboard.fixture.invalid','content-length':'0'}},response=>{const chunks=[];response.on('data',b=>{bytes+=b.length;if(bytes>4096){response.destroy();return;}chunks.push(b);});response.once('end',()=>{complete=true;const body=Buffer.concat(chunks);fs.writeSync(1,JSON.stringify({complete:true,status:response.statusCode,bytes:body.length,sha256:crypto.createHash('sha256').update(body).digest('hex'),privateCacheHeaders:/private|no-store/.test(response.headers['cache-control']??''),cookieIssued:!!response.headers['set-cookie'],tlsCertificateAccepted:false})+'\n');});});request.on('error',()=>{});request.end();}else if(req.url==='/release'){socket?.destroy();}res.end(JSON.stringify({hello,helloBytes,tlsBytesSent:0,requestStarted,requestPending:requestStarted&&!complete,socketPending:!!socket&&!socket.destroyed}));});control.listen(4444,'127.0.0.1');
`;
/** Behavioral oracle is independent of configuration rejection: exit143 alone and partial responses cannot pass. */
export function nativePublicBehaviorQualified(record){
 const r=record?.response,m=record?.logs?.markers;return record?.exitCode===143&&record.running===false&&record.oomKilled===false&&r?.complete===true&&r.status===403&&r.bytes===19&&r.sha256===PUBLIC_LOGIN_FAILURE_SHA256&&r.privateCacheHeaders===true&&r.cookieIssued===false&&r.tlsCertificateAccepted===false&&Array.isArray(m)&&m.length===2&&m[0].type==='started'&&m[1].type==='finished'&&m[1].line>m[0].line&&record.logs.cleanupErrors===false&&record.logs.canaryLeak===false;
}
export function validateNativePublicDrain(record,expected){
 const fail=()=>{throw Error('Native public login error-path drain not established');};
 // Reuse every source/runtime/signal/marker bound from the existing idle oracle, without changing that oracle's public claim.
 validateDashboardShutdown({...record,mode:'configured',requestDrain:'idle-only'},expected);
 if(record.mode!=='public-login-error-path'||record.requestDrain!=='native-active-public-error-path'||record.authenticatedApiDrain!=='unverified'||record.nativeAbrupt143Control!=='unsupported-configuration-rejected'||record.tlsTrustChanged!==false||record.certificateAccepted!==false||record.signalBeforeRelease!==true||!Number.isSafeInteger(record.heldAfterSignalMs)||record.heldAfterSignalMs<250||record.heldAfterSignalMs>5000)fail();
 for(const state of [record.beforeSignal,record.beforeRelease])if(state?.hello!==true||state.requestStarted!==true||state.requestPending!==true||state.socketPending!==true||state.tlsBytesSent!==0||!Number.isSafeInteger(state.helloBytes)||state.helloBytes<6||state.helloBytes>65536)fail();
 if(!nativePublicBehaviorQualified(record))fail();
 if(record.whileHeld?.running!==true||record.whileHeld.cleanupStarted!==true||record.whileHeld.cleanupFinished!==false)fail();
 if(record.fixture?.sourceSha256!==hash(nativeDrainFixture)||!(/^[a-f0-9]{64}$/).test(record.fixture.stderrSha256))fail();
 const n=record.forcedControl;if(n?.signal!=='SIGKILL'||n.exitCode!==137||n.running!==false||n.oomKilled!==false||n.response?.complete!==false||n.logs?.markers?.length!==0||n.beforeSignal?.hello!==true||n.beforeSignal.requestPending!==true||n.beforeSignal.socketPending!==true||n.beforeSignal.tlsBytesSent!==0||n.gracefulOracleAccepted!==false)fail();
 if(JSON.stringify(n.runtime)!==JSON.stringify(record.runtime))fail();
 const a=record.abrupt143Control;if(a?.signal!=='SIGTERM'||a.exitCode!==143||a.running!==false||a.oomKilled!==false||a.response?.complete!==false||a.logs?.markers?.length!==0||a.beforeSignal?.hello!==true||a.beforeSignal.requestPending!==true||a.beforeSignal.socketPending!==true||a.beforeSignal.tlsBytesSent!==0||a.runtime?.manualSignalOverride!==true||a.configuration!=='unsupported-manual-signal-configuration'||a.gracefulOracleAccepted!==false)fail();
 if(JSON.stringify({...a.runtime,manualSignalOverride:false})!==JSON.stringify(record.runtime))fail();
 for(const control of[n,a]){if(control.fixture?.sourceSha256!==hash(nativeDrainFixture)||!(/^[a-f0-9]{64}$/).test(control.fixture.stderrSha256))fail();}
 for(const control of[n,a])for(const key of ['sourceCommit','sourceTree','candidateCommit','rootLockSha256','dashboardLockSha256','arch','imageId'])if(control.source?.[key]!==expected[key])fail();
 return {result:'source-bound-native-active-public-error-path-drain-qualified',authenticatedApiDrain:'unverified',nativeAbrupt143Control:'unsupported-configuration-rejected',liveOIDC:'unverified'};
}
export function parseNativeFixtureResponse(stdout){
 if(typeof stdout!=='string'||Buffer.byteLength(stdout)>8192)throw Error('Native fixture output bound');
 if(!stdout.trim())return {complete:false};const lines=stdout.trim().split('\n');if(lines.length!==1)throw Error('Native fixture output bound');return JSON.parse(lines[0]);
}
/** Uses only owned, already validated network-none containers. Raw fixture output and diagnostics are never artifacts. */
export async function runNativePublicDrain({name,engine,probeRuntime,source,sentinel}){
 if(!/^agentci-smoke-[a-f0-9]{16}-(?:drain|forced|abrupt143)$/.test(name))throw Error('Owned native drain name required');
 let stdout='',stderr='',closed=false,fixtureFailed=false;

 const fixture=spawn('docker',['exec',name,'node','--input-type=module','-e',nativeDrainFixture],{env:{PATH:process.env.PATH},stdio:['ignore','pipe','pipe']});
 fixture.once('error',()=>{fixtureFailed=true;});
 fixture.stdout.on('data',b=>{if(stdout.length+b.length>8192){fixtureFailed=true;fixture.kill('SIGTERM');}else stdout+=b;});fixture.stderr.on('data',b=>{if(stderr.length+b.length>8192){fixtureFailed=true;fixture.kill('SIGTERM');}else stderr+=b;});const fixtureStopped=new Promise(r=>fixture.once('close',()=>{closed=true;r();}));
 const state=action=>JSON.parse(engine(['exec',name,'node','-e',`fetch('http://127.0.0.1:4444/${action}',{signal:AbortSignal.timeout(1500)}).then(r=>r.text()).then(t=>process.stdout.write(t)).catch(()=>process.exit(1))`]));
 let stop,stopClosed=false,stopError=false;
 try{
  for(let i=0;i<50;i++){try{state('');break;}catch{if(i===49)throw Error('Native issuer fixture unavailable');await wait(50);}}
  state('start');let beforeSignal;
  for(let i=0;i<100;i++){beforeSignal=state('');if(beforeSignal.hello&&beforeSignal.requestPending&&beforeSignal.socketPending)break;if(i===99)throw Error('Native request did not reach held TLS ClientHello');await wait(25);}
  const runtime=probeRuntime(),forced=name.endsWith('-forced'),abrupt=name.endsWith('-abrupt143'),began=performance.now();
  if(forced||abrupt){engine(['kill','--signal',forced?'SIGKILL':'SIGTERM',name]);await Promise.race([fixtureStopped,wait(3000)]);if(fixtureFailed)throw Error('Native fixture failed or output exceeded bound');const stopped=JSON.parse(engine(['inspect','--format','{"exitCode":{{json .State.ExitCode}},"oomKilled":{{json .State.OOMKilled}},"running":{{json .State.Running}}}',name]));return {source,signal:forced?'SIGKILL':'SIGTERM',...stopped,beforeSignal,response:parseNativeFixtureResponse(stdout),logs:dashboardShutdownMarkers(engine(['logs',name],{separateStreams:true}),sentinel),runtime,...(abrupt?{configuration:'unsupported-manual-signal-configuration'}:{}),gracefulOracleAccepted:nativePublicBehaviorQualified({...stopped,response:parseNativeFixtureResponse(stdout),logs:dashboardShutdownMarkers(engine(['logs',name],{separateStreams:true}),sentinel)}),fixture:{sourceSha256:hash(nativeDrainFixture),stderrSha256:hash(stderr)}};}
  stop=spawn('docker',['stop','--signal','SIGTERM','--timeout','20',name],{env:{PATH:process.env.PATH},stdio:'ignore'});stop.once('error',()=>{stopError=true;stopClosed=true;});const stoppedPromise=new Promise(r=>stop.once('close',code=>{stopError=code!==0;stopClosed=true;r();}));
  let heldLogs;
  for(let i=0;i<100;i++){heldLogs=dashboardShutdownMarkers(engine(['logs',name],{separateStreams:true}),sentinel);if(heldLogs.markers.some(m=>m.type==='started'))break;if(i===99)throw Error('Native cleanup did not start while held');await wait(10);}
  const heldAt=performance.now();await wait(300);const beforeRelease=state(''),running=JSON.parse(engine(['inspect','--format','{{json .State.Running}}',name])),heldAfterSignalMs=Math.ceil(performance.now()-heldAt);heldLogs=dashboardShutdownMarkers(engine(['logs',name],{separateStreams:true}),sentinel);const whileHeld={running,cleanupStarted:heldLogs.markers.some(m=>m.type==='started'),cleanupFinished:heldLogs.markers.some(m=>m.type==='finished')};
  if(!running||stopClosed||!beforeRelease.requestPending||!beforeRelease.socketPending||whileHeld.cleanupFinished)throw Error('Native request or cleanup terminated before release');
  state('release');await Promise.race([stoppedPromise,wait(23000)]);if(!stopClosed){stop.kill('SIGTERM');throw Error('Native termination deadline');}await Promise.race([fixtureStopped,wait(3000)]);
  if(fixtureFailed)throw Error('Native fixture failed or output exceeded bound');const stopped=JSON.parse(engine(['inspect','--format','{"exitCode":{{json .State.ExitCode}},"oomKilled":{{json .State.OOMKilled}},"running":{{json .State.Running}}}',name])),logs=dashboardShutdownMarkers(engine(['logs',name],{separateStreams:true}),sentinel);const response=parseNativeFixtureResponse(stdout);
  return {mode:'public-login-error-path',source,runtime,signal:'SIGTERM',stopSucceeded:!stopError,timeout:false,forced:stopped.exitCode===137,...stopped,elapsedMs:Math.ceil(performance.now()-began),requestDrain:'native-active-public-error-path',beforeSignal,beforeRelease,whileHeld,signalBeforeRelease:true,heldAfterSignalMs,response,logs,authenticatedApiDrain:'unverified',nativeAbrupt143Control:'unsupported-configuration-rejected',tlsTrustChanged:false,certificateAccepted:false,fixture:{sourceSha256:hash(nativeDrainFixture),stderrSha256:hash(stderr),clientPlacement:'additional UID1001 exec process in owned network-none container',issuerPlacement:'synthetic loopback TCP; no TLS reply or certificate'}};
 }finally{if(stop&&!stopClosed){stop.kill('SIGTERM');}if(!closed){fixture.kill('SIGTERM');await Promise.race([fixtureStopped,wait(1000)]);}}
}
