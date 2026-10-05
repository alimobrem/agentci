import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {ProviderFailure} from './types.ts';
export interface BudgetScope {id:string;organizationId:string;repository:string;limitUsdMicros:number}
export interface Reservation {requestId:string;requestDigest:string;attempt:number;upperBoundUsdMicros:number;pricingRevision:string}
export interface BudgetLedger {
 reserve(input:Reservation):Promise<string>;
 settle(attemptId:string,actualUsdMicros:number):Promise<void>;
 unknown(attemptId:string):Promise<void>;
 releaseNotSent(attemptId:string):Promise<void>;
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const amount=(value:number,min=0)=>Number.isSafeInteger(value)&&value>=min;
/** A trusted, immutable budget scope. Never construct scope from model-generated data. */
export class PostgresBudgetLedger implements BudgetLedger {
 private readonly scope:BudgetScope;
 constructor(private readonly pool:Pool,scope:BudgetScope){
  if(!uuid.test(scope.id)||!uuid.test(scope.organizationId)||!scope.repository.length||scope.repository.length>255||!amount(scope.limitUsdMicros,1))throw new ProviderFailure('invalid-request');
  this.scope={...scope};
 }
 private async transaction<T>(operation:(client:PoolClient)=>Promise<T>):Promise<T>{
  const client=await this.pool.connect();
  try{await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='10s'");
   const {id,organizationId,repository,limitUsdMicros}=this.scope;
   await client.query('INSERT INTO agentci_model_budgets(id,organization_id,repository,limit_usd_micros) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING',[id,organizationId,repository,limitUsdMicros]);
   const row=(await client.query('SELECT * FROM agentci_model_budgets WHERE id=$1 FOR UPDATE',[id])).rows[0];
   if(row.organization_id!==organizationId||row.repository!==repository||row.limit_usd_micros!==String(limitUsdMicros))throw new ProviderFailure('invalid-request');
   const result=await operation(client);await client.query('COMMIT');return result;
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 async reserve(input:Reservation):Promise<string>{
  if(!uuid.test(input.requestId)||!/^[a-f0-9]{64}$/.test(input.requestDigest)||!Number.isInteger(input.attempt)||input.attempt<1||input.attempt>5||!amount(input.upperBoundUsdMicros,1)||!input.pricingRevision.length||input.pricingRevision.length>256)throw new ProviderFailure('invalid-request');
  return this.transaction(async client=>{
   const previous=(await client.query('SELECT attempt,request_digest,state FROM agentci_model_attempts WHERE budget_id=$1 AND request_id=$2 ORDER BY attempt',[this.scope.id,input.requestId])).rows;
   if(previous.some(row=>row.request_digest!==input.requestDigest))throw new ProviderFailure('invalid-request');
   // A replay never dispatches twice, including after a crash with unknown outcome.
   if(previous.some(row=>row.attempt===input.attempt))throw new ProviderFailure('ambiguous-attempt');
   if(input.attempt!==previous.length+1||previous.some(row=>row.state==='reserved'))throw new ProviderFailure('invalid-request');
   const total=(await client.query("SELECT COALESCE(sum(CASE WHEN state='settled' THEN actual_usd_micros WHEN state IN ('reserved','unknown') THEN reserved_usd_micros ELSE 0 END),0)::text AS total FROM agentci_model_attempts WHERE budget_id=$1",[this.scope.id])).rows[0].total;
   if(BigInt(total)+BigInt(input.upperBoundUsdMicros)>BigInt(this.scope.limitUsdMicros))throw new ProviderFailure('budget-exhausted');
   const id=randomUUID();await client.query('INSERT INTO agentci_model_attempts(id,budget_id,request_id,request_digest,attempt,reserved_usd_micros,pricing_revision) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,this.scope.id,input.requestId,input.requestDigest,input.attempt,input.upperBoundUsdMicros,input.pricingRevision]);return id;
  });
 }
 private async transition(id:string,state:'settled'|'unknown'|'released',actual:number|null){
  if(!uuid.test(id)||actual!==null&&!amount(actual))throw new ProviderFailure('invalid-request');
  await this.transaction(async client=>{
   const row=(await client.query('SELECT state,actual_usd_micros FROM agentci_model_attempts WHERE budget_id=$1 AND id=$2',[this.scope.id,id])).rows[0];
   if(!row)throw new ProviderFailure('invalid-request');
   if(row.state===state&&row.actual_usd_micros===(actual===null?null:String(actual)))return;
   if(row.state!=='reserved'&&!(row.state==='unknown'&&state==='settled'))throw new ProviderFailure('ambiguous-attempt');
   // Actual overruns are recorded in full, preventing further reservations.
   await client.query('UPDATE agentci_model_attempts SET state=$3,actual_usd_micros=$4,updated_at=clock_timestamp() WHERE budget_id=$1 AND id=$2',[this.scope.id,id,state,actual]);
  });
 }
 settle(id:string,actual:number){return this.transition(id,'settled',actual);}
 unknown(id:string){return this.transition(id,'unknown',null);}
 releaseNotSent(id:string){return this.transition(id,'released',null);}
}
