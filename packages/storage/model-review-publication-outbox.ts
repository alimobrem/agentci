import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
export interface ModelReviewPublicationClaim {id:string;token:string;generation:string;attempts:number}
export class ModelReviewPublicationUnavailable extends Error {constructor(){super('model-review-publication-storage-unavailable');}}
export class ModelReviewPublicationLeaseLost extends Error {constructor(){super('model-review-publication-lease-lost');}}
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(s);
export class ModelReviewPublicationOutbox {
 constructor(private pool:Pool,private scope:{organizationId:string;repository:string}){if(!uuid(scope.organizationId)||! /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(scope.repository))throw new ModelReviewPublicationUnavailable();}
 private async tx<T>(fn:(c:PoolClient)=>Promise<T>):Promise<T>{
  let c:PoolClient;try{c=await this.pool.connect();}catch{throw new ModelReviewPublicationUnavailable();}
  let broken=false;try{await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'");await c.query("SET LOCAL statement_timeout='10s'");const result=await fn(c);await c.query('COMMIT');return result;}
  catch(error){try{await c.query('ROLLBACK');}catch{broken=true;}if(error instanceof ModelReviewPublicationLeaseLost)throw error;throw new ModelReviewPublicationUnavailable();}finally{c.release(broken);}
 }
 async ready(){return this.tx(async c=>{
  await c.query('SELECT organization_id,repository,id,generation,acknowledged_generation,lease_token,lease_until,leased_generation,retry_after,attempts,last_error,last_outcome,acknowledged_at,created_at FROM agentci_model_review_publications LIMIT 0');
  await c.query('SELECT organization_id,repository,retry_after FROM agentci_model_review_publication_cooldowns LIMIT 0');
  const row=(await c.query("SELECT count(*) AS count FROM pg_trigger WHERE tgname IN ('model_review_publication_dispatch','model_review_publication_summary','model_review_publication_identity') AND tgenabled='O' AND tgrelid IN ('agentci_review_admission_outbox'::regclass,'agentci_review_execution_summaries'::regclass,'agentci_model_review_publications'::regclass)")).rows[0];if(row.count!=='3')throw Error();
 });}
 async claim():Promise<ModelReviewPublicationClaim|undefined>{return this.tx(async c=>{
  const args=[this.scope.organizationId,this.scope.repository];
  const row=(await c.query(`SELECT id,generation::text,attempts FROM agentci_model_review_publications
   WHERE organization_id=$1 AND repository=$2 AND acknowledged_generation<generation
   AND retry_after<=clock_timestamp() AND (lease_until IS NULL OR lease_until<clock_timestamp())
   AND NOT EXISTS(SELECT 1 FROM agentci_model_review_publication_cooldowns WHERE organization_id=$1 AND repository=$2 AND retry_after>clock_timestamp())
   ORDER BY retry_after,created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED`,args)).rows[0];if(!row)return undefined;
  const token=randomUUID();await c.query("UPDATE agentci_model_review_publications SET lease_token=$4,lease_until=clock_timestamp()+interval '300 seconds',leased_generation=generation,attempts=LEAST(attempts+1,30) WHERE organization_id=$1 AND repository=$2 AND id=$3",[...args,row.id,token]);
  return {id:row.id,token,generation:row.generation,attempts:Math.min(row.attempts+1,30)};
 });}
 private args(claim:ModelReviewPublicationClaim){if(!uuid(claim.id)||!uuid(claim.token)||!/^[1-9][0-9]{0,18}$/.test(claim.generation))throw new ModelReviewPublicationUnavailable();return [this.scope.organizationId,this.scope.repository,claim.id,claim.token,claim.generation];}
 async acknowledge(claim:ModelReviewPublicationClaim,outcome:'published'|'superseded'){
  if(!['published','superseded'].includes(outcome))throw new ModelReviewPublicationUnavailable();
  return this.tx(async c=>{const result=await c.query(`UPDATE agentci_model_review_publications SET acknowledged_generation=GREATEST(acknowledged_generation,$5::bigint),lease_token=NULL,lease_until=NULL,leased_generation=NULL,attempts=0,last_error=NULL,last_outcome=$6,acknowledged_at=clock_timestamp()
   WHERE organization_id=$1 AND repository=$2 AND id=$3 AND lease_token=$4 AND leased_generation=$5::bigint AND lease_until>clock_timestamp()`,[...this.args(claim),outcome]);if(!result.rowCount)throw new ModelReviewPublicationLeaseLost();});
 }
 async defer(claim:ModelReviewPublicationClaim,retryAfterMs?:number){
  if(retryAfterMs!==undefined&&(!Number.isSafeInteger(retryAfterMs)||retryAfterMs<1||retryAfterMs>7*24*60*60*1000))throw new ModelReviewPublicationUnavailable();
  const delay=Math.max(Math.min(300000,1000*2**Math.min(claim.attempts,9)),retryAfterMs??0);
  return this.tx(async c=>{
   const result=await c.query(`UPDATE agentci_model_review_publications SET lease_token=NULL,lease_until=NULL,leased_generation=NULL,retry_after=GREATEST(retry_after,clock_timestamp()+$6::double precision*interval '1 millisecond'),last_error=$7
    WHERE organization_id=$1 AND repository=$2 AND id=$3 AND lease_token=$4 AND leased_generation=$5::bigint AND lease_until>clock_timestamp()`,[...this.args(claim),delay,retryAfterMs===undefined?'unavailable':'rate-limit']);if(!result.rowCount)throw new ModelReviewPublicationLeaseLost();
   if(retryAfterMs!==undefined)await c.query(`INSERT INTO agentci_model_review_publication_cooldowns(organization_id,repository,retry_after) VALUES($1,$2,clock_timestamp()+$3::double precision*interval '1 millisecond') ON CONFLICT(organization_id,repository) DO UPDATE SET retry_after=GREATEST(agentci_model_review_publication_cooldowns.retry_after,EXCLUDED.retry_after)`,[this.scope.organizationId,this.scope.repository,delay]);
  });
 }
}
