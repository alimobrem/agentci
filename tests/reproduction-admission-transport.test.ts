import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {Octokit} from '@octokit/rest';
import {validateFindingReproductionRequest} from '../packages/findings/reproduction-transport.ts';import {createRemoteSnapshotReader} from '../packages/github/client.ts';
test('reservation selection strictly rejects execution inputs and detached or malformed subject/version identities',()=>{
 const f=JSON.parse(readFileSync(new URL('../specs/api/drafts/finding-reproduction-examples.json',import.meta.url),'utf8')).accepted,v={schemaVersion:'v1alpha1',reviewId:f.reviewId,subject:f.subject,expectedVersion:1,operationId:f.operationId,approvalId:f.id,approvalDigest:f.planDigest};
 assert.deepEqual(validateFindingReproductionRequest(v),v);const copy=validateFindingReproductionRequest(v);copy.subject.repository='changed/repo';assert.notEqual(copy.subject.repository,v.subject.repository);
 for(const change of [{command:['private-command']},{image:'private-image'},{receipt:{}},{expectedVersion:9999},{expectedVersion:0},{expectedVersion:1.5},{schemaVersion:'future'},{reviewId:'wrong'},{approvalDigest:'wrong'},{subject:{...v.subject,headSha:v.subject.baseSha}},{subject:{...v.subject,secret:'private-secret'}}])assert.throws(()=>validateFindingReproductionRequest({...v,...change}),/^Error: invalid-finding-reproduction-transport$/);
});
test('snapshot fetch forwards caller abort and stops before tree/blob requests',async()=>{
 let notify!:()=>void;const started=new Promise<void>(r=>{notify=r;}),abort=new AbortController();let calls=0;
 const github=new Octokit({request:{fetch:async(_input:RequestInfo|URL,init?:RequestInit)=>{calls++;assert.ok(init?.signal);notify();return new Promise<Response>((_r,reject)=>{init!.signal!.addEventListener('abort',()=>reject(init!.signal!.reason),{once:true});});}}});
 const pending=createRemoteSnapshotReader(github)('owner/repo','a'.repeat(40),abort.signal);await started;abort.abort();await assert.rejects(pending);assert.equal(calls,1);
});
