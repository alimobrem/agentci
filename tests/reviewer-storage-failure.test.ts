import test from 'node:test';
import assert from 'node:assert/strict';
import type {Pool} from 'pg';
import {readFileSync} from 'node:fs';
import {ReviewerResultStore, ReviewerResultConflict, ReviewerResultUnavailable} from '../packages/storage/reviewer-results.ts';
const fixture = JSON.parse(readFileSync(new URL('../specs/api/fixtures/reviewer-result.json', import.meta.url), 'utf8'));
const scope = {organizationId: fixture.subject.organizationId, repository: fixture.subject.repository, budgetId:'00000000-0000-4000-8000-000000000002'};
const unavailable = (error: unknown) => error instanceof ReviewerResultUnavailable && error.message === 'reviewer-result-unavailable' && !('cause' in error);

test('reviewer store redacts connection and transaction outages and discards connections after rollback failure', async () => {
  const disconnected = new ReviewerResultStore({async connect(){throw new Error('postgres://private:secret@host');}} as unknown as Pool, scope);
  await assert.rejects(disconnected.get(fixture.requestId,fixture.subject),unavailable);
  for (const rollbackFails of [false,true]) {
    const statements:string[]=[]; const releases:boolean[]=[];
    const client={async query(sql:string){
      statements.push(sql);
      if(sql.startsWith('SELECT') || (sql==='ROLLBACK' && rollbackFails))throw new Error('sensitive database detail');
      return {rows:[]};
    },release(broken:boolean){releases.push(broken);}};
    const store=new ReviewerResultStore({async connect(){return client;}} as unknown as Pool,scope);
    await assert.rejects(store.get(fixture.requestId,fixture.subject),unavailable);
    assert.equal(statements.at(-1),'ROLLBACK');
    assert.deepEqual(releases,[rollbackFails]);
    assert.ok(!statements.includes('COMMIT'));
  }
});

test('reviewer store distinguishes corrupted evidence from transport failure and fences invalid IDs before connecting',async()=>{
  let connections=0;const releases:boolean[]=[];const statements:string[]=[];
  const store=new ReviewerResultStore({async connect(){connections++;return {
    async query(sql:string){statements.push(sql);return {rows:sql.startsWith('SELECT')?[{result:{private:'sensitive payload'}}]:[]};},
    release(broken:boolean){releases.push(broken);},
  };}} as unknown as Pool,scope);
  await assert.rejects(store.get('invalid',fixture.subject),ReviewerResultConflict);
  assert.equal(connections,0);
  await assert.rejects(store.get(fixture.requestId,fixture.subject),error=>error instanceof ReviewerResultConflict && error.message==='reviewer-result-conflict');
  assert.equal(statements.at(-1),'ROLLBACK');assert.deepEqual(releases,[false]);
});
