import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
// @ts-expect-error Native evidence scripts are directly imported ESM.
import {authenticatedCheckpointFacts,appendAuthenticatedProgress,waitForAuthenticatedHelperClose,deliverNativeAuthenticatedSignal,authenticatedSignalTerminal,nativeAuthenticatedFixtureData,runNativeAuthenticatedAcceptance} from '../scripts/lib/dashboard-native-authenticated-runner.mjs';
import {authenticatedDrain} from './helpers/dashboard-native-authenticated-proof.ts';
// @ts-ignore Strict public projection only; no actual fixture execution.
import {authenticatedFailureSignalObservation,assertPublicAuthenticatedArtifact,validateNativeAuthenticatedEvidence} from '../scripts/lib/dashboard-native-authenticated-evidence.mjs';

test('failed observer checkpoints retain only bounded known facts',()=>{
 assert.deepEqual(authenticatedCheckpointFacts(undefined),{});
 assert.deepEqual(authenticatedCheckpointFacts({authentication:{complete:false,authenticated:false,loginStatus:0,rawCookie:'PRIVATE-CANARY'}}),{authenticationComplete:false,authenticated:false,loginStatus:0});
 assert.deepEqual(authenticatedCheckpointFacts({authentication:{complete:true,authenticated:false,loginStatus:403},peers:{issuer:{tlsAttempts:1,rawKey:'PRIVATE-CANARY'}}}),{authenticationComplete:true,authenticated:false,loginStatus:403,issuerTlsAttempts:1});
 assert.deepEqual(authenticatedCheckpointFacts({authentication:{complete:'true',authenticated:1,loginStatus:NaN},peers:{issuer:{tlsAttempts:1000001}}}),{});
});

test('helper teardown requires observed closure and preserves forced or missing exit facts',async()=>{
 const state={closed:false,exitCode:null,signal:null,forced:false};let waits=0;
 const actual=await waitForAuthenticatedHelperClose(state,{waitFor:async()=>{waits++;Object.assign(state,{closed:true,exitCode:0});}});
 assert.deepEqual(actual,{closeObserved:true,exitCode:0,signal:null,forced:false});assert.equal(waits,1);
 assert.deepEqual(await waitForAuthenticatedHelperClose({closed:false,exitCode:null,signal:null,forced:true},{waitFor:async()=>{},attempts:2}),{closeObserved:false,exitCode:null,signal:null,forced:true});
 assert.deepEqual(await waitForAuthenticatedHelperClose({closed:true,exitCode:null,signal:'SIGKILL',forced:true}),{closeObserved:true,exitCode:null,signal:'SIGKILL',forced:true});
});

test('synthetic baseline binds the existing queued review response rather than fabricated evidence',async()=>{
 const data=await nativeAuthenticatedFixtureData(),body=JSON.parse(data.expectedApiBody);
 assert.deepEqual(body.admission,data.admission);assert.deepEqual(body.status,data.status);
 assert.equal(body.status.execution.state,'queued');assert.equal(body.status.summary,null);assert.deepEqual(body.findings,[]);assert.equal(body.evidence,'unavailable');
 assert.equal(Buffer.byteLength(data.expectedApiBody),1676);
 assert.equal(createHash('sha256').update(data.expectedApiBody).digest('hex'),'64c3a873b926fd9c50993b8361b04c9c0a79c97f461958a47df766a9f38bcbfe');
});

test('actual full authenticated acceptance fails closed outside owned hosted Linux before any resource operation',async()=>{
 if(process.platform==='linux'&&process.env.GITHUB_ACTIONS==='true'&&process.env.GITHUB_REPOSITORY==='alimobrem/agentci')return;
 let touched=false;
 await assert.rejects(runNativeAuthenticatedAcceptance({engine:()=>{touched=true;},save:()=>{touched=true;}}),/Owned hosted authenticated drain stage required/);
 assert.equal(touched,false);
});

test('signal delivery uses an asynchronous owned kill and requires actual successful CLI closure',async()=>{
 const child=new EventEmitter(),calls:any[]=[],states:any[]=[];let waits=0;
 const receipt=await deliverNativeAuthenticatedSignal({name:'agentci-smoke-0123456789abcdef-auth-9',signal:'SIGTERM',spawnProcess:(...args:any[])=>{calls.push(args);return child;},waitFor:async()=>{waits++;child.emit('close',0,null);},onState:(state:any)=>states.push(state)});
 assert.equal(waits,1);assert.deepEqual(calls[0]!.slice(0,2),['docker',['kill','--signal','SIGTERM','agentci-smoke-0123456789abcdef-auth-9']]);assert.deepEqual(Object.keys(calls[0]![2].env),['PATH']);assert.equal(calls[0]![2].stdio,'ignore');
 assert.deepEqual(receipt.signalProcessExit,{closeObserved:true,exitCode:0,signal:null,forced:false});assert.ok(receipt.signalDeliveryMs>=0&&receipt.signalDeliveryMs<=1500);assert.deepEqual(states,[{signalProcessClosed:true}]);
});

test('signal delivery rejects nonzero, forced or missing closure and bounds owned CLI recovery',async()=>{
 for(const closeCode of [1,null]){
  const child:any=new EventEmitter(),kills:string[]=[],states:any[]=[];child.kill=(signal:string)=>{kills.push(signal);if(closeCode===null)child.emit('close',null,signal);};
  let waits=0;await assert.rejects(deliverNativeAuthenticatedSignal({name:'agentci-smoke-0123456789abcdef-auth-10',signal:'SIGKILL',spawnProcess:()=>child,waitFor:async()=>{waits++;if(closeCode!==null)child.emit('close',closeCode,null);},onState:(state:any)=>states.push(state)}));
  assert.equal(states[0].signalProcessClosed,true);assert.deepEqual(kills,closeCode===null?['SIGTERM']:[]);assert.equal(waits,closeCode===null?28:1);
 }
 const child:any=new EventEmitter(),kills:string[]=[],states:any[]=[];child.kill=(signal:string)=>kills.push(signal);
 await assert.rejects(deliverNativeAuthenticatedSignal({name:'agentci-smoke-0123456789abcdef-auth-11',signal:'SIGTERM',spawnProcess:()=>child,waitFor:async()=>{},onState:(state:any)=>states.push(state)}));assert.deepEqual(kills,['SIGTERM','SIGKILL']);assert.deepEqual(states,[{signalProcessClosed:false}]);
 let spawned=false;for(const options of [{name:'unowned',signal:'SIGTERM'},{name:'agentci-smoke-0123456789abcdef-auth-11',signal:'SIGINT'}])await assert.rejects(deliverNativeAuthenticatedSignal({...options,spawnProcess:()=>{spawned=true;}}));assert.equal(spawned,false);
});

test('negative terminal capture waits for client interruption and the independent backend disconnect event',()=>{
 const state:any={proxy:{timeouts:0},held:{requestPending:false,backendPending:true,backendClientDisconnected:false,released:false,releaseReason:null,watchdogFired:false,response:{complete:false,failureCode:'ECONNRESET'}}};
 for(const mode of ['sigkill','abrupt143']){
  assert.equal(authenticatedSignalTerminal(state,mode,{}),false);
  const terminal=structuredClone(state);terminal.held.backendPending=false;terminal.held.backendClientDisconnected=true;assert.equal(authenticatedSignalTerminal(terminal,mode,{}),true);
  for(const mutate of [(s:any)=>s.held.watchdogFired=true,(s:any)=>s.proxy.timeouts=1,(s:any)=>s.held.response.failureCode='ETIMEDOUT',(s:any)=>s.held.released=true,(s:any)=>s.held.releaseReason='shutdown']){const invalid=structuredClone(terminal);mutate(invalid);assert.equal(authenticatedSignalTerminal(invalid,mode,{}),false);}
 }
});

test('graceful terminal capture requires the actual trusted complete response and explicit backend release',()=>{
 const expected={bytes:1676,sha256:'64c3a873b926fd9c50993b8361b04c9c0a79c97f461958a47df766a9f38bcbfe'},state:any={proxy:{timeouts:0},held:{requestPending:false,backendPending:false,released:true,releaseReason:'explicit',watchdogFired:false,response:{...expected,complete:true,status:200,expectedBodyMatched:true,schemaMatched:true,failureCode:null}}};
 assert.equal(authenticatedSignalTerminal(state,'graceful',expected),true);
 for(const mutate of [(s:any)=>s.held.response.complete=false,(s:any)=>s.held.response.sha256='0'.repeat(64),(s:any)=>s.held.response.bytes++,(s:any)=>s.held.releaseReason='watchdog',(s:any)=>s.held.requestPending=true]){const invalid=structuredClone(state);mutate(invalid);assert.equal(authenticatedSignalTerminal(invalid,'graceful',expected),false);}
});

test('all three rejected full observations fit bounded partial progress and cannot qualify the full result',()=>{
 const full=authenticatedDrain();full.signalCases[0].afterExit.held.response.sha256='0'.repeat(64);assert.throws(()=>validateNativeAuthenticatedEvidence(full,full.source));
 let progress:any={schemaVersion:1,stage:'authenticated-drain',result:'partial-observations-not-qualification',source:full.source,fixtureSourceSha256:full.fixtureSourceSha256,checkpoints:[]};
 for(let n=0;n<95;n++)progress=appendAuthenticatedProgress(progress,{caseId:null,trustCase:null,step:'complete',boundary:'observation'});
 for(const item of full.signalCases)progress=appendAuthenticatedProgress(progress,{caseId:item.id,trustCase:'valid',step:'failed',boundary:'oracle',...authenticatedFailureSignalObservation(item)});
 assert.equal(progress.checkpoints.length,98);assert.equal(progress.checkpoints.slice(-3).every((c:any)=>c.signalShapeValid&&c.signalSnapshot),true);
 assert.ok(Buffer.byteLength(JSON.stringify(progress,null,2)+'\n')<=131072);assert.doesNotThrow(()=>assertPublicAuthenticatedArtifact('authenticated-drain-progress.json',progress));assert.throws(()=>validateNativeAuthenticatedEvidence(progress,full.source));
});

test('signal diagnostics yield to the actual public byte cap instead of withholding earlier proof',()=>{
 const full=authenticatedDrain(),item=full.signalCases[0];let progress:any={schemaVersion:1,stage:'authenticated-drain',result:'partial-observations-not-qualification',source:full.source,fixtureSourceSha256:full.fixtureSourceSha256,checkpoints:[]},omitted=false;
 for(let n=0;n<100;n++){
  progress=appendAuthenticatedProgress(progress,{caseId:item.id,trustCase:'valid',step:'failed',boundary:'oracle',...authenticatedFailureSignalObservation(item)});
  if(progress.checkpoints.at(-1).signalSnapshotOmitted){omitted=true;assert.equal(progress.checkpoints.at(-1).signalSnapshotOmitted,'progress-byte-bound');assert.equal(progress.checkpoints.at(-1).signalSnapshot,undefined);break;}
 }
 assert.equal(omitted,true);assert.ok(Buffer.byteLength(JSON.stringify(progress,null,2)+'\n')<=131072);assert.doesNotThrow(()=>assertPublicAuthenticatedArtifact('authenticated-drain-progress.json',progress));
});
