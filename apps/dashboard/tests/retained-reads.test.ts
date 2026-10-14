import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,type ServerResponse} from 'node:http';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {readFindingHistory,readReviewExport} from '../lib/retained-reads';
import {historyEnvelope,exportEnvelope} from '../lib/retained-envelope';
import {retainedProtocol} from './helpers/retained-protocol';
const admission=JSON.parse(await readFile(new URL('../../../specs/api/drafts/model-review-examples.json',import.meta.url),'utf8')).request;
const protocol=await retainedProtocol(admission),readToken='retained-read-fixture-'.repeat(3),principal={issuer:'https://fixture.example',subject:'reader',organizationId:admission.subject.organizationId,repositories:[admission.subject.repository]};
async function fixture(t:any,handler:(path:URL,response:ServerResponse)=>void){
 let mutations=0,calls=0;const server=createServer((req,res)=>{calls++;if(req.method!=='GET')mutations++;assert.equal(req.headers.authorization,`Bearer ${readToken}`);handler(new URL(req.url!,'http://fixture'),res);});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());}));
 return {binding:{admission,apiOrigin:`http://127.0.0.1:${(server.address() as {port:number}).port}`,readToken},calls:()=>calls,mutations:()=>mutations};
}
const send=(res:ServerResponse,value:unknown)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(value));};
test('history retains pinned evidence separately from complete later watermark and rejects changed watermark',async t=>{
 let changed=false,wrongPin=false;const f=await fixture(t,(path,res)=>{if(path.pathname.endsWith('/history')){const later=path.searchParams.has('cursor'),page=protocol.page(later);if(wrongPin)page.items=[later?protocol.alternateSecond:protocol.alternateFirst];send(res,changed&&later?{...page,throughVersion:3}:page);}else send(res,path.pathname.endsWith('/findings')?protocol.manifest:protocol.status);});
 const result=await readFindingHistory(principal,f.binding,protocol.first.event.finding.id);assert.equal(result.complete,true);assert.equal(result.throughVersion,2);assert.equal(result.pageCount,2);assert.equal(result.records[0]!.digest,protocol.status.summary.summary.findings[0]!.digest);assert.equal((await historyEnvelope(result,admission,result.findingId,protocol.first.digest)).records[1]!.digest,protocol.second.digest);changed=true;await assert.rejects(readFindingHistory(principal,f.binding,result.findingId));changed=false;wrongPin=true;await assert.rejects(readFindingHistory(principal,f.binding,result.findingId),/summary-pinned/);assert.equal(f.mutations(),0);
});
test('export buffer is never released before actual EOF and rejects malformed/truncated/forged transport',async t=>{
 let response:ServerResponse|undefined,body=protocol.stream,held=true;
 const f=await fixture(t,(_path,res)=>{res.setHeader('content-type','application/x-ndjson');response=res;if(held)res.write(body);else res.end(body);});
 let complete=false;const pending=readReviewExport(principal,f.binding).then(data=>{complete=true;return data;});while(!response)await new Promise(resolve=>setTimeout(resolve,5));await new Promise(resolve=>setTimeout(resolve,20));assert.equal(complete,false,'valid end on held socket is not completion');response.end();const result=await pending;assert.equal((await exportEnvelope(result,admission)).certificate.complete,true);assert.ok(!JSON.stringify(result).includes(readToken));
 held=false;for(const broken of [protocol.stream.trimEnd(),protocol.stream+JSON.stringify(protocol.frames.at(-1))+'\n',protocol.stream.replace(protocol.frames[1]!.digest,'sha256:'+'f'.repeat(64))]){body=broken;await assert.rejects(readReviewExport(principal,f.binding));}
 const forged=structuredClone(result);forged.records.pop();await assert.rejects(exportEnvelope(forged,admission));await assert.rejects(exportEnvelope(result,{...admission,subject:{...admission.subject,headSha:'f'.repeat(40)}}));assert.equal(f.mutations(),0);
});
test('caller interruption releases actual held history and export sockets before any further traversal',async t=>{
 for(const kind of ['history','export']){
  let signalStart:()=>void=()=>{},signalClose:()=>void=()=>{},historyReads=0;
  const f=await fixture(t,(path,res)=>{if(path.pathname.endsWith('/history')){historyReads++;if(!path.searchParams.has('cursor')){send(res,protocol.page(false));return;}}
   else if(!path.pathname.endsWith('/export')){send(res,path.pathname.endsWith('/findings')?protocol.manifest:protocol.status);return;}
   res.once('close',()=>signalClose());if(kind==='export'){res.setHeader('content-type','application/x-ndjson');res.write(protocol.stream);}signalStart();
  });const controller=new AbortController(),started=new Promise<void>(resolve=>{signalStart=resolve;}),closed=new Promise<void>(resolve=>{signalClose=resolve;});
  const operation=kind==='history'?readFindingHistory(principal,f.binding,protocol.first.event.finding.id,controller.signal):readReviewExport(principal,f.binding,controller.signal);const rejected=assert.rejects(operation);await started;controller.abort();await rejected;await closed;assert.equal(f.mutations(),0);if(kind==='history')assert.equal(historyReads,2);
  const before=f.calls();await assert.rejects(readReviewExport({...principal,organizationId:'other'},f.binding));assert.equal(f.calls(),before,'tenant authorization precedes backend request');
 }
});
