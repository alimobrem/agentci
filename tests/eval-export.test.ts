import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {once} from 'node:events';
import {comparisonFixture} from './fixtures/comparison.ts';import {exportFixture} from './fixtures/export.ts';
import {frameExport,exportFrame,validateExportFrame,type ExportFrame} from '../packages/evals/export.ts';import {AgentCIClient} from '../packages/client/index.ts';
test('export hash chain rejects sequence, unknown keys, identity and digest substitutions',async()=>{
 const record=await comparisonFixture(),frames:ExportFrame[]=[];for await(const frame of frameExport(exportFixture(record)))frames.push(frame);
 let prior='sha256:'+'0'.repeat(64);for(let i=0;i<frames.length;i++){assert.equal(validateExportFrame(frames[i],i,prior),frames[i]);prior=frames[i]!.digest;}
 assert.throws(()=>validateExportFrame({...frames[0],unexpected:true},0,'sha256:'+'0'.repeat(64)),/identity/);
 assert.throws(()=>validateExportFrame({...frames[0],digest:'sha256:'+'1'.repeat(64)},0,'sha256:'+'0'.repeat(64)),/digest/);
 assert.throws(()=>validateExportFrame(frames[1],0,'sha256:'+'0'.repeat(64)),/identity/);
});
test('export consumer rejects truncation, reordered units, forged summaries, extra frames and scope substitution',async t=>{
 const record=await comparisonFixture(),frames:ExportFrame[]=[];for await(const frame of frameExport(exportFixture(record)))frames.push(frame);
 const state={frames,partial:false};const server=createServer((req,res)=>{res.writeHead(200,{'content-type':'application/x-ndjson'});for(const frame of state.frames)res.write(JSON.stringify(frame)+'\n');res.end(state.partial?'partial':'');});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
 const client=new AgentCIClient({url:`http://127.0.0.1:${(server.address() as {port:number}).port}`,token:'x'.repeat(32)}),c=record.comparison,expected={...c.subject,organizationId:c.organizationId,reviewId:c.reviewId,attemptId:c.attemptId};
 const collect=async()=>{const items=[];for await(const item of client.evalComparisonExport(record.id,expected))items.push(item);return items;};
 assert.equal((await collect()).at(-1)!.type,'summary');
 state.frames=frames.slice(0,-1);await assert.rejects(collect(),/incomplete-export/);
 state.frames=[frames[0]!,frames[2]!,frames[1]!,...frames.slice(3)];await assert.rejects(collect(),/invalid-export/);
 const summaryIndex=frames.findIndex(f=>f.type==='summary');state.frames=frames.map((f,i)=>i===summaryIndex?exportFrame({type:'summary',data:{...f.data as any,outcome:'passed'}},f.sequence,f.previousDigest):f);await assert.rejects(collect(),/invalid-export/);
 state.frames=[...frames,frames[0]!];await assert.rejects(collect(),/invalid-export/);
 state.frames=frames;state.partial=true;await assert.rejects(collect(),/invalid-export/);state.partial=false;
 await assert.rejects(async()=>{for await(const item of client.evalComparisonExport(record.id,{...expected,repository:'wrong/repo'}))void item;},/identity-mismatch/);
});
