import {createHash} from 'node:crypto';
export const NEXT_SHUTDOWN=Object.freeze({version:'16.4.0',handlerSha256:'af5fd02bb07111f4794f7c7123e7388953bdfb85e131024c85dbc9abbab82d6c',signal:'SIGTERM',exitCode:143,maxElapsedMs:20000});
const hash=b=>createHash('sha256').update(b).digest('hex');
/** Preserve only ordered marker types and channel hashes; raw diagnostics never become artifacts. */
export function dashboardShutdownMarkers({stdout,stderr},canary){
 const lines=stderr.replace(/\x1b\[[0-9;]*m/g,'').split(/\r?\n/),markers=[];
 for(let i=0;i<lines.length;i++){
  if(lines[i].includes('next:start-server')&&lines[i].includes('start-server process cleanup finished'))markers.push({type:'finished',stream:'stderr',line:i});
  else if(lines[i].includes('next:start-server')&&lines[i].includes('start-server process cleanup'))markers.push({type:'started',stream:'stderr',line:i});
 }
 const start=markers.find(m=>m.type==='started')?.line,end=markers.find(m=>m.type==='finished')?.line;
 const unexpectedDuringCleanup=start!==undefined&&end!==undefined&&end>start&&lines.slice(start+1,end).some(line=>line.trim());
 return {markers,stdoutSha256:hash(stdout),stderrSha256:hash(stderr),cleanupErrors:!!unexpectedDuringCleanup||/\b(?:Error|ERR_[A-Z_]+|uncaught|unhandled|exception)\b/i.test(stdout+'\n'+stderr),canaryLeak:!!canary&&(stdout.includes(canary)||stderr.includes(canary))};
}
export function validateDashboardShutdown(record,expected){
 const fail=()=>{throw Error('Source-bound dashboard SIGTERM shutdown not established');};
 if(!record||!expected||!['unconfigured','configured','malformed'].includes(record.mode))fail();
 if(!['sourceCommit','sourceTree','candidateCommit'].every(k=>typeof expected[k]==='string'&&/^[a-f0-9]{40}$/.test(expected[k]))||!['rootLockSha256','dashboardLockSha256'].every(k=>typeof expected[k]==='string'&&/^[a-f0-9]{64}$/.test(expected[k]))||!/^sha256:[a-f0-9]{64}$/.test(expected.imageId)||!['amd64','arm64'].includes(expected.arch))fail();
 for(const key of ['sourceCommit','sourceTree','candidateCommit','rootLockSha256','dashboardLockSha256','arch','imageId'])if(record.source?.[key]!==expected[key])fail();
 const p=record.runtime;
 if(p?.nextVersion!==NEXT_SHUTDOWN.version||p.handlerSha256!==NEXT_SHUTDOWN.handlerSha256||!p.handlerPath?.startsWith('apps/dashboard/node_modules/next/')||p.node!=='v26.10.0'||p.pid1Uid!==1001||JSON.stringify(p.pid1Command)!==JSON.stringify(['next-server (v16.4.0)'])||p.pid1Executable!=='/usr/local/bin/node'||!(/^[a-f0-9]{64}$/).test(p.pid1ExecutableSha256)||p.pid1ExecutableSha256!==p.probeNodeExecutableSha256||p.manualSignalOverride!==false||p.nodeOptionsOverride!==false||p.nodePathOverride!==false)fail();
 if(record.signal!==NEXT_SHUTDOWN.signal||record.stopSucceeded!==true||record.timeout!==false||record.forced!==false||record.exitCode!==NEXT_SHUTDOWN.exitCode||record.running!==false||record.oomKilled!==false||!Number.isSafeInteger(record.elapsedMs)||record.elapsedMs<0||record.elapsedMs>NEXT_SHUTDOWN.maxElapsedMs||record.requestDrain!=='idle-only')fail();
 const logs=record.logs,m=logs?.markers;
 if(!Array.isArray(m)||m.length!==2||m[0].type!=='started'||m[1].type!=='finished'||m.some(v=>v.stream!=='stderr'||!Number.isSafeInteger(v.line)||v.line<0)||m[1].line<=m[0].line||logs.cleanupErrors!==false||logs.canaryLeak!==false||![logs.stdoutSha256,logs.stderrSha256].every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)))fail();
 return {result:'source-bound-idle-sigterm-qualified',activeRequestDrain:'not-exercised'};
}
/** Separate fixture qualification. This cannot certify active drainage in a native container. */
export function dashboardShutdownRuntimeVerified(report,expected){
 try{
  if(report?.result!=='production-framework-synthetic-active-request-drain-qualified'||report.nextVersion!==NEXT_SHUTDOWN.version||report.handlerSha256!==NEXT_SHUTDOWN.handlerSha256||report.privateFilesRemoved!==true||report.nativeActiveRequestDrain!=='unverified')return false;
  for(const k of ['sourceCommit','sourceTree','runId','runAttempt','rootLockSha256','dashboardLockSha256'])if(report[k]!==expected[k])return false;
  if(![report.rootLockSha256,report.dashboardLockSha256].every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v))||!Array.isArray(report.results)||report.results.length!==3)return false;
  const [positive,forced,abrupt]=report.results;
  if(positive.mode!=='graceful'||positive.signal!=='SIGTERM'||positive.exit?.code!==143||positive.exit.signal!==null||positive.heldBeforeRelease!==true||positive.response?.complete!==true||positive.response.status!==200||!Number.isSafeInteger(positive.response.bytes)||positive.response.bytes<1||positive.response.bytes>8*1024*1024||!(/^[a-f0-9]{64}$/).test(positive.response.sha256)||positive.logs.cleanupErrors!==false||positive.logs.canaryLeak!==false||JSON.stringify(positive.logs.markers.map(m=>m.type))!==JSON.stringify(['started','finished'])||positive.logs.markers.some(m=>m.stream!=='stderr'||!Number.isSafeInteger(m.line)||m.line<0)||positive.logs.markers[1].line<=positive.logs.markers[0].line||!Number.isSafeInteger(positive.elapsedMs)||positive.elapsedMs<250||positive.elapsedMs>NEXT_SHUTDOWN.maxElapsedMs)return false;
  if(forced.mode!=='forced'||forced.signal!=='SIGKILL'||forced.exit?.signal!=='SIGKILL'||forced.response?.complete!==false||forced.logs.markers.length!==0)return false;
  if(abrupt.mode!=='abrupt143'||abrupt.signal!=='SIGTERM'||abrupt.exit?.code!==143||abrupt.exit.signal!==null||abrupt.response?.complete!==false||abrupt.logs.markers.length!==0)return false;
  return true;
 }catch{return false;}
}
