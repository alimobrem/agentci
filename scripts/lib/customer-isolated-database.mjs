import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {customerAbort} from './customer-diagnostics.mjs';
/** A separate database is required by the production singleton scope invariant.
 * Register this owner before initialize, including ambiguous CREATE outcomes. */
export function ownedCustomerDatabase(databaseUrl,{poolFactory=options=>new Pool(options)}={}){
 const original=new URL(databaseUrl);
 if(!['postgres:','postgresql:'].includes(original.protocol)||!['127.0.0.1','localhost'].includes(original.hostname)||original.search||original.hash)throw Error('Owned loopback database required');
 const name='customer_staged_'+randomUUID().replaceAll('-',''),pool=poolFactory({connectionString:databaseUrl,max:1,connectionTimeoutMillis:5000,statement_timeout:10000,query_timeout:10000});
 let owner,creation='not-attempted',closed=false,failed=false,endingPool;const clients=new Set();
 const latch=()=>{failed=true;};
 // Idle PostgreSQL failures must enter owned recovery, never escape EventEmitter.
 pool.on('error',latch);
 const destroy=client=>{try{client.connection?.stream?.destroy();}catch{}try{client.end()?.catch?.(()=>{});}catch{}};
 pool.on('connect',client=>{clients.add(client);client.on('error',latch);if(failed)destroy(client);});
 pool.on('remove',client=>clients.delete(client));
 pool.on('acquire',client=>{if(failed)destroy(client);});
 const unavailable=()=>{const error=Error('Owned isolated database requires recovery');error.customerRecoveryRequired=true;return error;};
 const healthy=signal=>{customerAbort(signal);if(failed)throw unavailable();};
 const query=async(sql,args,signal)=>{healthy(signal);let result;try{result=await pool.query(sql,args);}catch{latch();throw unavailable();}healthy(signal);return result;};
 const end=()=>endingPool??=Promise.resolve().then(()=>pool.end());
 const quiesce=()=>{failed=true;for(const client of clients)destroy(client);return end();};
 const selected=new URL(original);selected.pathname='/'+name;
 return {name,url:selected.toString(),state:()=>({creationAttempted:creation!=='not-attempted',creationState:creation,poolFailureLatched:failed,closed}),async initialize(){
  owner=(await query('SELECT current_user AS owner')).rows[0].owner;
  healthy();creation='uncertain';
  try{const result=await pool.query('CREATE DATABASE '+name);healthy();if(result.command!=='CREATE')throw unavailable();creation='confirmed';}
  catch(error){if(['42P04','42501','42601','0A000','25001'].includes(error?.code))creation='rejected';latch();throw unavailable();}
 },async close({signal}={}){
  if(closed)return {name,result:'passed',ownedDatabases:0};
  healthy(signal);
  if(creation!=='not-attempted'&&creation!=='confirmed')throw unavailable();
  if(creation==='confirmed'){const rows=(await query('SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1',[name],signal)).rows;
   if(rows.length>1||rows.length&&rows[0].owner!==owner)throw Error('Isolated database ownership unverified');
   healthy(signal);if(rows.length)await query('DROP DATABASE '+name,undefined,signal);
   if((await query('SELECT 1 FROM pg_database WHERE datname=$1',[name],signal)).rowCount)throw Error('Owned isolated database remains');
  }
  await end();healthy(signal);closed=true;return {name,result:'passed',ownedDatabases:0};
 },quiesce,forceQuiesce(){void quiesce().catch(()=>{});}};
}
