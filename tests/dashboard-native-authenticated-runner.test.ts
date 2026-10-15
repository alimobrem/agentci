import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
// @ts-expect-error Native evidence scripts are directly imported ESM.
import {authenticatedCheckpointFacts,waitForAuthenticatedHelperClose,nativeAuthenticatedFixtureData,runNativeAuthenticatedCharacterization} from '../scripts/lib/dashboard-native-authenticated-runner.mjs';

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

test('actual characterization fails closed outside owned hosted Linux before any resource operation',async()=>{
 if(process.platform==='linux'&&process.env.GITHUB_ACTIONS==='true'&&process.env.GITHUB_REPOSITORY==='alimobrem/agentci')return;
 let touched=false;
 await assert.rejects(runNativeAuthenticatedCharacterization({engine:()=>{touched=true;},save:()=>{touched=true;}}),/Owned hosted characterization stage required/);
 assert.equal(touched,false);
});
