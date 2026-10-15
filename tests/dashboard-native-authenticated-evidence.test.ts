import test from 'node:test';import assert from 'node:assert/strict';
// @ts-ignore Hosted-native evidence is builtin-only JavaScript.
import {AUTHENTICATED_STAGE,projectAuthenticatedHelperState,assertPublicAuthenticatedArtifact,validateNativeAuthenticatedEvidence,validateAuthenticatedCharacterizationObservation} from '../scripts/lib/dashboard-native-authenticated-evidence.mjs';
import {authenticatedCharacterization as fixture} from './helpers/dashboard-native-authenticated-proof.ts';
const sha=(n:number)=>n.toString(16).padStart(64,'0'),uuid=(n:number)=>n.toString(16).padStart(8,'0')+'-1111-4111-8111-111111111111';

test('first source head accepts only eight source-bound real-login/TLS cases and keeps authenticated drainage unverified',()=>{
 const report=fixture();assert.equal(AUTHENTICATED_STAGE,'characterization');assert.equal(validateNativeAuthenticatedEvidence(report,report.source).authenticatedApiDrain,'unverified');assert.doesNotThrow(()=>assertPublicAuthenticatedArtifact('authenticated-drain.json',report));
});
test('per-case observation gate stops early authentication/TLS attribution failures before later cases',()=>{
 const report=fixture(),context={ca:report.ca,certificateBindings:report.certificateBindings,expectedResponse:report.expectedResponse};
 for(const item of report.cases)assert.equal(validateAuthenticatedCharacterizationObservation(item.beforeStop,{...context,trustCase:item.trustCase}).authenticatedApiDrain,'unverified');
 for(const mutate of [(s:any)=>s.authentication.complete=false,(s:any)=>s.authentication.failedProtectedStatus=0,(s:any)=>s.peers.issuer.tlsFailures=0,(s:any)=>s.peers.issuer.presentedCertificateSha256s=[]]){const state=structuredClone(report.cases[1].beforeStop);mutate(state);assert.throws(()=>validateAuthenticatedCharacterizationObservation(state,{...context,trustCase:'absent-ca'}));}
});
test('successful characterization requires observed natural helper CLI exit without force or leftover process',()=>{
 for(const mutate of [(r:any)=>delete r.cases[0].helperProcessExit,(r:any)=>r.cases[0].helperProcessExit.closeObserved=false,(r:any)=>r.cases[0].helperProcessExit.exitCode=1,(r:any)=>r.cases[0].helperProcessExit.signal='SIGTERM',(r:any)=>r.cases[0].helperProcessExit.forced=true]){const report=fixture();mutate(report);assert.throws(()=>validateNativeAuthenticatedEvidence(report,report.source));}
});
test('projection discards freeform stages and unknown private values at every nested helper boundary',()=>{
 const raw:any=fixture().cases[0].beforeStop;raw.stage='PRIVATE-STAGE';raw.authentication.stage='PRIVATE-STAGE';raw.authentication.cookie='PRIVATE-COOKIE';raw.peers.issuer.token='PRIVATE-TOKEN';raw.certificates.issuer.pem='PRIVATE-CERT';raw.config={private:'PRIVATE-CONFIG'};
 const selected=projectAuthenticatedHelperState(raw);assert.equal(JSON.stringify(selected).includes('PRIVATE'),false);assert.equal(selected.authentication.authenticated,true);assert.equal(selected.peers.issuer.presentedCertificateSha256s.length,1);
 raw.authentication.loginStatus='PRIVATE';raw.peers.issuer.tlsErrorCodes=['PRIVATE'];raw.observerId='PRIVATE';const bounded=projectAuthenticatedHelperState(raw);assert.equal(bounded.authentication.loginStatus,undefined);assert.equal(bounded.observerId,undefined);assert.equal(bounded.peers.issuer.tlsErrorCodes,undefined);
});
test('configured certificate metadata cannot replace actual socket observations, including rejected TLS peer',()=>{
 for(const mutate of [(r:any)=>r.cases[1].beforeStop.peers.issuer.presentedCertificateSha256s=[],(r:any)=>r.cases[1].beforeStop.peers.issuer.presentedCertificateSha256s=[sha(999)],(r:any)=>r.cases[0].beforeStop.peers.frontend.clientObservedCertificateSha256s=[],(r:any)=>r.cases[0].beforeStop.peers.issuer.clientObservedCertificateSha256s=[sha(999)],(r:any)=>r.cases[1].beforeStop.peers.issuer.tlsAttempts=0,(r:any)=>r.cases[1].beforeStop.peers.issuer.tlsFailures=0,(r:any)=>r.cases[1].beforeStop.peers.issuer.discoveryRequests=1]){const report=fixture();mutate(report);assert.throws(()=>validateNativeAuthenticatedEvidence(report,report.source));}
});
test('negative TLS cases cannot borrow positives or represent a generic setup failure as expected TLS rejection',()=>{
 for(const mutate of [(r:any)=>r.cases[1].pairedPositiveId=r.cases[3].pairedPositiveId,(r:any)=>r.cases[1].pairedPositiveId=uuid(999),(r:any)=>r.cases[1].beforeStop.authentication.loginStatus=503,(r:any)=>r.cases[1].beforeStop.authentication.failedProtectedStatus=503,(r:any)=>r.cases[1].beforeStop.authentication.sessionCookieIssued=true,(r:any)=>r.cases[0].beforeStop.authentication.baseline.complete=false,(r:any)=>r.cases[0].beforeStop.authentication.baseline.schemaMatched=false,(r:any)=>r.cases[0].beforeStop.issuerProtocol.pkceVerified=0,(r:any)=>r.cases[0].beforeStop.proxy.errors=1,(r:any)=>r.cases[0].afterStop.proxy.timeouts=1,(r:any)=>r.cases[0].observerAfterExit.queryable=false,(r:any)=>r.cases[0].afterStop.observerId=uuid(999),(r:any)=>r.cases[2].appContainer.containerId=r.cases[0].appContainer.containerId,(r:any)=>r.cases[0].defaultProductionValidatorAccepted=true]){const report=fixture();mutate(report);assert.throws(()=>validateNativeAuthenticatedEvidence(report,report.source));}
});
test('trust/mount, source/runtime, response hash and certificate substitutions cannot qualify characterization',()=>{
 for(const mutate of [(r:any)=>r.source.sourceTree='e'.repeat(40),(r:any)=>r.fixtureSourceSha256=sha(999),(r:any)=>r.cases[0].helperTrust.extraCaConfigured=true,(r:any)=>r.cases[0].appTrust.caMount.readOnly=false,(r:any)=>r.cases[1].appTrust.fixtureCa=r.cases[0].appTrust.fixtureCa,(r:any)=>r.cases[0].appTrust.tmpfs.noexec=false,(r:any)=>r.cases[0].appRuntime.manualSignalOverride=true,(r:any)=>r.cases[0].shutdown.exitCode=0,(r:any)=>r.cases[0].beforeStop.authentication.baseline.sha256=sha(999),(r:any)=>r.certificateBindings['expired-certificate'].issuer.validToMs=r.observedAtMs+1,(r:any)=>r.certificateBindings['wrong-hostname'].issuer.expectedName=true,(r:any)=>r.certificateBindings['wrong-ca'].issuer.signedByFixtureCa=true]){const report=fixture(),expected=structuredClone(report.source);mutate(report);assert.throws(()=>validateNativeAuthenticatedEvidence(report,expected));}
});
test('coordinated receipt expectations and all baseline substitutions cannot redefine the source-owned API body',()=>{
 for(const replacement of [{sha256:sha(999),bytes:1676},{sha256:fixture().expectedResponse.sha256,bytes:1677}]){
  const report=fixture();report.expectedResponse=replacement;
  for(const item of report.cases)if(item.trustCase==='valid')for(const state of [item.beforeStop,item.afterStop])Object.assign(state.authentication.baseline,replacement);
  assert.throws(()=>validateNativeAuthenticatedEvidence(report,report.source));
  assert.throws(()=>assertPublicAuthenticatedArtifact('authenticated-drain.json',report));
  const item=report.cases[0];assert.throws(()=>validateAuthenticatedCharacterizationObservation(item.beforeStop,{trustCase:item.trustCase,ca:report.ca,certificateBindings:report.certificateBindings,expectedResponse:replacement}));
 }
});
test('full/held claims and unknown private fields are rejected at publication rather than silently sanitized',()=>{
 for(const mutate of [(r:any)=>r.stage='full',(r:any)=>r.authenticatedApiDrain='verified',(r:any)=>r.cases[0].beforeStop.held={id:uuid(9)},(r:any)=>r.privateKey='PRIVATE-CANARY',(r:any)=>r.cases[0].beforeStop.authentication.sessionCookie='PRIVATE-CANARY',(r:any)=>r.cases[0].appContainer.env=['PRIVATE-CANARY'],(r:any)=>r.cases[0].beforeStop.peers.issuer.tlsErrorCodes=['PRIVATE-CANARY']]){const report=fixture();mutate(report);assert.throws(()=>assertPublicAuthenticatedArtifact('authenticated-drain.json',report));}
});
test('bounded progress is explicitly partial and rejects unknown/private fields and count/byte/type overflow',()=>{
 const report=fixture(),progress:any={schemaVersion:1,stage:AUTHENTICATED_STAGE,result:'partial-observations-not-qualification',source:report.source,fixtureSourceSha256:report.fixtureSourceSha256,checkpoints:[{caseId:null,trustCase:null,step:'prepare',boundary:null},{caseId:uuid(1),trustCase:'valid',step:'authenticated',boundary:'authentication',authenticationComplete:true,authenticated:true,loginStatus:303,issuerTlsAttempts:4,helperRunning:true}]};
 assert.doesNotThrow(()=>assertPublicAuthenticatedArtifact('authenticated-drain-progress.json',progress));
 for(const change of [(p:any)=>p.checkpoints[0].stderr='PRIVATE',(p:any)=>p.checkpoints[0].step='PRIVATE',(p:any)=>p.checkpoints[0].loginStatus='PRIVATE',(p:any)=>p.checkpoints=Array(129).fill(p.checkpoints[0]),(p:any)=>p.stage='full',(p:any)=>p.raw='X'.repeat(131073)]){const bad=structuredClone(progress);change(bad);assert.throws(()=>assertPublicAuthenticatedArtifact('authenticated-drain-progress.json',bad));}
});
