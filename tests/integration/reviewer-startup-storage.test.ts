import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import type {Octokit} from '@octokit/rest';
import {createReviewerRuntime} from '../../packages/runtime/reviewers.ts';
import {initializeReviewerController} from '../../apps/worker/reviewer-runtime.ts';

const url=process.env.AGENTCI_TEST_DATABASE_URL;
if(!url)throw Error('Reviewer startup acceptance requires real PostgreSQL; never silently skip');
for(const missing of ['011_m3_review_summaries','012_m3_review_recovery']){
 test(`configured reviewer startup rejects missing ${missing} before retaining profiles`,{timeout:30000},async()=>{
  const schema=`startup_${randomUUID().replaceAll('-','')}`,admin=new Pool({connectionString:url});
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool=new Pool({connectionString:url,options:`-c search_path=${schema}`});
  try{
   const migrations=['004_m3_model_budget','005_m3_reviewer_results','006_m3_finding_history','008_m3_review_admissions','009_m3_review_dispatch','010_m3_reviewer_profiles','011_m3_review_summaries','012_m3_review_recovery'];
   for(const name of migrations.filter(name=>name!==missing))await pool.query(await readFile(new URL(`../../deploy/migrations/${name}.sql`,import.meta.url),'utf8'));
   const definition=JSON.parse(await readFile(new URL('../../deploy/reviewers.synthetic.example.json',import.meta.url),'utf8'));
   const runtime=createReviewerRuntime(definition,{}),config={organizationId:randomUUID(),repository:'fixture/repo',installationId:1};
   // Startup must not need GitHub, provider credentials or network requests.
   const github={} as Octokit;
   await assert.rejects(initializeReviewerController(pool,github,config,runtime),/^Error: reviewer-runtime-storage-unavailable$/);
   assert.equal((await pool.query('SELECT count(*) FROM agentci_reviewer_profiles')).rows[0].count,'0');
   await pool.query(await readFile(new URL(`../../deploy/migrations/${missing}.sql`,import.meta.url),'utf8'));
   const controller=await initializeReviewerController(pool,github,config,runtime);
   assert.equal(typeof controller.activities.runAdmittedReview,'function');
   assert.equal((await pool.query('SELECT count(*) FROM agentci_reviewer_profiles')).rows[0].count,'1');
  }finally{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
 });
}
