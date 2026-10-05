import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
export class ReviewDispatchConflict extends Error {constructor(){super('review-dispatch-conflict');}}
export class ReviewDispatchUnavailable extends Error {constructor(){super('review-dispatch-unavailable');}}
export class ReviewDispatchLeaseLost extends Error {constructor(){super('review-dispatch-lease-lost');}}
export type ReviewTerminalStatus='completed'|'failed'|'cancelled'|'terminated'|'timed-out';
export interface ReviewDispatchRecord {id:string;workflowId:string;runId:string|null;admittedAtMs:number;cancelRequested:boolean;dispatched:boolean;terminal:{status:ReviewTerminalStatus;digest:string}|null}
export interface ReviewDispatchClaim extends ReviewDispatchRecord {token:string}
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(s);
const conflict=():never=>{throw new ReviewDispatchConflict();};
/** Controller-only execution metadata. Temporal identity is fixed by admission,
 * cancellation precedes remote calls, and terminal evidence wins over late ack.
 * This store does not authorize workflow callers or prove Temporal completion.
 */
export class ReviewDispatchStore {
 private scope:{organizationId:string;repository:string};
 constructor(private pool:Pool,scope:{organizationId:string;repository:string}){
  if(!uuid(scope.organizationId)||typeof scope.repository!=='string'||scope.repository.length>256||!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(scope.repository))conflict();
  this.scope={organizationId:scope.organizationId.toLowerCase(),repository:scope.repository};
 }
 private args(id:string){if(!uuid(id))conflict();return [this.scope.organizationId,this.scope.repository,id.toLowerCase()];}
 private decode(row:any):ReviewDispatchRecord{
  return {id:row.id,workflowId:`agentci:reviewer:${this.scope.organizationId}:${this.scope.repository}:${row.id}`,runId:row.run_id,admittedAtMs:Number(row.admitted_ms),cancelRequested:row.cancel_requested_at!==null,dispatched:row.dispatched_at!==null,terminal:row.terminal_status?{status:row.terminal_status,digest:row.terminal_digest}:null};
 }
 private async tx<T>(fn:(c:PoolClient)=>Promise<T>):Promise<T>{
  let c:PoolClient;try{c=await this.pool.connect();}catch{throw new ReviewDispatchUnavailable();}
  let broken=false;try{await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'");await c.query("SET LOCAL statement_timeout='10s'");const r=await fn(c);await c.query('COMMIT');return r;}
  catch(e){try{await c.query('ROLLBACK');}catch{broken=true;}if(e instanceof ReviewDispatchConflict||e instanceof ReviewDispatchLeaseLost)throw e;throw new ReviewDispatchUnavailable();}finally{c.release(broken);}
 }
 private async row(c:PoolClient,id:string,lock=false){return (await c.query(`SELECT o.*,floor(extract(epoch FROM a.created_at)*1000)::text AS admitted_ms FROM agentci_review_admission_outbox o JOIN agentci_review_admissions a USING(organization_id,repository,id) WHERE o.organization_id=$1 AND o.repository=$2 AND o.id=$3 ${lock?'FOR UPDATE OF o':''}`,this.args(id))).rows[0];}
 async get(id:string){this.args(id);return this.tx(async c=>{const r=await this.row(c,id);return r?this.decode(r):undefined;});}
 async claim():Promise<ReviewDispatchClaim|undefined>{
  return this.tx(async c=>{
   const r=(await c.query(`SELECT id FROM agentci_review_admission_outbox WHERE organization_id=$1 AND repository=$2 AND dispatched_at IS NULL AND terminal_status IS NULL AND (lease_until IS NULL OR lease_until<clock_timestamp()) ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED`,[this.scope.organizationId,this.scope.repository])).rows[0];if(!r)return undefined;
   const token=randomUUID();await c.query("UPDATE agentci_review_admission_outbox SET lease_token=$4,lease_until=clock_timestamp()+interval '120 seconds' WHERE organization_id=$1 AND repository=$2 AND id=$3",[...this.args(r.id),token]);
   return {...this.decode(await this.row(c,r.id)),token};
  });
 }
 async acknowledge(entry:ReviewDispatchClaim,runId:string){
  if(!uuid(runId)||!uuid(entry.token))conflict();
  return this.tx(async c=>{const r=await this.row(c,entry.id,true);if(!r||this.decode(r).workflowId!==entry.workflowId||(r.run_id&&r.run_id!==runId.toLowerCase()))conflict();
   // A retried acknowledgement is safe after lease release or terminal completion.
   if(r.dispatched_at&&r.run_id===runId.toLowerCase())return this.decode(r);
   const updated=await c.query("UPDATE agentci_review_admission_outbox SET run_id=$5,dispatched_at=COALESCE(dispatched_at,clock_timestamp()),lease_token=NULL,lease_until=NULL WHERE organization_id=$1 AND repository=$2 AND id=$3 AND lease_token=$4 AND lease_until>clock_timestamp() RETURNING id",[...this.args(entry.id),entry.token,runId.toLowerCase()]);if(!updated.rowCount)throw new ReviewDispatchLeaseLost();return this.decode(await this.row(c,entry.id));
  });
 }
 async requestCancellation(id:string){this.args(id);return this.tx(async c=>{const r=await c.query('UPDATE agentci_review_admission_outbox SET cancel_requested_at=COALESCE(cancel_requested_at,clock_timestamp()) WHERE organization_id=$1 AND repository=$2 AND id=$3 RETURNING id',this.args(id));if(!r.rowCount)conflict();return this.decode(await this.row(c,id));});}
 async finish(id:string,runId:string,status:ReviewTerminalStatus,resultDigest:string){
  this.args(id);if(!uuid(runId)||!['completed','failed','cancelled','terminated','timed-out'].includes(status)||typeof resultDigest!=='string'||!/^sha256:[a-f0-9]{64}$/.test(resultDigest))conflict();
  return this.tx(async c=>{const r=await this.row(c,id,true);if(!r||(r.run_id&&r.run_id!==runId.toLowerCase()))conflict();if(r.terminal_status){if(r.terminal_status!==status||r.terminal_digest!==resultDigest)conflict();return this.decode(r);}
   await c.query('UPDATE agentci_review_admission_outbox SET run_id=$4,terminal_status=$5,terminal_digest=$6,terminal_at=clock_timestamp() WHERE organization_id=$1 AND repository=$2 AND id=$3',[...this.args(id),runId.toLowerCase(),status,resultDigest]);return this.decode(await this.row(c,id));
  });
 }
}
