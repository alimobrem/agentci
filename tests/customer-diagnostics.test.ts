import test from 'node:test';import assert from 'node:assert/strict';
// @ts-ignore Trusted harness diagnostics projection.
import {customerDiagnosticFacts,customerDiagnostics,customerAbort,customerDiagnosticIdentity,customerDiagnosticError} from '../scripts/lib/customer-diagnostics.mjs';
test('client code/status projection retains bounded rejection identity and excludes arbitrary error contents',()=>{
 const secret='PRIVATE-SENTINEL-BODY',operationId='11111111-1111-4111-8111-111111111111',journal=customerDiagnostics(()=>({}));
 const error={code:'approval-conflict',status:409,message:secret,body:secret,cause:secret,headers:{authorization:secret}};
 assert.deepEqual(customerDiagnosticError(error),{code:'approval-conflict',status:409});journal.record('reservation','failed',undefined,error,operationId);
 assert.deepEqual(journal.snapshot().events[0],{sequence:1,phase:'reservation',outcome:'failed',error:{code:'approval-conflict',status:409},operationId});
 journal.record('reservation','failed',undefined,{code:secret,status:599},secret);assert.deepEqual(journal.snapshot().events[1].error,{code:'unclassified',status:null});assert.ok(!JSON.stringify(journal.snapshot()).includes(secret));
});
test('customer diagnostic journal retains only allowlisted facts and bounds repeated observations',()=>{
 const secret='PRIVATE-SENTINEL-OUTPUT';
 const state={state:'exited',pid:123,code:1,signal:'SIGKILL',stderr:secret,env:{TOKEN:secret},error:secret};
 const facts=()=>customerDiagnosticFacts({state:()=>state},{state:()=>({phase:'unverified',command:'inspect',failure:'buffer-limit',creationAttempted:true,identified:true,verified:false,running:false,exitCode:1,output:secret})});
 const journal=customerDiagnostics(facts);for(let i=0;i<300;i++)journal.record('settlement','failed',{dispatch:'settled',cancelRequested:true,settlement:'never-staged',error:secret});
 const snapshot=journal.snapshot();assert.equal(snapshot.events.length,256);assert.equal(snapshot.dropped,44);assert.equal(snapshot.events[0].sequence,45);assert.equal(snapshot.events.at(-1).evaluator.failure,'buffer-limit');assert.equal(snapshot.events.at(-1).processes[1].signal,'SIGKILL');assert.ok(!JSON.stringify(snapshot).includes(secret));snapshot.events.length=0;assert.equal(journal.snapshot().events.length,256);
 assert.throws(()=>journal.record(secret,'failed'));assert.throws(()=>journal.record('cleanup',secret));
 state.state=secret;state.signal=secret;state.pid=-1;state.code=999;const projected=facts();assert.deepEqual(projected.processes[0],{role:'api',state:'unverified',pid:null,code:null,signal:null});assert.ok(!JSON.stringify(projected).includes(secret));
 const controller=new AbortController();controller.abort(Error(secret));assert.throws(()=>customerAbort(controller.signal),(error:Error)=>error.message==='Customer operation aborted');
});


test('diagnostics bind only exact public harness/run/candidate identities',()=>{
 const identity={harnessSource:'a'.repeat(40),runId:'1234',runAttempt:'2',candidate:{releaseSource:'b'.repeat(40),packageManifestSha256:'c'.repeat(64),packageSha256:'d'.repeat(64),imagesManifestSha256:'e'.repeat(64),publicationEvidenceSha256:'f'.repeat(64)}};
 const journal=customerDiagnostics(()=>({}),identity);assert.deepEqual(journal.snapshot().identity,identity);identity.candidate.packageSha256='0'.repeat(64);assert.equal(journal.snapshot().identity.candidate.packageSha256,'d'.repeat(64));
 for(const value of [{...identity,privateKey:'PRIVATE-SENTINEL'}, {...identity,runId:'secret'}, {...identity,harnessSource:'main'}, {...identity,candidate:{...identity.candidate,packageSha256:'PRIVATE-SENTINEL'}}, {...identity,candidate:{...identity.candidate,unknown:'PRIVATE-SENTINEL'}}])assert.throws(()=>customerDiagnosticIdentity(value),/Invalid customer diagnostic identity/);
 assert.equal(customerDiagnostics(()=>({})).snapshot().identity,null,'unit fixtures do not fabricate hosted identity');
});
