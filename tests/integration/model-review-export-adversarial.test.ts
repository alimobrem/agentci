import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {once} from 'node:events';import {createServer} from 'node:http';
import {modelReviewExportStorage} from '../helpers/model-review-export-storage.ts';
import {FindingHistoryStore} from '../../packages/storage/finding-history.ts';
import {ModelReviewExportVerifier} from '../../packages/reviewers/export.ts';
import {modelReviewRoutes} from '../../apps/control/model-reviews.ts';
import {streamModelReviewExport} from '../../apps/control/model-review-export.ts';
const turn=()=>new Promise<void>(resolve=>setImmediate(resolve));
test('real PG snapshot releases all connections before streaming and excludes later results and history',{timeout:10000},async()=>{
 const f=await modelReviewExportStorage();try{
  const queued=await f.exports.prepare(f.request.id);
  // The fixture pool has max2: both acquisitions prove prepare retained no connection.
  const first=await f.pool.connect();const second=await f.pool.connect();first.release();second.release();
  await f.execute();const old=[];for await(const frame of queued.frames())old.push(frame);assert.deepEqual(old.map(x=>x.type),['header','end']);assert.equal(queued.header.review.execution.state,'queued');assert.equal(queued.header.missingRoleIds.length,2);
  const completed=await f.exports.prepare(f.request.id),finding=completed.header.findings[0]!;assert.ok(finding);assert.equal(finding.throughVersion,1);
  const history=new FindingHistoryStore(f.pool,f.scope,{reviewer:async()=>{throw Error('unused');},receipt:async()=>{throw Error('unused');}});await history.transition(finding.id,f.request.subject,{type:'queue'},1,randomUUID());
  const verifier=new ModelReviewExportVerifier(f.request);let events=0;for await(const frame of completed.frames()){await verifier.push(frame);if(frame.type==='finding'){events++;assert.equal(frame.data.event.finding.version,1);}}
  assert.equal(verifier.finish().complete,true);assert.equal(events,1);assert.equal((await f.exports.prepare(f.request.id)).header.findings[0]!.throughVersion,2);
 }finally{await f.close();}
});
test('real HTTP caps concurrent exports and client interruption releases its slot without an end frame',{timeout:10000},async()=>{
 const f=await modelReviewExportStorage();let release!:()=>void;const gate=new Promise<void>(r=>release=r);let exits=0;
 try{
  const prepare=f.control.exportReview!.bind(f.control);f.control.exportReview=async id=>{const captured=await prepare(id);return {...captured,async *frames(signal?:AbortSignal){try{const iterator=captured.frames(signal);const first=await iterator.next();assert.ok(!first.done);yield first.value;await Promise.race([gate,new Promise<void>(resolve=>signal?.addEventListener('abort',()=>resolve(),{once:true}))]);signal?.throwIfAborted();for await(const frame of iterator)yield frame;}finally{exits++;}}};};
  const a=await f.get(),b=await f.get();assert.equal(a.status,200);assert.equal(b.status,200);assert.equal((await f.get()).status,503);
  const reader=a.body!.getReader(),prefix=await reader.read();assert.ok(prefix.value);const verifier=new ModelReviewExportVerifier(f.request);for(const line of Buffer.from(prefix.value!).toString().trim().split('\n'))await verifier.push(JSON.parse(line));assert.throws(()=>verifier.finish());await reader.cancel();
  const deadline=Date.now()+2000;while(exits<1&&Date.now()<deadline)await turn();assert.equal(exits,1);await turn();
  const c=await f.get();assert.equal(c.status,200);release();await b.text();await c.text();
 }finally{release();await f.close();}
});
test('HTTP stream deadline aborts an incomplete prefix and cannot certify snapshot completion',{timeout:10000},async()=>{
 const f=await modelReviewExportStorage();const captured=await f.exports.prepare(f.request.id);let ended=false;
 const server=createServer((_req,res)=>{void streamModelReviewExport(res,async()=>({...captured,async *frames(signal?:AbortSignal){const iterator=captured.frames(signal),first=await iterator.next();assert.ok(!first.done);yield first.value;await new Promise<void>(resolve=>signal?.addEventListener('abort',()=>resolve(),{once:true}));signal?.throwIfAborted();ended=true;}}),{id:f.request.id,...f.scope},250).catch(()=>res.destroy());});
 server.listen(0,'127.0.0.1');await once(server,'listening');try{
  const response=await fetch(`http://127.0.0.1:${(server.address() as {port:number}).port}`),reader=response.body!.getReader(),verifier=new ModelReviewExportVerifier(f.request);let interrupted=false;
  try{for(;;){const {done,value}=await reader.read();if(done)break;for(const line of Buffer.from(value).toString().trim().split('\n'))await verifier.push(JSON.parse(line));}}catch{interrupted=true;}
  assert.equal(interrupted,true);assert.equal(ended,false);assert.throws(()=>verifier.finish());
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await f.close();}
});
test('HTTP deadline before snapshot preparation returns bounded503 without a successful stream', {timeout:10000},async()=>{
 const f=await modelReviewExportStorage(),captured=await f.exports.prepare(f.request.id);let release!:()=>void;const gate=new Promise<void>(r=>release=r);
 const server=createServer((_req,res)=>{void streamModelReviewExport(res,async()=>{await gate;return captured;},{id:f.request.id,...f.scope},40).catch(()=>res.destroy());});server.listen(0,'127.0.0.1');await once(server,'listening');
 try{const response=await fetch(`http://127.0.0.1:${(server.address() as {port:number}).port}`);assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:{code:'service-unavailable'}});assert.match(response.headers.get('content-type')!,/application\/json/);}finally{release();await turn();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await f.close();}
});
test('iterator failure after the end frame still aborts HTTP instead of certifying transport EOF',{timeout:10000},async()=>{
 const f=await modelReviewExportStorage(),captured=await f.exports.prepare(f.request.id);let release!:()=>void;const gate=new Promise<void>(r=>release=r);
 const server=createServer((_req,res)=>{void streamModelReviewExport(res,async()=>({...captured,async *frames(signal?:AbortSignal){for await(const frame of captured.frames(signal))yield frame;await gate;throw Error('post-end-fixture-failure');}}),{id:f.request.id,...f.scope}).catch(()=>res.destroy());});server.listen(0,'127.0.0.1');await once(server,'listening');
 try{const response=await fetch(`http://127.0.0.1:${(server.address() as {port:number}).port}`),reader=response.body!.getReader(),verifier=new ModelReviewExportVerifier(f.request);let buffer='',endSeen=false,cleanEof=false,interrupted=false;
  try{for(;;){const {done,value}=await reader.read();if(done){cleanEof=true;break;}buffer+=Buffer.from(value).toString();for(;;){const newline=buffer.indexOf('\n');if(newline<0)break;const frame=JSON.parse(buffer.slice(0,newline));buffer=buffer.slice(newline+1);await verifier.push(frame);if(frame.type==='end'){endSeen=true;release();}}}}catch{interrupted=true;}
  assert.equal(endSeen,true);assert.equal(interrupted,true);assert.equal(cleanEof,false);
 }finally{release();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await f.close();}
});
test('socket backpressure and disconnect release the service export concurrency slot',{timeout:10000},async()=>{
 const f=await modelReviewExportStorage(),responses:import('node:http').ServerResponse[]=[],aborts=[new AbortController(),new AbortController()];
 const route=modelReviewRoutes(f.config,f.control),server=createServer({highWaterMark:1},(req,res)=>{void route(req,res).catch(()=>res.destroy());});
 // Cork only the two marked sockets: their first valid header cannot drain.
 server.prependListener('request',(req,res)=>{if(req.headers['x-fixture-backpressure']==='true'){res.cork();responses.push(res);}});
 server.listen(0,'127.0.0.1');await once(server,'listening');const url=`http://127.0.0.1:${(server.address() as {port:number}).port}/v1/model-reviews/${f.request.id}/export`,headers={authorization:`Bearer ${f.config.evidenceToken}`};
 try{
  const pending=aborts.map(controller=>fetch(url,{headers:{...headers,'x-fixture-backpressure':'true'},signal:controller.signal}).catch(error=>error));
  const deadline=Date.now()+2000;while((responses.length<2||responses.some(r=>!r.headersSent||r.writableLength===0))&&Date.now()<deadline)await turn();assert.equal(responses.length,2);assert.ok(responses.every(r=>r.writableLength>0));
  assert.equal((await fetch(url,{headers})).status,503);aborts[0]!.abort();await pending[0];
  let recovered=false;for(let attempt=0;attempt<20;attempt++){await turn();const response=await fetch(url,{headers});if(response.status===200){await response.text();recovered=true;break;}assert.equal(response.status,503);}
  assert.equal(recovered,true);aborts[1]!.abort();await pending[1];
 }finally{aborts.forEach(a=>a.abort());server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await f.close();}
});
