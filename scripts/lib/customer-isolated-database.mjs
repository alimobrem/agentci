import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {customerAbort} from './customer-diagnostics.mjs';
/** A separate database is required by the production singleton scope invariant.
 * Register this owner before initialize, including ambiguous CREATE outcomes. */
export function ownedCustomerDatabase(databaseUrl){
 const original=new URL(databaseUrl);
 if(!['postgres:','postgresql:'].includes(original.protocol)||!['127.0.0.1','localhost'].includes(original.hostname)||original.search||original.hash)throw Error('Owned loopback database required');
 const name='customer_staged_'+randomUUID().replaceAll('-',''),pool=new Pool({connectionString:databaseUrl,max:1,connectionTimeoutMillis:5000,statement_timeout:10000,query_timeout:10000});
 let owner,attempted=false,closed=false;
 const selected=new URL(original);selected.pathname='/'+name;
 return {name,url:selected.toString(),async initialize(){
  owner=(await pool.query('SELECT current_user AS owner')).rows[0].owner;
  attempted=true;await pool.query('CREATE DATABASE '+name);
 },async close({signal}={}){
  if(closed)return {name,result:'passed',ownedDatabases:0};
  customerAbort(signal);
  if(attempted){const rows=(await pool.query('SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1',[name])).rows;
   if(rows.length>1||rows.length&&rows[0].owner!==owner)throw Error('Isolated database ownership unverified');
   customerAbort(signal);if(rows.length)await pool.query('DROP DATABASE '+name);
   if((await pool.query('SELECT 1 FROM pg_database WHERE datname=$1',[name])).rowCount)throw Error('Owned isolated database remains');
  }
  await pool.end();closed=true;return {name,result:'passed',ownedDatabases:0};
 },async quiesce(){await pool.end();},forceQuiesce(){void pool.end().catch(()=>{});}};
}
