import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {validateFindingDispositionRequest,operatorDispositionReceipt} from '../packages/findings/disposition-transport.ts';
test('operator disposition rejects receipt/actor/confirmation injection and malformed bounded identities; returned requests are detached',()=>{
 const f=JSON.parse(readFileSync(new URL('../specs/api/drafts/finding-reproduction-examples.json',import.meta.url),'utf8')).accepted;
 const v={schemaVersion:'v1alpha1',reviewId:f.reviewId,subject:f.subject,expectedVersion:2,operationId:f.operationId,disposition:'false-positive',reason:'Operator classification',evidenceDigest:f.planDigest};
 assert.deepEqual(validateFindingDispositionRequest(v),v);const copy=validateFindingDispositionRequest(v);copy.subject.repository='changed/repo';assert.notEqual(copy.subject.repository,v.subject.repository);
 for(const change of [{receipt:{}},{receiptId:f.id},{actor:'operator'},{disposition:'confirmed'},{disposition:'rejected'},{expectedVersion:0},{expectedVersion:10000},{expectedVersion:1.5},{reason:''},{reason:' '},{reason:'é'.repeat(2049)},{reviewId:'wrong'},{operationId:'wrong'},{evidenceDigest:'wrong'},{subject:{...v.subject,headSha:v.subject.baseSha}},{subject:{...v.subject,secret:'private-secret'}}])assert.throws(()=>validateFindingDispositionRequest({...v,...change}),/invalid-finding-disposition/);
 const receipt=operatorDispositionReceipt(validateFindingDispositionRequest(v),'sha256:'+'a'.repeat(64));assert.equal(receipt.actor,'operator');assert.equal(receipt.assertionDigest,null);assert.equal(receipt.outcome,'false-positive');
});
