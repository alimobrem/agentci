import {createHash} from 'node:crypto';
import {AUTH_HELPER_SOURCE} from './dashboard-native-auth-helper.mjs';
import {validateDashboardShutdown} from './dashboard-shutdown.mjs';
import {nativeAuthenticatedExpectedResponse} from './dashboard-native-authenticated-fixture.mjs';

// Advancing this requires a new reviewed source head. A receipt or environment cannot enable drainage.
export const AUTHENTICATED_STAGE='characterization';
const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=()=>{throw Error('Native synthetic authenticated evidence is unverified');};
const bool={kind:'boolean'},integer=(min=0,max=1000000)=>({kind:'integer',min,max});
const text=pattern=>({kind:'string',pattern}),choice=(...values)=>({kind:'enum',values});
const object=fields=>({kind:'object',fields}),array=(items,max=128)=>({kind:'array',items,max});
const nullable=schema=>({kind:'nullable',schema}),optional=schema=>({kind:'optional',schema});
const sha=text(/^[a-f0-9]{64}$/),commit=text(/^[a-f0-9]{40}$/),uuid=text(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/),imageId=text(/^sha256:[a-f0-9]{64}$/);
const time=integer(0,9999999999999),version=text(/^\d{1,3}\.\d{1,3}\.\d{1,3}(?:-[A-Za-z0-9.-]{1,64})?$/);
const tlsCases=['absent-ca','wrong-ca','wrong-hostname','expired-certificate'],trustCase=choice('valid',...tlsCases);
const transportCodes=choice('ECONNREFUSED','ECONNRESET','EPIPE','ETIMEDOUT','ERR_TLS_CERT_ALTNAME_INVALID','CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE','SELF_SIGNED_CERT_IN_CHAIN','DEPTH_ZERO_SELF_SIGNED_CERT','ERR_SSL_TLSV1_ALERT_UNKNOWN_CA','ERR_SSL_SSLV3_ALERT_BAD_CERTIFICATE','ERR_SSL_SSLV3_ALERT_CERTIFICATE_UNKNOWN','ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR','OTHER_TRANSPORT_ERROR');
const sourceSchema=object({sourceCommit:commit,sourceTree:commit,candidateCommit:commit,runId:text(/^[1-9]\d{0,19}$/),attempt:text(/^[1-9]\d{0,3}$/),arch:choice('amd64','arm64'),rootVersion:version,dashboardVersion:version,rootLockSha256:sha,dashboardLockSha256:sha,imageId});
const certificateSchema=object({sha256:sha,validFromMs:time,validToMs:time,signedByFixtureCa:bool,expectedName:bool});
const certificatesSchema=object({frontend:certificateSchema,issuer:certificateSchema,backend:certificateSchema});
const attributesSchema=object({secure:bool,httpOnly:bool,sameSiteLax:bool,hostOnly:bool,pathRoot:bool});
const responseSchema=object({complete:bool,status:integer(0,599),bytes:integer(0,262144),expectedBodyMatched:bool,schemaMatched:bool,privateCacheHeaders:bool,cookieIssued:bool,privateValueLeak:bool,sha256:sha,failureCode:nullable(transportCodes),responseOrigin:choice('upstream-only')});
const peerFields={tlsAttempts:integer(),tlsEstablished:integer(),tlsFailures:integer(),tlsErrorCodes:array(transportCodes,8),httpRequests:integer(),presentedCertificateSha256s:array(sha,2),clientObservedCertificateSha256s:array(sha,2)};
const protocolSchema=object({authorizations:integer(),tokenRequests:integer(),successfulExchanges:integer(),rejectedExchanges:integer(),pkceVerified:integer(),clientAuthenticated:integer()});
const helperStateSchema=object({
 schemaVersion:choice(1),observerId:uuid,trustCase,ready:bool,caSha256:sha,certificates:certificatesSchema,
 authentication:object({started:bool,complete:bool,authenticated:bool,anonymousStatus:integer(0,599),loginStatus:integer(0,599),loginResponseComplete:bool,callbackStatus:integer(0,599),sessionStatus:integer(0,599),callbackOriginMatched:bool,transactionCookieIssued:bool,sessionCookieIssued:bool,transactionCookieAttributes:nullable(attributesSchema),sessionCookieAttributes:nullable(attributesSchema),baseline:nullable(responseSchema),failedProtectedStatus:integer(0,599),failureCode:nullable(choice('AUTHENTICATION_REJECTED'))}),
 held:nullable(object({id:uuid,observerId:uuid,requestStarted:bool,requestPending:bool,backendObserved:bool,backendPending:bool,backendReadOrdinal:integer(),backendClientDisconnected:bool,released:bool,releaseReason:nullable(choice('explicit','watchdog','shutdown')),watchdogFired:bool,response:nullable(responseSchema)})),
 peers:object({frontend:object(peerFields),issuer:object({...peerFields,discoveryRequests:integer(),authorizationRequests:integer(),tokenRequests:integer(),jwksRequests:integer()}),backend:object({...peerFields,authorizedReads:integer(),rejectedReads:integer()})}),
 proxy:object({requests:integer(),errors:integer(),timeouts:integer(),responseOrigin:choice('upstream-only')}),shutdownRequested:bool,issuerProtocol:protocolSchema
});
const runtimeSchema=object({nextVersion:choice('16.4.0'),handlerPath:choice('apps/dashboard/node_modules/next/dist/server/lib/start-server.js'),handlerSha256:sha,node:choice('v26.10.0'),pid1Executable:choice('/usr/local/bin/node'),pid1ExecutableSha256:sha,probeNodeExecutableSha256:sha,pid1Command:array(choice('next-server (v16.4.0)'),1),pid1Uid:choice(1001),manualSignalOverride:bool,nodeOptionsOverride:bool,nodePathOverride:bool});
const tmpfsSchema=object({destination:choice('/tmp'),bytes:choice(67108864),noexec:bool,nosuid:bool,nodev:bool});
const containerFields={imageId,containerId:sha,user:choice('1001:0'),readOnly:bool,capabilitiesDropped:bool,noNewPrivileges:bool,pids:choice(128),memoryBytes:choice(536870912),nanoCpus:choice(1000000000),tmpfs:tmpfsSchema,sharedPidOrFilesystem:bool,publishedPorts:choice(0)};
const publicCaSchema=object({destination:choice('/run/agentci-fixture-ca.pem'),sha256:sha,bytes:integer(1,8192),readOnly:bool});
const appContainerSchema=object({...containerFields,configuration:choice('synthetic-authenticated-trust-fixture','synthetic-authenticated-tls-failure-control'),productionQualification:bool,network:choice('none'),loopbackHostMapping:bool,baseEnvironmentSha256:sha,configurationSha256:sha,caPresent:bool,publicCa:nullable(publicCaSchema),trustCase:optional(choice(...tlsCases))});
const helperContainerSchema=object({...containerFields,configuration:choice('synthetic-authenticated-helper'),productionQualification:bool,network:choice('owned-application-namespace-only'),applicationContainerId:sha,baseEnvironmentSha256:sha,helperSourceSha256:sha,globalCaOrCredentialMounts:choice(0)});
const publicDate=text(/^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) {1,2}\d{1,2} \d{2}:\d{2}:\d{2} \d{4} GMT$/);
const trustSchema=object({extraCaConfigured:bool,extraCaPathMatchesFixture:bool,unsupportedTrustEnvironmentNames:array(choice(),0),caMount:object({present:bool,readOnly:bool}),tmpfs:object({filesystem:choice('tmpfs','other'),sizeBytes:integer(0,1073741824),noexec:bool,nosuid:bool,nodev:bool,writable:bool}),fixtureCa:nullable(object({sha256:sha,bytes:integer(1,8192),certificateOnly:bool,ca:bool,validFrom:publicDate,validTo:publicDate}))});
const logsSchema=object({markers:array(object({type:choice('started','finished'),stream:choice('stderr'),line:integer()}),2),stdoutSha256:sha,stderrSha256:sha,cleanupErrors:bool,canaryLeak:bool});
const shutdownSchema=object({mode:choice('configured'),source:sourceSchema,runtime:runtimeSchema,signal:choice('SIGTERM'),stopSucceeded:bool,timeout:bool,forced:bool,exitCode:integer(0,255),running:bool,oomKilled:bool,elapsedMs:integer(0,20000),requestDrain:choice('idle-only'),logs:logsSchema});
const caseSchema=object({id:uuid,pairedPositiveId:nullable(uuid),trustCase,defaultProductionValidatorAccepted:bool,appContainer:appContainerSchema,helperContainer:helperContainerSchema,appRuntime:runtimeSchema,appTrust:trustSchema,helperTrust:trustSchema,beforeStop:helperStateSchema,afterStop:helperStateSchema,shutdown:shutdownSchema,observerAfterExit:object({running:bool,queryable:bool,observerId:uuid}),helperProcessExit:object({closeObserved:bool,exitCode:integer(0,255),signal:choice(null),forced:bool})});
const reportSchema=object({schemaVersion:choice(1),stage:choice('characterization'),result:choice('synthetic-authenticated-characterization-qualified'),observedAtMs:time,source:sourceSchema,fixtureSourceSha256:sha,ca:object({sha256:sha,bytes:integer(1,8192)}),certificateBindings:object(Object.fromEntries(['valid',...tlsCases].map(name=>[name,certificatesSchema]))),expectedResponse:object({sha256:sha,bytes:integer(1,262144)}),cases:array(caseSchema,8),authenticatedApiDrain:choice('unverified')});
const progressSchema=object({schemaVersion:choice(1),stage:choice('characterization'),result:choice('partial-observations-not-qualification'),source:sourceSchema,fixtureSourceSha256:sha,checkpoints:array(object({caseId:nullable(uuid),trustCase:nullable(trustCase),step:choice('prepare','certificates-ready','created','app-ready','helper-ready','authenticated','before-stop','after-stop','complete','failed'),boundary:nullable(choice('prepare','certificates','create','liveness','configuration','helper-start','authentication','stop','observation','oracle')),authenticationComplete:optional(bool),authenticated:optional(bool),loginStatus:optional(integer(0,599)),issuerTlsAttempts:optional(integer()),helperRunning:optional(bool),helperProcessClosed:optional(bool),observerShapeValid:optional(bool),observerSnapshot:optional(helperStateSchema)}),128)});

function matches(schema,value){
 if(schema.kind==='optional')return value===undefined||matches(schema.schema,value);
 if(schema.kind==='nullable')return value===null||matches(schema.schema,value);
 if(schema.kind==='boolean')return typeof value==='boolean';
 if(schema.kind==='integer')return Number.isSafeInteger(value)&&value>=schema.min&&value<=schema.max;
 if(schema.kind==='string')return typeof value==='string'&&schema.pattern.test(value);
 if(schema.kind==='enum')return schema.values.includes(value);
 if(schema.kind==='array')return Array.isArray(value)&&value.length<=schema.max&&value.every(item=>matches(schema.items,item));
 if(schema.kind==='object')return value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>Object.hasOwn(schema.fields,key))&&Object.entries(schema.fields).every(([key,child])=>matches(child,value[key]));
 return false;
}
function project(schema,value){
 if(schema.kind==='optional')return project(schema.schema,value);
 if(schema.kind==='nullable')return value===null?null:project(schema.schema,value);
 if(schema.kind==='object'){
  if(!value||typeof value!=='object'||Array.isArray(value))return undefined;const out={};
  for(const [key,child] of Object.entries(schema.fields)){const selected=project(child,value[key]);if(selected!==undefined)out[key]=selected;}return out;
 }
 if(schema.kind==='array'){if(!Array.isArray(value)||value.length>schema.max)return undefined;const result=value.map(item=>project(schema.items,item));return result.some(item=>item===undefined)?undefined:result;}
 return matches(schema,value)?value:undefined;
}
/** Select typed public facts. Freeform stage strings, unknown keys and private values are never retained. */
export function projectAuthenticatedHelperState(raw){return project(helperStateSchema,raw)??{};}
/** A failure snapshot records typed observations, never a behavioral qualification or raw diagnostics. */
export function authenticatedFailureObservation(raw){
 const observerSnapshot=projectAuthenticatedHelperState(raw);
 return matches(helperStateSchema,observerSnapshot)?{observerShapeValid:true,observerSnapshot}:{observerShapeValid:false};
}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const equalObject=(a,b)=>{if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;const keys=Object.keys(a).sort();return same(keys,Object.keys(b).sort())&&keys.every(key=>equalObject(a[key],b[key]));};
const allTrue=value=>value&&Object.values(value).every(v=>v===true);
function checkResponse(response,expected){if(!response||!response.complete||response.status!==200||!response.expectedBodyMatched||!response.schemaMatched||!response.privateCacheHeaders||response.cookieIssued||response.privateValueLeak||response.sha256!==expected.sha256||response.bytes!==expected.bytes||response.failureCode!==null||response.responseOrigin!=='upstream-only')fail();}
function checkTrust(record,ca,present){
 if(record.extraCaConfigured!==present||record.extraCaPathMatchesFixture!==present||record.unsupportedTrustEnvironmentNames.length||record.caMount.present!==present||record.caMount.readOnly!==present||record.tmpfs.filesystem!=='tmpfs'||record.tmpfs.sizeBytes!==67108864||!record.tmpfs.noexec||!record.tmpfs.nosuid||!record.tmpfs.nodev||!record.tmpfs.writable)fail();
 if(present){if(!record.fixtureCa||record.fixtureCa.sha256!==ca.sha256||record.fixtureCa.bytes!==ca.bytes||!record.fixtureCa.certificateOnly||!record.fixtureCa.ca||!Number.isFinite(Date.parse(record.fixtureCa.validFrom))||!Number.isFinite(Date.parse(record.fixtureCa.validTo)))fail();}else if(record.fixtureCa!==null)fail();
}
function checkContainer(record,source){if(record.imageId!==source.imageId||!record.readOnly||!record.capabilitiesDropped||!record.noNewPrivileges||record.sharedPidOrFilesystem||record.productionQualification||!record.tmpfs.noexec||!record.tmpfs.nosuid||!record.tmpfs.nodev)fail();}
function checkState(record,item,report){
 const a=record.authentication,p=record.peers,protocol=record.issuerProtocol;
 if(!record.ready||record.trustCase!==item.trustCase||record.caSha256!==report.ca.sha256||!equalObject(record.certificates,report.certificateBindings[item.trustCase])||record.held!==null||record.shutdownRequested||!a.started||!a.complete||a.anonymousStatus!==401||!a.loginResponseComplete||record.proxy.errors||record.proxy.timeouts||record.proxy.responseOrigin!=='upstream-only'||record.proxy.requests!==p.frontend.httpRequests||p.frontend.tlsFailures||p.frontend.tlsErrorCodes.length||p.frontend.tlsEstablished<1||p.frontend.tlsAttempts<p.frontend.tlsEstablished||p.backend.rejectedReads)fail();
 for(const peer of ['frontend','issuer','backend']){
  const expectedHash=report.certificateBindings[item.trustCase][peer].sha256;
  if(!same(p[peer].presentedCertificateSha256s,p[peer].tlsAttempts?[expectedHash]:[]))fail();
  const clientObserved=peer==='frontend'||peer==='issuer'&&item.trustCase==='valid';
  if(!same(p[peer].clientObservedCertificateSha256s,clientObserved?[expectedHash]:[]))fail();
 }
 if(item.trustCase==='valid'){
  if(!a.authenticated||a.loginStatus!==303||a.callbackStatus!==303||a.sessionStatus!==200||!a.callbackOriginMatched||!a.transactionCookieIssued||!a.sessionCookieIssued||!allTrue(a.transactionCookieAttributes)||!allTrue(a.sessionCookieAttributes)||a.failedProtectedStatus!==0||a.failureCode!==null||p.issuer.tlsFailures||p.issuer.tlsErrorCodes.length||p.issuer.discoveryRequests<1||p.issuer.authorizationRequests!==1||p.issuer.tokenRequests!==1||p.issuer.jwksRequests<1||p.issuer.tlsEstablished<1||p.issuer.tlsAttempts<p.issuer.tlsEstablished||p.issuer.httpRequests!==p.issuer.discoveryRequests+p.issuer.authorizationRequests+p.issuer.tokenRequests+p.issuer.jwksRequests||p.backend.authorizedReads!==1||p.backend.httpRequests!==1||p.backend.tlsEstablished<1||p.backend.tlsFailures||p.backend.tlsErrorCodes.length||record.proxy.requests!==5||protocol.authorizations!==1||protocol.tokenRequests!==1||protocol.successfulExchanges!==1||protocol.rejectedExchanges!==0||protocol.pkceVerified!==1||protocol.clientAuthenticated!==1)fail();
  checkResponse(a.baseline,report.expectedResponse);
 }else{
  if(a.authenticated||a.loginStatus!==403||a.callbackStatus||a.sessionStatus||a.callbackOriginMatched||a.transactionCookieIssued||a.sessionCookieIssued||a.transactionCookieAttributes!==null||a.sessionCookieAttributes!==null||a.baseline!==null||a.failedProtectedStatus!==401||a.failureCode!=='AUTHENTICATION_REJECTED'||p.issuer.tlsAttempts<1||p.issuer.tlsFailures<1||!p.issuer.tlsErrorCodes.length||p.issuer.httpRequests||p.issuer.discoveryRequests||p.issuer.authorizationRequests||p.issuer.tokenRequests||p.issuer.jwksRequests||p.backend.authorizedReads||p.backend.httpRequests||p.backend.tlsAttempts||record.proxy.requests!==3||Object.values(protocol).some(v=>v!==0))fail();
 }
}
function checkCertificates(report){
 for(const name of ['valid',...tlsCases])for(const peer of ['frontend','issuer','backend']){
  const cert=report.certificateBindings[name][peer],negative=peer==='issuer',expired=negative&&name==='expired-certificate';
  if(cert.validFromMs>=cert.validToMs||cert.validFromMs>report.observedAtMs||(expired?cert.validToMs>=report.observedAtMs:cert.validToMs<=report.observedAtMs))fail();
  if(cert.signedByFixtureCa!==!(negative&&name==='wrong-ca')||cert.expectedName!==!(negative&&name==='wrong-hostname'))fail();
  if(peer!=='issuer'&&!equalObject(cert,report.certificateBindings.valid[peer]))fail();
 }
 if(!equalObject(report.certificateBindings['absent-ca'].issuer,report.certificateBindings.valid.issuer))fail();
 const distinct=['valid','wrong-ca','wrong-hostname','expired-certificate'].map(name=>report.certificateBindings[name].issuer.sha256);if(new Set(distinct).size!==4)fail();
}
/** Reuse the final oracle before any app stop/next case; incomplete or failed TLS attribution must stop characterization. */
export function validateAuthenticatedCharacterizationObservation(state,{trustCase,ca,certificateBindings,expectedResponse}){
 if(!equalObject(expectedResponse,nativeAuthenticatedExpectedResponse()))fail();
 if(AUTHENTICATED_STAGE!=='characterization'||!matches(helperStateSchema,state)||!matches(choice('valid',...tlsCases),trustCase)||!matches(object({sha256:sha,bytes:integer(1,8192)}),{sha256:ca?.sha256,bytes:ca?.bytes})||!matches(object(Object.fromEntries(['valid',...tlsCases].map(name=>[name,certificatesSchema]))),certificateBindings)||!matches(object({sha256:sha,bytes:integer(1,262144)}),expectedResponse))fail();
 checkState(state,{trustCase},{ca,certificateBindings,expectedResponse});
 return {result:'synthetic-authenticated-characterization-observation-qualified',authenticatedApiDrain:'unverified'};
}
/** The first immutable source head can certify login/TLS characterization only, never held-request drainage. */
export function validateNativeAuthenticatedEvidence(report,expected){
 if(AUTHENTICATED_STAGE!=='characterization'||!matches(reportSchema,report)||report.cases.length!==8||!equalObject(report.source,expected)||report.fixtureSourceSha256!==hash(AUTH_HELPER_SOURCE)||!equalObject(report.expectedResponse,nativeAuthenticatedExpectedResponse()))fail();
 checkCertificates(report);const seen=new Set(),containers=new Set(),observers=new Set(),positives=new Map();
 for(const item of report.cases){
  if(seen.has(item.id)||item.defaultProductionValidatorAccepted!==false)fail();seen.add(item.id);
  for(const container of [item.appContainer,item.helperContainer]){checkContainer(container,expected);if(containers.has(container.containerId))fail();containers.add(container.containerId);}
  const app=item.appContainer,helper=item.helperContainer,absent=item.trustCase==='absent-ca';
  if(helper.applicationContainerId!==app.containerId||helper.helperSourceSha256!==report.fixtureSourceSha256||helper.baseEnvironmentSha256!==app.baseEnvironmentSha256||!app.loopbackHostMapping||app.caPresent===absent||app.configuration!==(item.trustCase==='valid'?'synthetic-authenticated-trust-fixture':'synthetic-authenticated-tls-failure-control')||item.trustCase==='valid'&&app.trustCase!==undefined||item.trustCase!=='valid'&&app.trustCase!==item.trustCase)fail();
  if(absent){if(app.publicCa!==null)fail();}else if(!app.publicCa||!app.publicCa.readOnly||app.publicCa.sha256!==report.ca.sha256||app.publicCa.bytes!==report.ca.bytes)fail();
  checkTrust(item.appTrust,report.ca,!absent);checkTrust(item.helperTrust,report.ca,false);
  for(const state of [item.beforeStop,item.afterStop])checkState(state,item,report);
  if(!equalObject(item.appRuntime,item.shutdown.runtime)||!equalObject(item.shutdown.source,expected))fail();validateDashboardShutdown(item.shutdown,expected);
  const observer=item.beforeStop.observerId;if(observers.has(observer)||item.afterStop.observerId!==observer||item.observerAfterExit.observerId!==observer||!item.observerAfterExit.running||!item.observerAfterExit.queryable)fail();observers.add(observer);
  if(!item.helperProcessExit.closeObserved||item.helperProcessExit.exitCode!==0||item.helperProcessExit.signal!==null||item.helperProcessExit.forced)fail();
  if(item.trustCase==='valid'){if(item.pairedPositiveId!==null)fail();positives.set(item.id,item);}
 }
 if(positives.size!==4)fail();const pairs=new Set();
 for(const name of tlsCases){const negatives=report.cases.filter(item=>item.trustCase===name);if(negatives.length!==1)fail();const item=negatives[0];if(!positives.has(item.pairedPositiveId)||pairs.has(item.pairedPositiveId))fail();pairs.add(item.pairedPositiveId);}
 return {result:'synthetic-authenticated-characterization-qualified',stage:AUTHENTICATED_STAGE,authenticatedApiDrain:'unverified',liveOIDCAcceptance:'unverified',browserSecureCookieAcceptance:'unverified',productionDefaultEnvironmentQualification:false};
}
/** Publication validates exact nested shape before bytes can enter the public directory. */
export function assertPublicAuthenticatedArtifact(name,value){
 const limit=name==='authenticated-drain-progress.json'?131072:524288;
 let bytes;try{bytes=Buffer.byteLength(JSON.stringify(value));}catch{fail();}if(bytes>limit)fail();
 if(name==='authenticated-drain.json'){validateNativeAuthenticatedEvidence(value,value.source);return;}
 if(name==='authenticated-drain-progress.json'){
  if(AUTHENTICATED_STAGE!=='characterization'||!matches(progressSchema,value)||value.fixtureSourceSha256!==hash(AUTH_HELPER_SOURCE))fail();
  for(const checkpoint of value.checkpoints){
   const hasShape=Object.hasOwn(checkpoint,'observerShapeValid'),hasSnapshot=Object.hasOwn(checkpoint,'observerSnapshot');
   if((hasShape||hasSnapshot)&&(checkpoint.step!=='failed'||!hasShape||hasSnapshot!==checkpoint.observerShapeValid))fail();
   if(hasSnapshot&&(checkpoint.trustCase!==checkpoint.observerSnapshot.trustCase||checkpoint.caseId===null))fail();
  }
  return;
 }
 fail();
}
