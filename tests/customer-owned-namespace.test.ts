import test from 'node:test';import assert from 'node:assert/strict';
// @ts-ignore Trusted bounded namespace owner.
import {ownedCustomerNamespace} from '../scripts/lib/customer-owned-namespace.mjs';
// @ts-ignore Trusted aggregate session owner.
import {customerSessionOwner} from '../scripts/lib/customer-session-owner.mjs';
test('stalled raw namespace registration times out, closes its owned connection, cleans the owned DB and cannot start late session work',async()=>{
 let resolve!:()=>void,forceClosed=0,transportClosed=0,lateWork=0,removed=0,deadline=0,signal!:AbortSignal;
 const gate=new Promise<void>(r=>{resolve=r;});const connection={client:{close:()=>{forceClosed++;}},close:async()=>{transportClosed++;},withDeadline:async(d:number,run:()=>Promise<void>)=>{deadline=d;return run();},withAbortSignal:async(s:AbortSignal,run:()=>Promise<void>)=>{signal=s;return run();},workflowService:{registerNamespace:async()=>gate}};
 const owner=customerSessionOwner(),name='customer_staged_'+'c'.repeat(32);owner.registerDatabase({name,close:async()=>{removed++;return {name,result:'passed',ownedDatabases:0};}});
 const resource=owner.registerNamespace(ownedCustomerNamespace('127.0.0.1:7233',{connect:async(options:any)=>{assert.equal(options.connectTimeout,'5 seconds');return connection;},timeoutMs:20,closeTimeoutMs:20}));
 await assert.rejects(async()=>{await resource.initialize();lateWork++;},/requires recovery/);assert.ok(deadline>0);assert.equal(signal.aborted,true);assert.ok(forceClosed>0);
 const cleanup=await owner.close();assert.equal(cleanup.temporaryNamespaces[0].temporaryConnections,0);assert.equal(transportClosed,1);assert.equal(removed,1);assert.equal(owner.namespaceSnapshot()[0].state.registration,'uncertain');
 resolve();await new Promise(r=>setTimeout(r,10));assert.equal(lateWork,0);assert.equal(resource.state().registration,'uncertain');
});
test('late connection after timeout is force-closed without issuing the namespace RPC or constructing a session',async()=>{
 let resolve!:(value:any)=>void,rpcs=0,closed=0;const connection={client:{close:()=>{closed++;}},close:async()=>{},withDeadline:async(_d:any,run:any)=>run(),withAbortSignal:async(_s:any,run:any)=>run(),workflowService:{registerNamespace:async()=>{rpcs++;}}};
 const pending=new Promise<any>(r=>{resolve=r;}),resource=ownedCustomerNamespace('127.0.0.1:7233',{connect:()=>pending,timeoutMs:10,closeTimeoutMs:10});
 await assert.rejects(resource.initialize(),/requires recovery/);await assert.rejects(resource.close(),/requires recovery/);resolve(connection);await new Promise(r=>setTimeout(r,10));await resource.close();assert.equal(rpcs,0);assert.ok(closed>0);assert.equal(resource.state().closed,true);
});
test('confirmed registration closes the temporary connection before session construction and is idempotently owned',async()=>{
 let closed=0,rpcs=0;const resource=ownedCustomerNamespace('127.0.0.1:7233',{connect:async()=>({client:{close(){}},close:async()=>{closed++;},withDeadline:async(_d:any,run:any)=>run(),withAbortSignal:async(_s:any,run:any)=>run(),workflowService:{registerNamespace:async()=>{rpcs++;}}})});
 const namespace=await resource.initialize();assert.equal(namespace,resource.namespace);assert.equal(resource.state().registration,'confirmed');assert.equal(closed,1);await resource.close();assert.equal(closed,1);assert.equal(rpcs,1);await assert.rejects(resource.initialize(),/requires recovery/);
});
