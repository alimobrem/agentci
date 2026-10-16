import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {createNativeAuthenticatedCertificates,AUTH_TRUST_CASES,AUTH_CA_DESTINATION} from './dashboard-native-auth-certificates.mjs';
import {AUTH_HELPER_SOURCE,AUTH_ORIGIN,AUTH_ISSUER,AUTH_BACKEND} from './dashboard-native-auth-helper.mjs';
import {AUTHENTICATED_STAGE,projectAuthenticatedHelperState,authenticatedFailureObservation,authenticatedFailureSignalObservation,validateAuthenticatedCharacterizationObservation,validateNativeAuthenticatedCharacterization,nativeAuthenticatedGracefulBehaviorQualified,validateNativeAuthenticatedEvidence} from './dashboard-native-authenticated-evidence.mjs';
import {validateDashboardContainer,validateDashboardAuthenticatedContainer,validateDashboardAuthenticatedAbruptContainer,validateDashboardAuthenticatedTlsFailureContainer,validateDashboardAuthenticatedHelper} from './dashboard-native-evidence.mjs';
import {ABRUPT143_COMMAND} from './dashboard-native-drain.mjs';
import {dashboardAuthenticatedTrustProbe,dashboardShutdownSourceProbe} from './dashboard-native-probes.mjs';
import {dashboardShutdownMarkers,validateDashboardShutdown} from './dashboard-shutdown.mjs';
import {nativeAuthenticatedFixtureData,nativeAuthenticatedExpectedResponse} from './dashboard-native-authenticated-fixture.mjs';
export {nativeAuthenticatedFixtureData} from './dashboard-native-authenticated-fixture.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const failure=()=>Error('Native authenticated characterization failed; private diagnostics withheld');
const progressBytes=value=>Buffer.byteLength(JSON.stringify(value,null,2)+'\n');
/** Diagnostic payloads cannot consume the budget needed to publish already completed characterization. */
export function appendAuthenticatedProgress(receipt,checkpoint){
 if(receipt.checkpoints.length>=128)throw failure();
 const next=structuredClone(checkpoint),candidate={...receipt,checkpoints:[...receipt.checkpoints,next]};
 if(progressBytes(candidate)>128*1024&&next.signalSnapshot){delete next.signalSnapshot;next.signalSnapshotOmitted='progress-byte-bound';}
 if(progressBytes(candidate)>128*1024)throw failure();return candidate;
}

/** Failure checkpoints select facts even when an incomplete observer cannot pass the final schema. */
export function authenticatedCheckpointFacts(state){
 const facts={},auth=state?.authentication,issuer=state?.peers?.issuer;
 for(const [key,value] of [['authenticationComplete',auth?.complete],['authenticated',auth?.authenticated]])if(typeof value==='boolean')facts[key]=value;
 if(Number.isSafeInteger(auth?.loginStatus)&&auth.loginStatus>=0&&auth.loginStatus<=599)facts.loginStatus=auth.loginStatus;
 if(Number.isSafeInteger(issuer?.tlsAttempts)&&issuer.tlsAttempts>=0&&issuer.tlsAttempts<=1000000)facts.issuerTlsAttempts=issuer.tlsAttempts;
 return facts;
}
/** Observe actual child closure. A forced or missing close can never qualify the fixture. */
export async function waitForAuthenticatedHelperClose(state,{waitFor=sleep,attempts=60}={}){
 for(let attempt=0;attempt<attempts&&!state.closed;attempt++)await waitFor(50);
 return {closeObserved:state.closed===true,exitCode:Number.isSafeInteger(state.exitCode)?state.exitCode:null,signal:state.signal??null,forced:state.forced===true};
}
/** Signal delivery is asynchronous and observed; a timed-out or killed CLI can never qualify. */
export async function deliverNativeAuthenticatedSignal({name,signal,spawnProcess=spawn,waitFor=sleep,onState=()=>{}}){
 if(!/^agentci-smoke-[a-f0-9]{16}-auth-[1-9][0-9]?$/.test(name)||!['SIGTERM','SIGKILL'].includes(signal))throw failure();
 const state={closed:false,exitCode:null,signal:null,forced:false},began=performance.now();
 const child=spawnProcess('docker',['kill','--signal',signal,name],{env:{PATH:process.env.PATH},stdio:'ignore'});
 child.once('error',()=>{});child.once('close',(exitCode,closeSignal)=>{state.closed=true;state.exitCode=exitCode;state.signal=closeSignal;});
 try{
  const signalProcessExit=await waitForAuthenticatedHelperClose(state,{waitFor,attempts:28}),signalDeliveryMs=Math.ceil(performance.now()-began);
  if(!signalProcessExit.closeObserved||signalProcessExit.exitCode!==0||signalProcessExit.signal!==null||signalDeliveryMs>1500)throw failure();
  return {signalProcessExit,signalDeliveryMs};
 }finally{
  if(!state.closed){state.forced=true;child.kill('SIGTERM');await waitForAuthenticatedHelperClose(state,{waitFor,attempts:10});}
  if(!state.closed){child.kill('SIGKILL');await waitForAuthenticatedHelperClose(state,{waitFor,attempts:10});}
  onState({signalProcessClosed:state.closed});
  if(!state.closed)throw failure();
 }
}
/** Client completion and backend close are independent events; preserve a terminal observation only after both. */
export function authenticatedSignalTerminal(observer,mode,expected){
 const held=observer?.held,response=held?.response;
 if(!held||!response||held.watchdogFired||observer?.proxy?.timeouts!==0||response.failureCode==='ETIMEDOUT'||held.requestPending!==false||held.backendPending!==false)return false;
 if(mode==='graceful')return response.complete===true&&response.status===200&&response.expectedBodyMatched===true&&response.schemaMatched===true&&response.sha256===expected.sha256&&response.bytes===expected.bytes&&held.released===true&&held.releaseReason==='explicit';
 if(!['sigkill','abrupt143'].includes(mode))return false;
 return response.complete===false&&held.backendClientDisconnected===true&&held.released===false&&held.releaseReason===null;
}

function certificateBinding(leaf,name){const p=leaf.public;return {sha256:p.derSha256,validFromMs:Date.parse(p.validFrom),validToMs:Date.parse(p.validTo),signedByFixtureCa:p.signedByExpectedCa,expectedName:name==='frontend'?p.uiHostnameMatches:name==='issuer'?p.issuerIpMatches:p.backendIpMatches};}
function bindings(certs,trustCase){const issuer=trustCase==='wrong-ca'?certs.leaves['wrong-ca']:trustCase==='wrong-hostname'?certs.leaves['wrong-hostname']:trustCase==='expired-certificate'?certs.leaves.expired:certs.leaves.valid;return {frontend:certificateBinding(certs.leaves.valid,'frontend'),issuer:certificateBinding(issuer,'issuer'),backend:certificateBinding(certs.leaves.valid,'backend')};}
const stopped=engine=>name=>JSON.parse(engine(['inspect','--format','{"exitCode":{{json .State.ExitCode}},"oomKilled":{{json .State.OOMKilled}},"running":{{json .State.Running}}}',name]));
const commonArgs=(owner,name)=>['create','--name',name,'--label','agentci.image-smoke.owner='+owner,'--label','agentci.purpose=image-smoke','--user','1001:0','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','128','--memory','512m','--cpus','1','--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=64m'];

/** Actual certificate/trust/runtime work is hosted-only; stage is fixed in source, never an ambient skip. */
export async function runNativeAuthenticatedAcceptance({engine,image,rawImage,source,owner,directory,save,spawnProcess=spawn,waitFor=sleep}){
 if(process.platform!=='linux'||process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REPOSITORY!=='alimobrem/agentci'||AUTHENTICATED_STAGE!=='authenticated-drain'||!/^agentci-smoke-[a-f0-9]{16}$/.test(owner))throw Error('Owned hosted authenticated drain stage required');
 const identity={...source,imageId:image.id},fixtureSourceSha256=hash(AUTH_HELPER_SOURCE),cases=[];let characterization,progressReceipt={schemaVersion:1,stage:AUTHENTICATED_STAGE,result:'partial-observations-not-qualification',source:identity,fixtureSourceSha256,checkpoints:[]};
 const progress=async value=>{progressReceipt=appendAuthenticatedProgress(progressReceipt,value);await save('authenticated-drain-progress.json',progressReceipt);};
 await progress({caseId:null,trustCase:null,step:'prepare',boundary:'prepare'});
 let certs;
 try{certs=await createNativeAuthenticatedCertificates(directory);await progress({caseId:null,trustCase:null,step:'certificates-ready',boundary:'certificates'});}catch{await progress({caseId:null,trustCase:null,step:'failed',boundary:'certificates'});throw failure();}
 let data;try{data=await nativeAuthenticatedFixtureData();}catch{await progress({caseId:null,trustCase:null,step:'failed',boundary:'prepare'});throw failure();}
 const expectedResponse=nativeAuthenticatedExpectedResponse();
 const certificateBindings=Object.fromEntries(['valid',...AUTH_TRUST_CASES].map(mode=>[mode,bindings(certs,mode)]));
 const baseEnvironment=rawImage.Config.Env;
 const probe=(name,code)=>JSON.parse(engine(['exec',name,'node','--input-type=module','-e',code]));
 const readStopped=stopped(engine);
 let ordinal=0;
 async function runCase(trustCase,pairedPositiveId,mode=null){
  const id=randomUUID(),observerId=randomUUID(),app=owner+'-auth-'+(++ordinal),helper=app+'-helper',clientId='native-auth-fixture',clientSecret='runtime-canary-'+randomBytes(32).toString('hex'),readToken='synthetic-read-'+randomBytes(32).toString('hex');
  const principal={issuer:AUTH_ISSUER,subject:'synthetic-native-principal',organizationId:data.admission.subject.organizationId,repositories:[data.admission.subject.repository]};
  const config=JSON.stringify({issuer:AUTH_ISSUER,clientId,clientSecret,origin:AUTH_ORIGIN,grants:{[JSON.stringify([AUTH_ISSUER,principal.subject])]:principal},reviews:{[data.admission.id]:{admission:data.admission,apiOrigin:AUTH_BACKEND,readToken}}});
  const configFile=join(directory,'authenticated-'+id+'.env');
  const options={baseEnvironment,configurationSha256:hash(config),ca:certs.ca,trustCase};
  let appId,helperId,attached,attachFailed=false,stdout='',stderr='',boundary='create',known,record,signalFacts={};
  const attachState={closed:false,exitCode:null,signal:null,forced:false};
  const checkpoint=async(step,extra={})=>progress({caseId:id,trustCase,step,boundary,...extra});
  const control=(path,method='GET')=>{
   const code="const r=await fetch("+JSON.stringify('http://127.0.0.5:4444'+path)+",{method:"+JSON.stringify(method)+",signal:AbortSignal.timeout(1500)});if(!r.ok)throw Error('control');const t=await r.text();if(Buffer.byteLength(t)>32768)throw Error('bound');process.stdout.write(t);";
   known=projectAuthenticatedHelperState(probe(helper,code));return known;
  };
  try{
   await checkpoint('prepare');
   await writeFile(configFile,'AGENTCI_DASHBOARD_CONFIG='+config+'\n',{mode:0o600,flag:'wx'});
   const args=[...commonArgs(owner,app),'--network','none','--env','DEBUG=next:start-server','--env','HOSTNAME=dashboard.fixture.invalid','--env','PORT=3000','--add-host','dashboard.fixture.invalid:127.0.0.1','--env-file',configFile];
   if(trustCase!=='absent-ca')args.push('--env','NODE_EXTRA_CA_CERTS='+AUTH_CA_DESTINATION,'--mount','type=bind,src='+certs.ca.sourcePath+',dst='+AUTH_CA_DESTINATION+',readonly');
   appId=engine([...args,image.id,...(mode==='abrupt143'?ABRUPT143_COMMAND:[])]);if(!/^[a-f0-9]{64}$/.test(appId))throw failure();
   const rawApp=JSON.parse(engine(['inspect',app]))[0];
   let defaultProductionValidatorAccepted=true;try{validateDashboardContainer(rawApp,image,owner);}catch{defaultProductionValidatorAccepted=false;}
   if(defaultProductionValidatorAccepted)throw failure();
   let positiveFixtureValidatorAccepted=true,appContainer;
   if(mode==='abrupt143'){
    try{validateDashboardAuthenticatedContainer(rawApp,image,owner,options);}catch{positiveFixtureValidatorAccepted=false;}
    if(positiveFixtureValidatorAccepted)throw failure();appContainer=validateDashboardAuthenticatedAbruptContainer(rawApp,image,owner,options);
   }else appContainer=trustCase==='valid'?validateDashboardAuthenticatedContainer(rawApp,image,owner,options):validateDashboardAuthenticatedTlsFailureContainer(rawApp,image,owner,options);
   await checkpoint('created');engine(['start',app]);boundary='liveness';
   let ready=false;for(let attempt=0;attempt<80;attempt++){try{probe(app,"const r=await fetch('http://127.0.0.1:3000/livez',{signal:AbortSignal.timeout(1000)});if(r.status!==200)throw Error('liveness');console.log('{}');");ready=true;break;}catch{}await waitFor(100);}if(!ready)throw failure();
   await checkpoint('app-ready');boundary='configuration';
   const appRuntime=probe(app,dashboardShutdownSourceProbe),appTrust=probe(app,dashboardAuthenticatedTrustProbe);
   helperId=engine([...commonArgs(owner,helper),'--network','container:'+appId,'--interactive','--entrypoint','node',image.id,'--input-type=module','-e',AUTH_HELPER_SOURCE]);if(!/^[a-f0-9]{64}$/.test(helperId))throw failure();
   const helperContainer=validateDashboardAuthenticatedHelper(JSON.parse(engine(['inspect',helper]))[0],image,owner,{baseEnvironment,appId,helperSourceSha256:fixtureSourceSha256,helperSource:AUTH_HELPER_SOURCE});
   const issuer=trustCase==='wrong-ca'?certs.leaves['wrong-ca']:trustCase==='wrong-hostname'?certs.leaves['wrong-hostname']:trustCase==='expired-certificate'?certs.leaves.expired:certs.leaves.valid;
   const bootstrap={schemaVersion:1,observerId,trustCase,caPem:certs.caPem,frontend:{keyPem:certs.leaves.valid.keyPem,certPem:certs.leaves.valid.certPem},issuer:{keyPem:issuer.keyPem,certPem:issuer.certPem},backend:{keyPem:certs.leaves.valid.keyPem,certPem:certs.leaves.valid.certPem},clientId,clientSecret,principal,...data,readToken};
   boundary='helper-start';attached=spawnProcess('docker',['start','-ai',helper],{env:{PATH:process.env.PATH},stdio:['pipe','pipe','pipe']});
   attached.once('error',()=>{attachFailed=true;});attached.once('close',(code,signal)=>{attachState.closed=true;attachState.exitCode=code;attachState.signal=signal;if(code!==0||signal)attachFailed=true;});
   for(const [stream,name] of [[attached.stdout,'stdout'],[attached.stderr,'stderr']])stream.on('data',chunk=>{if((name==='stdout'?stdout:stderr).length+chunk.length>8192){attachFailed=true;attachState.forced=true;attached.kill('SIGTERM');}else if(name==='stdout')stdout+=chunk;else stderr+=chunk;});
   attached.stdin.on('error',()=>{attachFailed=true;});attached.stdin.end(JSON.stringify(bootstrap)+'\n');
   ready=false;for(let attempt=0;attempt<100;attempt++){try{if(control('/state').ready){ready=true;break;}}catch{}if(attachFailed||attachState.closed)throw failure();await waitFor(50);}if(!ready)throw failure();
   const helperTrust=probe(helper,dashboardAuthenticatedTrustProbe);await checkpoint('helper-ready');
   boundary='authentication';control('/authenticate','POST');
   let characterized=false;
   for(let attempt=0;attempt<200;attempt++){
    control('/state');if(known.authentication?.complete){try{validateAuthenticatedCharacterizationObservation(known,{trustCase,ca:certs.ca,certificateBindings,expectedResponse});characterized=true;break;}catch{}}
    if(attachFailed||attachState.closed)throw failure();await waitFor(50);
   }
   await checkpoint('authenticated',authenticatedCheckpointFacts(known));if(!characterized)throw failure();
   const readLogs=()=>{const channels=engine(['logs',app],{separateStreams:true});if([channels.stdout,channels.stderr].some(text=>text.includes(readToken)||/BEGIN .*PRIVATE KEY/.test(text)))throw failure();return dashboardShutdownMarkers(channels,clientSecret);};
   if(mode){
    const baseline=control('/state');validateAuthenticatedCharacterizationObservation(baseline,{trustCase,ca:certs.ca,certificateBindings,expectedResponse});
    const requestId=randomUUID();boundary='request-hold';control('/hold?id='+requestId,'POST');
    const heldPending=observer=>observer?.held?.id===requestId&&observer.held.observerId===observerId&&observer.held.requestStarted===true&&observer.held.requestPending===true&&observer.held.backendObserved===true&&observer.held.backendPending===true&&observer.held.backendReadOrdinal===2&&observer.held.response===null&&observer.held.released===false&&observer.held.releaseReason===null&&observer.held.backendHoldMs===null&&observer.held.watchdogFired===false&&observer.held.heldAgeMs<6000&&observer.peers.backend.authorizedReads===2&&observer.peers.backend.httpRequests===2&&observer.proxy.requests===6&&observer.proxy.timeouts===0;
    let held=false;for(let attempt=0;attempt<50;attempt++){control('/state');if(heldPending(known)){held=true;break;}if(attachFailed||attachState.closed||known.held?.watchdogFired)throw failure();await waitFor(25);}if(!held)throw failure();
    if(JSON.stringify(probe(app,dashboardShutdownSourceProbe))!==JSON.stringify(appRuntime))throw failure();
    const beforeSignal=control('/state'),beforeSignalRunning=readStopped(app).running;if(!heldPending(beforeSignal)||beforeSignalRunning!==true)throw failure();
    await checkpoint('request-held');boundary='signal';const began=performance.now(),signal=mode==='sigkill'?'SIGKILL':'SIGTERM';
    const delivery=await deliverNativeAuthenticatedSignal({name:app,signal,spawnProcess,waitFor,onState:value=>{signalFacts={...signalFacts,...value};}});await checkpoint('signal-delivered',signalFacts);
    let whileHeld=null,release={requested:false,acknowledged:false,afterCleanupStartedMs:null};
    if(mode==='graceful'){
     boundary='held-observation';let cleanupStarted=false,cleanupObservedAt;
     for(let attempt=0;attempt<50;attempt++){
      const logs=readLogs();if(logs.markers.some(marker=>marker.type==='finished'))throw failure();
      if(logs.markers.some(marker=>marker.type==='started')){cleanupStarted=true;cleanupObservedAt=performance.now();break;}
      if(performance.now()-began>2000)throw failure();await waitFor(25);
     }
     if(!cleanupStarted)throw failure();await waitFor(350);
     // Sample before the helper request: this is a conservative elapsed lower bound, not the later engine-return time.
     const afterCleanupStartedMs=Math.floor(performance.now()-cleanupObservedAt),observer=control('/state'),appRunning=readStopped(app).running,logs=readLogs();
     signalFacts={...signalFacts,running:appRunning,cleanupStarted:logs.markers.some(marker=>marker.type==='started'),cleanupFinished:logs.markers.some(marker=>marker.type==='finished')};
     whileHeld={observer,appRunning,afterCleanupStartedMs,logs};await checkpoint('held-after-signal',signalFacts);
     if(!appRunning||!heldPending(observer)||afterCleanupStartedMs<300||logs.markers.length!==1||logs.markers[0].type!=='started')throw failure();
     boundary='release';release={requested:true,acknowledged:false,afterCleanupStartedMs:null};
     const releaseElapsedMs=Math.floor(performance.now()-cleanupObservedAt),released=control('/release?id='+requestId,'POST');release={requested:true,acknowledged:true,afterCleanupStartedMs:releaseElapsedMs};
     if(released.held?.id!==requestId||released.held.releaseReason!=='explicit'||!Number.isSafeInteger(released.held.backendHoldMs)||released.held.backendHoldMs>=6000||released.held.watchdogFired)throw failure();
     await checkpoint('release-issued');
    }
    boundary='stop-observation';let appExit,afterExit,exitObserved=false;
    for(let attempt=0;attempt<150;attempt++){
     appExit=readStopped(app);afterExit=control('/state');
     if(afterExit.held?.watchdogFired||afterExit.proxy.timeouts||afterExit.held?.response?.failureCode==='ETIMEDOUT')throw failure();
     const held=afterExit.held,response=held?.response;
     if(response&&mode==='graceful'&&(!response.complete||response.status!==200||!response.expectedBodyMatched||!response.schemaMatched||response.sha256!==expectedResponse.sha256||response.bytes!==expectedResponse.bytes))throw failure();
     const terminalHeld=authenticatedSignalTerminal(afterExit,mode,expectedResponse);
     if(!appExit.running&&terminalHeld){exitObserved=true;break;}
     if(mode!=='graceful'&&afterExit.held?.heldAgeMs>=6000||performance.now()-began>15000)throw failure();
     await waitFor(25);
    }
    if(!exitObserved)throw failure();const elapsedMs=Math.ceil(performance.now()-began),logs=readLogs();
    signalFacts={...signalFacts,...appExit,cleanupStarted:logs.markers.some(marker=>marker.type==='started'),cleanupFinished:logs.markers.some(marker=>marker.type==='finished')};await checkpoint('exit-observed',signalFacts);
    const helperRunning=JSON.parse(engine(['inspect','--format','{{json .State.Running}}',helper]));
    if(!helperRunning||afterExit.observerId!==observerId||attachFailed||attachState.closed||stdout.includes(clientSecret)||stderr.includes(clientSecret)||stdout.includes(readToken)||stderr.includes(readToken)||/BEGIN .*PRIVATE KEY/.test(stdout+stderr))throw failure();
    record={id,mode,requestId,source:identity,command:rawApp.Config.Cmd,defaultProductionValidatorAccepted,positiveFixtureValidatorAccepted,appContainer,helperContainer,appRuntime,appTrust,helperTrust,baseline,beforeSignal,beforeSignalRunning,whileHeld,release,afterExit,shutdown:{signal,stopSucceeded:true,timeout:false,forced:signal==='SIGKILL',...appExit,elapsedMs,logs},observerAfterExit:{running:true,queryable:true,observerId},...delivery};
    return record;
   }
   const beforeStop=control('/state');validateAuthenticatedCharacterizationObservation(beforeStop,{trustCase,ca:certs.ca,certificateBindings,expectedResponse});boundary='stop';await checkpoint('before-stop');
   const began=performance.now();engine(['stop','--signal','SIGTERM','--timeout','20',app],{timeout:25000});const elapsedMs=Math.ceil(performance.now()-began),appExit=readStopped(app);
   boundary='observation';const afterStop=control('/state'),helperRunning=JSON.parse(engine(['inspect','--format','{{json .State.Running}}',helper]));
   if(!helperRunning||afterStop.observerId!==observerId||attachFailed||attachState.closed||stdout.includes(clientSecret)||stderr.includes(clientSecret)||stdout.includes(readToken)||stderr.includes(readToken)||/BEGIN .*PRIVATE KEY/.test(stdout+stderr))throw failure();
   const logs=readLogs();
   const shutdown={mode:'configured',...appExit,source:identity,runtime:appRuntime,signal:'SIGTERM',stopSucceeded:true,timeout:false,forced:appExit.exitCode===137,elapsedMs,requestDrain:'idle-only',logs};
   validateDashboardShutdown(shutdown,identity);
   await checkpoint('after-stop',{helperRunning:true});
   record={id,pairedPositiveId,trustCase,defaultProductionValidatorAccepted,appContainer,helperContainer,appRuntime,appTrust,helperTrust,beforeStop,afterStop,shutdown,observerAfterExit:{running:true,queryable:true,observerId}};
   return record;
  }catch{await checkpoint('failed',{...authenticatedCheckpointFacts(known),...authenticatedFailureObservation(known),...signalFacts});throw failure();}
  finally{
   if(helperId)try{control('/shutdown','POST');}catch{}
   let helperProcessExit=attached?await waitForAuthenticatedHelperClose(attachState,{waitFor}):null;
   const naturalClose=helperProcessExit?.closeObserved&&helperProcessExit.exitCode===0&&helperProcessExit.signal===null&&!helperProcessExit.forced;
   if(attached&&!naturalClose){
    attachState.forced=true;if(helperId)try{engine(['stop','--signal','SIGTERM','--timeout','3',helper],{timeout:6000});}catch{}
    if(!attachState.closed)attached.kill('SIGTERM');
    await waitForAuthenticatedHelperClose(attachState,{waitFor,attempts:20});
    if(!attachState.closed){attached.kill('SIGKILL');await waitForAuthenticatedHelperClose(attachState,{waitFor,attempts:20});}
   }
   // Global registered-owner cleanup independently verifies removals/private-file deletion on every path.
   if(helperId)try{engine(['rm','--volumes',helper]);}catch{}
   if(appId)try{engine(['rm','--volumes',app]);}catch{}
   if(record){
    boundary='observation';if(!naturalClose){await checkpoint('failed',{...signalFacts,...authenticatedFailureObservation(mode?record.afterExit:record.afterStop),helperProcessClosed:attachState.closed});throw failure();}
    record.helperProcessExit=helperProcessExit;if(mode)record.gracefulOracleAccepted=nativeAuthenticatedGracefulBehaviorQualified(record,characterization);await checkpoint('complete',{helperProcessClosed:true});
   }else if(attached&&!attachState.closed){boundary='observation';await checkpoint('failed',{helperProcessClosed:false});throw failure();}
  }
 }
 for(const trustCase of AUTH_TRUST_CASES){const positive=await runCase('valid',null);cases.push(positive);cases.push(await runCase(trustCase,positive.id));}
 characterization={schemaVersion:1,stage:'characterization',result:'synthetic-authenticated-characterization-qualified',source:identity,fixtureSourceSha256,ca:{sha256:certs.ca.sha256,bytes:certs.ca.bytes},certificateBindings,observedAtMs:Date.now(),expectedResponse,cases,authenticatedApiDrain:'unverified'};
 validateNativeAuthenticatedCharacterization(characterization,identity);await save('authenticated-characterization.json',characterization);
 const signalCases=[];for(const mode of ['graceful','sigkill','abrupt143'])signalCases.push(await runCase('valid',null,mode));
 const receipt={schemaVersion:2,stage:AUTHENTICATED_STAGE,result:'synthetic-authenticated-native-active-request-drain-qualified',source:identity,fixtureSourceSha256,characterization,signalCases,authenticatedApiDrain:'source-bound-native-qualified'};
 try{validateNativeAuthenticatedEvidence(receipt,identity);}catch{
  for(const item of signalCases){const diagnostic=authenticatedFailureSignalObservation(item);await progress({caseId:item.id,trustCase:'valid',step:'failed',boundary:'oracle',...diagnostic,...(!diagnostic.signalShapeValid?authenticatedFailureObservation(item.afterExit):{})});}
  throw failure();
 }
 await save('authenticated-drain.json',receipt);return receipt;
}
