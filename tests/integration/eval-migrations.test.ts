import test from 'node:test';import assert from 'node:assert/strict';import {Pool} from 'pg';import {randomUUID} from 'node:crypto';import {readFile} from 'node:fs/promises';
const databaseUrl=process.env.AGENTCI_TEST_DATABASE_URL;if(!databaseUrl)throw new Error('Migration concurrency acceptance requires actual PostgreSQL; never skip');
test('three concurrent callers initialize and repeat migrations on a fresh database',{timeout:30000},async()=>{
  const admin=new Pool({connectionString:databaseUrl}),name='agentci_migration_test_'+randomUUID().replaceAll('-','');
  const pools:Pool[]=[];let created=false;
  try{
    await admin.query(`CREATE DATABASE ${name}`);created=true;
    const url=new URL(databaseUrl);url.pathname='/'+name;
    const migrations=await Promise.all(['001_m1.sql','002_m2.sql','002_m2_eval_role.sql','003_m2_review_recovery.sql'].map(file=>readFile(new URL('../../deploy/migrations/'+file,import.meta.url),'utf8')));
    for(let i=0;i<3;i++)pools.push(new Pool({connectionString:url.toString(),max:1}));
    const apply=async(pool:Pool)=>{for(const sql of migrations)await pool.query(sql);};
    const results=await Promise.allSettled(pools.map(apply));for(const result of results)if(result.status==='rejected')throw result.reason;
    await Promise.all(pools.map(apply));
    const tables=(await pools[0]!.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'agentci_%' ORDER BY tablename")).rows.map(row=>row.tablename);
    assert.deepEqual(tables,['agentci_deliveries','agentci_eval_jobs','agentci_eval_trials','agentci_eval_units','agentci_jobs','agentci_review_attempts','agentci_reviews','agentci_schema_migrations','agentci_scope']);
    assert.equal((await pools[0]!.query("SELECT count(*)::int AS count FROM pg_trigger WHERE tgname IN('agentci_eval_job_immutable','agentci_eval_unit_immutable','agentci_eval_trial_immutable')")).rows[0].count,3);
    const privileges=(await pools[0]!.query("SELECT has_table_privilege('agentci_eval_executor','agentci_eval_trials','INSERT') AS checkpoint,has_table_privilege('agentci_eval_executor','agentci_reviews','SELECT') AS controller")).rows[0];
    assert.deepEqual(privileges,{checkpoint:true,controller:false});
    assert.equal((await pools[0]!.query("SELECT has_table_privilege('agentci_eval_executor','agentci_review_attempts','SELECT') AS allowed")).rows[0].allowed,false);
    const alteredRecovery=migrations[3]!.replace('-- BEGIN CHECKSUMMED MIGRATION BODY\n','-- BEGIN CHECKSUMMED MIGRATION BODY\n-- changed recovery source\n');await assert.rejects(pools[0]!.query(alteredRecovery),/source checksum mismatch/);await pools[0]!.query('ROLLBACK');
    await pools[1]!.query('BEGIN');await pools[1]!.query('LOCK TABLE agentci_eval_jobs,agentci_eval_units IN ROW EXCLUSIVE MODE');
    await pools[0]!.query("SET statement_timeout='1s'");
    try{await pools[0]!.query(migrations[1]!);}finally{await pools[1]!.query('ROLLBACK');await pools[0]!.query('ROLLBACK');await pools[0]!.query('SET statement_timeout=0');}
    const altered=migrations[1]!.replace('-- BEGIN CHECKSUMMED MIGRATION BODY\n','-- BEGIN CHECKSUMMED MIGRATION BODY\n-- changed source\n');
    await assert.rejects(pools[0]!.query(altered),/source checksum mismatch/);await pools[0]!.query('ROLLBACK');
    const checksum=(await pools[0]!.query("SELECT checksum FROM agentci_schema_migrations WHERE version='002_m2'")).rows[0].checksum;
    await pools[0]!.query("UPDATE agentci_schema_migrations SET checksum=repeat('0',64) WHERE version='002_m2'");
    await assert.rejects(pools[0]!.query(migrations[1]!),/checksum mismatch/);await pools[0]!.query('ROLLBACK');
    await pools[0]!.query("UPDATE agentci_schema_migrations SET checksum=$1 WHERE version='002_m2'",[checksum]);await apply(pools[0]!);
  }finally{await Promise.all(pools.map(pool=>pool.end()));if(created)await admin.query(`DROP DATABASE ${name}`);await admin.end();}
});
