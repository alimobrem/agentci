import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
// @ts-ignore Trusted owned database helper with controlled pool injection.
import {ownedCustomerDatabase} from '../scripts/lib/customer-isolated-database.mjs';
// @ts-ignore Trusted bounded session owner.
import {customerSessionOwner} from '../scripts/lib/customer-session-owner.mjs';
class ControlledPool extends EventEmitter{
 calls:string[]=[];ends=0;exists=false;onCreate?:()=>void;
 async query(sql:string){this.calls.push(sql);if(sql.startsWith('SELECT current_user'))return {rows:[{owner:'test-owner'}]};if(sql.startsWith('CREATE DATABASE')){if(this.exists)throw Object.assign(Error('PRIVATE-SENTINEL'),{code:'42P04'});this.exists=true;this.onCreate?.();return {command:'CREATE',rows:[],rowCount:0};}if(sql.startsWith('SELECT pg_get_userbyid'))return {rows:this.exists?[{owner:'test-owner'}]:[]};if(sql.startsWith('DROP DATABASE'))this.exists=false;return {rows:[],rowCount:this.exists?1:0};}
 async end(){this.ends++;}
}
const fixture=()=>{const url=new URL('postgres://127.0.0.1/test');url.username=['syn','thetic'].join('');url.password=['PRIVATE','SENTINEL'].join('-');const pool=new ControlledPool(),database=ownedCustomerDatabase(url.toString(),{poolFactory:()=>pool}),owner=customerSessionOwner();owner.registerDatabase(database);return {pool,database,owner};};
test('idle pool error after creation latches without process termination or database removal, retaining bounded recovery evidence',async()=>{
 const {pool,database,owner}=fixture();await database.initialize();assert.doesNotThrow(()=>pool.emit('error',Error('PRIVATE-SENTINEL backend detail')));
 assert.equal(database.state().creationAttempted,true);assert.equal(database.state().poolFailureLatched,true);
 await assert.rejects(owner.close(),(e:any)=>e.customerRecoveryRequired===true);assert.equal(pool.calls.filter(s=>s.startsWith('DROP')).length,0);
 const snapshot=owner.databaseSnapshot();assert.equal(snapshot[0].name,database.name);assert.equal(snapshot[0].cleanup,null);assert.equal(snapshot[0].state.poolFailureLatched,true);assert.ok(!JSON.stringify(snapshot).includes('PRIVATE-SENTINEL'));
 await Promise.all([database.quiesce(),database.quiesce()]);database.forceQuiesce();await Promise.resolve();assert.equal(pool.ends,1);assert.equal(database.state().closed,false);await assert.rejects(database.close(),/requires recovery/);
});
test('error during ambiguous CREATE retains the attempted identity and refuses later mutations',async()=>{
 const {pool,database,owner}=fixture();pool.onCreate=()=>pool.emit('error',Error('PRIVATE-SENTINEL'));
 await assert.rejects(database.initialize(),/requires recovery/);const before=pool.calls.length;await assert.rejects(owner.close(),/requires recovery/);assert.equal(pool.calls.length,before);assert.equal(owner.databaseSnapshot()[0].state.creationAttempted,true);assert.equal(database.state().creationState,'uncertain');await database.quiesce();
});
test('explicit duplicate CREATE rejection cannot authorize disposal of a pre-existing same-admin database',async()=>{
 const {pool,database,owner}=fixture();pool.exists=true;await assert.rejects(database.initialize(),/requires recovery/);assert.equal(database.state().creationState,'rejected');await assert.rejects(owner.close(),/requires recovery/);assert.equal(pool.exists,true);assert.ok(!pool.calls.some(sql=>sql.startsWith('DROP')));await database.quiesce();assert.equal(pool.exists,true);
});
test('confirmed successful creation permits exact owner-checked cleanup once',async()=>{
 const {pool,database,owner}=fixture();await database.initialize();assert.equal(database.state().creationState,'confirmed');const result=await owner.close();assert.equal(pool.exists,false);assert.equal(result.isolatedDatabases[0].ownedDatabases,0);await owner.close();assert.equal(pool.calls.filter(sql=>sql.startsWith('DROP')).length,1);assert.equal(pool.ends,1);
});
test('quiescence destroys tracked borrowed clients without taking their release ownership and joins pool end',async()=>{
 const {pool,database}=fixture();let destroyed=0,ended=0;const client:any=new EventEmitter();client.connection={stream:{destroy:()=>destroyed++}};client.end=async()=>{ended++;};client.release=()=>{throw Error('Borrower owns release');};pool.emit('connect',client);
 await database.quiesce();assert.equal(destroyed,1);assert.equal(ended,1);assert.equal(pool.ends,1);assert.doesNotThrow(()=>client.emit('error',Error('PRIVATE-SENTINEL')));const late:any=new EventEmitter();late.connection={stream:{destroy:()=>destroyed++}};late.end=async()=>{ended++;};pool.emit('connect',late);assert.equal(destroyed,2);
});
