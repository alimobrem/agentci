import type {Pool,PoolClient} from 'pg';import {canonical,digest} from '../review/engine.ts';
import {loadReproductionConfig,validateReproductionConfig,type ReproductionConfigIdentity,type ReproductionConfigReaders,type ReproductionConfigReference} from '../findings/reproduction-config.ts';
export class ReproductionAuthorityConflict extends Error {constructor(){super('reproduction-authority-conflict');}}
const fail=():never=>{throw new ReproductionAuthorityConflict();};
/** Explicit operator writes are separate from startup reads. Callers must use
 * withApproval for a bounded SQL side effect, not cache detached permission. */
export class ReproductionAuthorityStore {
 constructor(private pool:Pool,private scope:{organizationId:string;repository:string},private readers:ReproductionConfigReaders,private permission:(reference:ReproductionConfigReference,signal:AbortSignal)=>Promise<boolean>){this.scope={...scope};}
 private async transaction<T>(fn:(c:PoolClient)=>Promise<T>){
  const c=await this.pool.connect();let released=false,timer:ReturnType<typeof setTimeout>|undefined;
  const destroy=()=>{if(!released){released=true;c.release(true);}},lost=()=>destroy();c.on('error',lost);
  try{
   await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'");await c.query("SET LOCAL statement_timeout='10s'");await c.query("SET LOCAL transaction_timeout='15s'");
   const result=await Promise.race([fn(c),new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>{destroy();reject(new ReproductionAuthorityConflict());},12000);})]);
   await c.query('COMMIT');return result;
  }catch(e){
   // Closing the connection rolls back at the server and rejects queued work.
   // Queuing ROLLBACK behind an in-flight query would let late callback SQL run
   // afterward in autocommit mode, even though this operation already failed.
   destroy();if(e instanceof ReproductionAuthorityConflict)throw e;throw Error('reproduction-authority-unavailable');
  }finally{if(timer)clearTimeout(timer);if(!released){released=true;c.release();}c.off('error',lost);}
 }
 private async permitted(ref:ReproductionConfigReference){
  const abort=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([this.permission(structuredClone(ref),abort.signal),new Promise<boolean>((_resolve,reject)=>{timer=setTimeout(()=>{abort.abort();reject(new ReproductionAuthorityConflict());},5000);})]);}finally{if(timer)clearTimeout(timer);abort.abort();}
 }
 private key(){return [this.scope.organizationId,this.scope.repository];}
 private async current(c:Pool|PoolClient,lock=false){const r=(await c.query(`SELECT a.revision,v.digest,v.config,v.expected FROM agentci_reproduction_authority a JOIN agentci_reproduction_config_versions v USING(organization_id,repository,revision) WHERE a.organization_id=$1 AND a.repository=$2${lock?' FOR SHARE OF a':''}`,this.key())).rows[0];if(r&&(r.digest!==digest(canonical(r.config))||r.config.revision!==Number(r.revision)||r.config.organizationId!==this.scope.organizationId||r.config.repository!==this.scope.repository))fail();return r;}
 async apply(value:unknown,expected:ReproductionConfigIdentity|null){
  expected=expected===null?null:structuredClone(expected);const loaded=await loadReproductionConfig(value,this.readers),{config,identity}=loaded;if(config.organizationId!==this.scope.organizationId||config.repository!==this.scope.repository)fail();
  return this.transaction(async c=>{await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[canonical([...this.key(),'reproduction-config'])]);const prior=await this.current(c);
   if(prior&&Number(prior.revision)===identity.revision&&prior.digest===identity.digest){if(canonical(prior.expected)!==canonical(expected))fail();return identity;}
   if(canonical(prior?{revision:Number(prior.revision),digest:prior.digest}:null)!==canonical(expected)||config.revision!==(prior?Number(prior.revision)+1:1))fail();
   // Lock the active pointer so concurrent permitted SQL work finishes before revocation.
   if(prior)await c.query('SELECT 1 FROM agentci_reproduction_authority WHERE organization_id=$1 AND repository=$2 FOR UPDATE',this.key());
   const tombstones=(await c.query('SELECT plan_id FROM agentci_reproduction_revocations WHERE organization_id=$1 AND repository=$2',this.key())).rows;
   if(config.approvals.some(r=>r.enabled&&tombstones.some(t=>t.plan_id===r.planId)))fail();
   const previous=prior?validateReproductionConfig(prior.config).approvals:[];
   for(const old of previous)if(old.enabled&&!config.approvals.some(r=>r.planId===old.planId&&r.enabled))await c.query('INSERT INTO agentci_reproduction_revocations(organization_id,repository,plan_id,revision) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[...this.key(),old.planId,config.revision]);
   for(const ref of config.approvals){const old=previous.find(r=>r.planId===ref.planId);if(old&&canonical({...old,enabled:ref.enabled})!==canonical(ref))fail();}
   await c.query('INSERT INTO agentci_reproduction_config_versions(organization_id,repository,revision,digest,config,expected) VALUES($1,$2,$3,$4,$5,$6)',[...this.key(),config.revision,identity.digest,config,expected]);
   await c.query('INSERT INTO agentci_reproduction_authority(organization_id,repository,revision) VALUES($1,$2,$3) ON CONFLICT(organization_id,repository) DO UPDATE SET revision=EXCLUDED.revision',[...this.key(),config.revision]);return identity;
  });
 }
 async read(expected:ReproductionConfigIdentity){expected=structuredClone(expected);const row=await this.current(this.pool);if(!row||canonical({revision:Number(row.revision),digest:row.digest})!==canonical(expected))fail();return validateReproductionConfig(row.config);}
 async withApproval<T>(expected:ReproductionConfigIdentity,planId:string,sideEffect:(c:PoolClient,reference:ReproductionConfigReference)=>Promise<T>):Promise<T>{
  expected=structuredClone(expected);return this.transaction(async c=>{const row=await this.current(c,true);if(!row||canonical({revision:Number(row.revision),digest:row.digest})!==canonical(expected))fail();const ref=validateReproductionConfig(row.config).approvals.find(r=>r.planId===planId);
   if(!ref||!ref.enabled||(await c.query('SELECT 1 FROM agentci_reproduction_revocations WHERE organization_id=$1 AND repository=$2 AND plan_id=$3',[...this.key(),planId])).rowCount)fail();
   const live=async()=>{if(!await this.permitted(ref!)||!(await c.query('SELECT clock_timestamp() < $1::timestamptz AS live',[ref!.expiresAt])).rows[0].live)fail();};
   await live();const result=await sideEffect(c,structuredClone(ref!));await live();return result;
  });
 }
}
