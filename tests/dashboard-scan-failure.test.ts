import test from 'node:test';import assert from 'node:assert/strict';
// @ts-ignore Bounded public native diagnostics helper.
import {dashboardScanFailure} from '../scripts/lib/dashboard-scan-failure.mjs';
test('scanner execution failures produce only bounded classifications and channel hashes, never diagnostics or secrets',()=>{
 const inputs=[['failed to extract layer: no space left on device ENOSPC','scratch-space-exhausted'],['unknown flag: --private-fixture','scanner-cli-arguments-failed'],['permission denied: /private/fixture.env Bearer PRIVATE-CANARY','filesystem-permission-denied'],['failed to download vulnerability database','database-download-failed'],['x509: certificate signed by unknown authority','network-or-tls-failed'],['random unclassified diagnostic PRIVATE-CANARY','multiple-or-unclassified']];
 for(const [stderr,cause] of inputs){const receipt=dashboardScanFailure({status:1,stdout:'PRIVATE-STDOUT',stderr});assert.equal(receipt.classification,'scanner-execution-failed');assert.equal(receipt.cause,cause);assert.equal(receipt.scanPolicyResult,'not-evaluated');const bytes=JSON.stringify(receipt);assert.ok(bytes.length<4096);for(const privateValue of ['PRIVATE-CANARY','PRIVATE-STDOUT','fixture.env','Bearer'])assert.ok(!bytes.includes(privateValue));}
});
test('mixed causes remain ambiguous, large diagnostics are bounded, and timeout/output-limit are not scan policy findings',()=>{
 const reportText=dashboardScanFailure({status:1,stdout:'vulnerability description: no space left on device'});assert.deepEqual(reportText.observedClasses,[]);
 const mixed=dashboardScanFailure({status:1,stderr:'failed to download vulnerability database: permission denied'});assert.equal(mixed.cause,'multiple-or-unclassified');assert.equal(mixed.observedClasses.length,2);
 const large=dashboardScanFailure({status:1,stderr:'X'.repeat(200000)});assert.equal(large.classificationTruncated,true);assert.equal(large.stderrBytes,200000);assert.ok(JSON.stringify(large).length<4096);
 for(const code of ['ETIMEDOUT','ENOBUFS']){const result=dashboardScanFailure({status:null,error:{code}});assert.equal(result.scanPolicyResult,'not-evaluated');assert.equal(result.observedClasses.length,1);}
});
