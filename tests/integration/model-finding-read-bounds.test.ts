import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {findingReadFixture} from '../helpers/finding-read-fixture.ts';import {canonical,digest} from '../../packages/review/engine.ts';import {FindingReads} from '../../packages/storage/finding-reads.ts';
import type {FindingHistoryEvent} from '../../packages/findings/history.ts';
test('maximum retained history uses signed predecessor checkpoints and one cumulative SQL deadline',{timeout:60000},async()=>{
 const f=await findingReadFixture();try{
  let previous=f.initial.digest;const events=[];
  for(let version=2;version<=10000;version++){
   const queued=version%2===0,receipt=queued?null:{findingId:f.finding.id,subjectDigest:digest(canonical(f.finding.subject)),evidenceDigest:digest('failed fixture execution'),assertionDigest:digest('fixture assertion'),actor:'reproduction' as const,outcome:'error' as const,reason:'Synthetic fixture error'};
   const action=queued?{type:'queue' as const}:{type:'reproduce' as const,receiptId:randomUUID()},finding={...f.finding,version,state:queued?'reproduction-pending' as const:'unconfirmed' as const,disposition:receipt?{kind:receipt.actor,evidenceDigest:receipt.evidenceDigest,reason:receipt.reason,outcome:receipt.outcome}:null};
   const event:FindingHistoryEvent={schemaVersion:'v1alpha1',operationId:randomUUID(),inputDigest:digest(canonical({id:f.finding.id,subject:f.finding.subject,action,expectedVersion:version-1})),previousDigest:previous,action,receipt,finding};previous=digest(canonical(event));events.push({version,operation_id:event.operationId,digest:previous,event});
  }
  await f.pool.query(`INSERT INTO agentci_finding_events(organization_id,repository,finding_id,version,operation_id,digest,event) SELECT $1,$2,$3,version,operation_id::uuid,digest,event FROM jsonb_to_recordset($4::jsonb) AS x(version int,operation_id text,digest text,event jsonb)`,[f.scope.organizationId,f.scope.repository,f.finding.id,JSON.stringify(events)]);
  const connect=f.pool.connect.bind(f.pool);let prefixQueries=0,watermarkQueries=0;
  const measured={connect:async()=>{const c=await connect(),query=c.query.bind(c);const q=async(text:string,values?:unknown[])=>{if(text.includes('sum(octet_length(event::text)) OVER'))prefixQueries++;if(text.includes('SELECT count(*) AS count,max(version)'))watermarkQueries++;return query(text,values);};return {query:q,release:()=>c.release()};}} as any;
  const reader=new FindingReads(measured,f.scope,f.config.cursorKey);let cursor:string|undefined,seen=0,pages=0;
  do{const page=await reader.history(f.request.id,f.finding.id,{limit:100,cursor});assert.equal(page.throughVersion,10000);assert.equal(page.items[0]!.event.finding.version,seen+1);seen+=page.items.length;cursor=page.nextCursor??undefined;pages++;}while(cursor);
  assert.equal(seen,10000);assert.equal(pages,100);assert.equal(watermarkQueries,1,'Whole-history byte/count scan happens only at initial snapshot');assert.equal(prefixQueries,400,'Each 25-record SQL batch is read once; continuations must not replay prefix');
  assert.equal((await reader.finding(f.request.id,f.finding.id)).event.finding.version,10000);
  // Expired cumulative budget is redacted before a further statement executes.
  let time=1_000,calls=0;const delayed={connect:async()=>{const c=await connect(),query=c.query.bind(c);return {query:async(text:string,values?:unknown[])=>{const r=await query(text,values);if(text.includes('FROM agentci_review_admissions'))time+=11_000;calls++;return r;},release:()=>c.release()};}} as any;
  await assert.rejects(new FindingReads(delayed,f.scope,f.config.cursorKey,()=>time).history(f.request.id,f.finding.id),{message:'service-unavailable',status:503});assert.ok(calls<10);
 }finally{await f.close();}
});
test('byte-limited history pages continue without omission even below requested item count',async()=>{
 const f=await findingReadFixture();try{
  const claim='x'.repeat(8000),base={...f.finding,claim,sources:Array.from({length:64},()=>({...f.finding.sources[0]!,requestId:randomUUID(),attemptId:randomUUID(),originalClaim:claim}))};
  const finding={...base,id:digest(canonical({subject:base.subject,mode:base.mode,category:base.category,claim,evidence:base.evidence}))};
  const {nameUuid}=await import('../../packages/evals/request-id.ts');let previous:string|null=null;const events=[];
  for(let version=1;version<=10;version++){
   const queued=version%2===0,receipt=version===1||queued?null:{findingId:finding.id,subjectDigest:digest(canonical(finding.subject)),evidenceDigest:digest('fixture'),assertionDigest:digest('assertion'),actor:'reproduction' as const,outcome:'error' as const,reason:'Synthetic fixture error'};
   const action=version===1?{type:'create' as const}:queued?{type:'queue' as const}:{type:'reproduce' as const,receiptId:randomUUID()},next={...finding,version,state:version===1?'deduplicated' as const:queued?'reproduction-pending' as const:'unconfirmed' as const,disposition:receipt?{kind:receipt.actor,evidenceDigest:receipt.evidenceDigest,reason:receipt.reason,outcome:receipt.outcome}:null};
   const event:FindingHistoryEvent={schemaVersion:'v1alpha1',operationId:version===1?nameUuid(f.request.id,`agentci:review-finding:v1:${finding.id}`):randomUUID(),inputDigest:digest(canonical(version===1?{type:'create',finding:next}:{id:finding.id,subject:finding.subject,action,expectedVersion:version-1})),previousDigest:previous,action,receipt,finding:next};previous=digest(canonical(event));events.push({version,operation_id:event.operationId,digest:previous,event});
  }
  await f.pool.query(`INSERT INTO agentci_finding_events(organization_id,repository,finding_id,version,operation_id,digest,event) SELECT $1,$2,$3,version,operation_id::uuid,digest,event FROM jsonb_to_recordset($4::jsonb) AS x(version int,operation_id text,digest text,event jsonb)`,[f.scope.organizationId,f.scope.repository,finding.id,JSON.stringify(events)]);
  const path=`/v1/findings/${encodeURIComponent(finding.id)}/history?reviewId=${f.request.id}&limit=100`,first=await f.get(path),raw=await first.text();assert.equal(first.status,200);assert.ok(Buffer.byteLength(raw)<=4*1024*1024);const page=JSON.parse(raw);assert.ok(page.items.length>0&&page.items.length<10);assert.ok(page.nextCursor);
  const rest=await (await f.get(path+`&cursor=${page.nextCursor}`)).json() as any;assert.equal(rest.items[0].event.finding.version,page.items.length+1);assert.equal(rest.nextCursor,null);assert.equal(page.items.length+rest.items.length,10);
 }finally{await f.close();}
});
