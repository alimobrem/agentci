import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {readFile} from 'node:fs/promises';import {Pool} from 'pg';
import {canonical,digest} from '../../packages/review/engine.ts';import {createReproductionApprovalRegistry} from '../../packages/findings/approval-registry.ts';import {FindingHistoryStore} from '../../packages/storage/finding-history.ts';import {reproductionFixture} from '../fixtures/reproduction.ts';
const url=process.env.AGENTCI_TEST_DATABASE_URL;if(!url)throw Error('Reproduction approval race acceptance requires real PostgreSQL');
test('two selected approvals cannot both queue the same finding version; stale selections are not reservations',async()=>{
 const schema=`approval_${randomUUID().replaceAll('-','')}`,admin=new Pool({connectionString:url});await admin.query(`CREATE SCHEMA ${schema}`);const pool=new Pool({connectionString:url,options:`-c search_path=${schema}`});
 try{
  await pool.query(await readFile(new URL('../../deploy/migrations/006_m3_finding_history.sql',import.meta.url),'utf8'));
  const f=reproductionFixture(),subject=f.initial.subject,scope={organizationId:subject.organizationId,repository:subject.repository};
  const history=new FindingHistoryStore(pool,scope,{reviewer:async()=>({result:f.reviewer,documents:f.documents}),receipt:async()=>{throw Error('No receipt permitted');}});
  await history.create(f.initial,subject,randomUUID());
  const registry=await createReproductionApprovalRegistry([{current:f.initial,plan:f.plan,base:f.base,head:f.head}]);
  const selectors=Array.from({length:2},()=>registry.select({subject,expectedVersion:1,operationId:randomUUID(),approvalId:f.plan.id,approvalDigest:digest(canonical(f.plan))},f.initial));
  const results=await Promise.allSettled(selectors.map(s=>history.transition(f.initial.id,subject,{type:'queue'},s.request.expectedVersion,s.request.operationId)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
  const records=await history.get(f.initial.id,subject);assert.equal(records.length,2);assert.deepEqual(records[1]!.event.finding,f.plan.finding);
  const winner=results.findIndex(r=>r.status==='fulfilled'),selected=selectors[winner]!;
  assert.deepEqual(await history.transition(f.initial.id,subject,{type:'queue'},1,selected.request.operationId),records[1]);
  assert.throws(()=>registry.select(selected.request,records[1]!.event.finding),/invalid-reproduction-approval/);
  // A future mutation coordinator must replay its own full selector ledger before
  // current-version selection; history's queue ledger alone does not bind approvalDigest.
 }finally{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
