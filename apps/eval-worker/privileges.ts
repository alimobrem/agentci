import type {Pool} from 'pg';
/** Fail closed even when a broad login can assume the executor group. It must use a separate low-privilege login. */
export async function requireEvalPrivileges(pool:Pool):Promise<void>{
  const role=(await pool.query('SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
  if(!role||Object.values(role).some(Boolean))throw new Error('Eval worker requires a restricted database login');
  if((await pool.query("SELECT has_schema_privilege(current_user,'public','CREATE') OR has_database_privilege(current_user,current_database(),'CREATE') AS allowed")).rows[0].allowed)throw new Error('Eval worker cannot create database objects');
  for(const table of ['agentci_reviews','agentci_deliveries','agentci_jobs']){
    const exists=(await pool.query('SELECT to_regclass($1) AS relation',[`public.${table}`])).rows[0].relation;
    if(!exists)continue;
    const row=(await pool.query("SELECT has_table_privilege(current_user,$1,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS allowed",[`public.${table}`])).rows[0];
    if(row.allowed)throw new Error('Eval worker must not access controller tables');
  }
  for(const table of ['agentci_scope','agentci_eval_jobs','agentci_eval_units','agentci_eval_trials']){
    const row=(await pool.query("SELECT has_table_privilege(current_user,$1,'SELECT') AS allowed, has_table_privilege(current_user,$1,'DELETE,TRUNCATE,TRIGGER') AS broad",[`public.${table}`])).rows[0];
    if(!row.allowed||row.broad)throw new Error('Invalid eval worker database grants');
  }
  for(const column of ['status','lease_token','lease_until','result','result_digest','completed_at']){
    if(!(await pool.query("SELECT has_column_privilege(current_user,'public.agentci_eval_units',$1,'UPDATE') AS allowed",[column])).rows[0].allowed)throw new Error('Missing eval execution grants');
  }
  for(const column of ['id','job_id','suite_id','model_key','side','definition','digest','created_at'])if((await pool.query("SELECT has_column_privilege(current_user,'public.agentci_eval_units',$1,'UPDATE') AS allowed",[column])).rows[0].allowed)throw new Error('Eval worker cannot alter unit definitions');
  if((await pool.query("SELECT has_table_privilege(current_user,'public.agentci_eval_units','INSERT') OR has_table_privilege(current_user,'public.agentci_eval_trials','UPDATE') AS allowed")).rows[0].allowed)throw new Error('Eval worker cannot stage units or rewrite observations');
  for(const table of ['agentci_scope','agentci_eval_jobs'])if((await pool.query("SELECT has_table_privilege(current_user,$1,'INSERT,UPDATE') AS allowed",[`public.${table}`])).rows[0].allowed)throw new Error('Eval worker cannot stage or alter controller inputs');
  if(!(await pool.query("SELECT has_table_privilege(current_user,'public.agentci_eval_trials','INSERT') AS allowed")).rows[0].allowed)throw new Error('Missing eval checkpoint grant');
}
