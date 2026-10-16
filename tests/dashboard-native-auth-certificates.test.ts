import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore Pure public-fact validation only; no certificate/key generation or OpenSSL execution.
import {AUTH_CA_DESTINATION,AUTH_TRUST_CASES,validateNativeAuthenticatedCertificateMetadata} from '../scripts/lib/dashboard-native-auth-certificates.mjs';

const now=Date.parse('2026-10-15T12:00:00Z'),caA='a'.repeat(64),caB='b'.repeat(64);
const current={validFrom:'2026-10-15T11:00:00Z',validTo:'2026-10-15T13:00:00Z',expired:false};
const metadata=()=>({
 valid:{sha256:'1'.repeat(64),derSha256:'2'.repeat(64),bytes:1024,issuerCaSha256:caA,verificationCaSha256:caA,signedByExpectedCa:true,...current,uiHostnameMatches:true,issuerIpMatches:true,backendIpMatches:true},
 'wrong-ca':{sha256:'3'.repeat(64),derSha256:'4'.repeat(64),bytes:1024,issuerCaSha256:caB,verificationCaSha256:caA,signedByExpectedCa:false,...current,uiHostnameMatches:false,issuerIpMatches:true,backendIpMatches:false},
 'wrong-hostname':{sha256:'5'.repeat(64),derSha256:'6'.repeat(64),bytes:1024,issuerCaSha256:caA,verificationCaSha256:caA,signedByExpectedCa:true,...current,uiHostnameMatches:false,issuerIpMatches:false,backendIpMatches:false},
 expired:{sha256:'7'.repeat(64),derSha256:'8'.repeat(64),bytes:1024,issuerCaSha256:caA,verificationCaSha256:caA,signedByExpectedCa:true,validFrom:'2020-01-01T00:00:00Z',validTo:'2020-01-02T00:00:00Z',expired:true,uiHostnameMatches:false,issuerIpMatches:true,backendIpMatches:false}
});
test('canonical native TLS cases preserve the separate private expired leaf mapping and public certificate identities',()=>{
 assert.equal(AUTH_CA_DESTINATION,'/run/agentci-fixture-ca.pem');
 assert.deepEqual(AUTH_TRUST_CASES,['absent-ca','wrong-ca','wrong-hostname','expired-certificate']);
 const proof=metadata();assert.deepEqual(validateNativeAuthenticatedCertificateMetadata(proof,now),proof);
 assert.notEqual(proof.valid.sha256,proof.valid.derSha256,'PEM file identity and TLS peer DER identity remain distinct');
 assert.notEqual(proof['wrong-ca'].issuerCaSha256,proof['wrong-ca'].verificationCaSha256,'actual signer differs from the verifier trust root');
});
test('certificate control metadata isolates trust, hostname and expiry failures instead of accepting overlapping causes',()=>{
 for(const mutate of[(p:any)=>p.valid.signedByExpectedCa=false,(p:any)=>p.valid.uiHostnameMatches=false,(p:any)=>p.valid.issuerIpMatches=false,(p:any)=>p.valid.backendIpMatches=false,(p:any)=>p.valid.validFrom='2026-10-16T00:00:00Z',(p:any)=>p['wrong-ca'].signedByExpectedCa=true,(p:any)=>p['wrong-ca'].issuerIpMatches=false,(p:any)=>p['wrong-ca'].issuerCaSha256=caA,(p:any)=>p['wrong-ca'].validTo='2020-01-02T00:00:00Z',(p:any)=>p['wrong-hostname'].signedByExpectedCa=false,(p:any)=>p['wrong-hostname'].issuerIpMatches=true,(p:any)=>p['wrong-hostname'].validTo='2020-01-02T00:00:00Z',(p:any)=>p.expired.signedByExpectedCa=false,(p:any)=>p.expired.issuerIpMatches=false,(p:any)=>p.expired.validTo='2026-10-16T00:00:00Z']){const proof=metadata();mutate(proof);assert.throws(()=>validateNativeAuthenticatedCertificateMetadata(proof,now));}
});
test('public certificate receipt requires finite typed dates, booleans, bounded bytes and exact root/hash provenance',()=>{
 for(const mutate of[(p:any)=>delete p.valid,(p:any)=>p.valid.sha256='invalid',(p:any)=>p.valid.derSha256='F'.repeat(64),(p:any)=>p.valid.bytes=16385,(p:any)=>p.valid.bytes=0,(p:any)=>p.valid.bytes='1024',(p:any)=>p.valid.bytes=1.5,(p:any)=>p.valid.issuerCaSha256=caB,(p:any)=>p.valid.signedByExpectedCa='true',(p:any)=>p.valid.uiHostnameMatches=1,(p:any)=>p.valid.expired=true,(p:any)=>p['wrong-ca'].signedByExpectedCa=undefined,(p:any)=>p['wrong-hostname'].issuerIpMatches=undefined,(p:any)=>p.expired.validTo='invalid-date',(p:any)=>p.expired.validFrom='invalid-date',(p:any)=>p.expired.expired=false,(p:any)=>p.valid.validFrom=0,(p:any)=>{for(const value of Object.values(p) as any[])value.verificationCaSha256='invalid';},(p:any)=>{for(const value of Object.values(p) as any[])delete value.verificationCaSha256;},(p:any)=>p['wrong-ca'].issuerCaSha256='invalid']){const proof=metadata();mutate(proof);assert.throws(()=>validateNativeAuthenticatedCertificateMetadata(proof,now));}
 for(const invalidNow of[NaN,Infinity,String(now),null])assert.throws(()=>validateNativeAuthenticatedCertificateMetadata(metadata(),invalidNow));
});
test('public certificate metadata never accepts private material or unexpected leaf/field additions',()=>{
 for(const mutate of[(p:any)=>p.valid.keyPem='PRIVATE-SYNTHETIC-SENTINEL',(p:any)=>p.valid.certPem='PRIVATE-SYNTHETIC-SENTINEL',(p:any)=>p.extra=p.valid,(p:any)=>p.valid.unknown='PRIVATE-SYNTHETIC-SENTINEL']){const proof=metadata();mutate(proof);assert.throws(()=>validateNativeAuthenticatedCertificateMetadata(proof,now));}
});
test('certificate receipt cannot reuse control identities or hide unbounded text in parseable date fields',()=>{
 for(const mutate of[(p:any)=>p['wrong-ca'].sha256=p.valid.sha256,(p:any)=>p['wrong-hostname'].derSha256=p.valid.derSha256,(p:any)=>p.valid.validFrom+=' '.repeat(256),(p:any)=>p.valid.validTo=p.valid.validFrom,(p:any)=>p['wrong-hostname'].uiHostnameMatches=true,(p:any)=>p.expired.backendIpMatches=true]){const proof=metadata();mutate(proof);assert.throws(()=>validateNativeAuthenticatedCertificateMetadata(proof,now));}
});
