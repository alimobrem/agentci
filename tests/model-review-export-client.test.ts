import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,type ServerResponse} from 'node:http';
import {once} from 'node:events';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ModelReviewClient,AgentCIError,type ModelReviewExportOutput} from '../packages/client/index.ts';
import {modelReviewExportFrame,MAX_MODEL_EXPORT_FRAME_BYTES} from '../packages/reviewers/export.ts';
const examples=JSON.parse(await readFile(new URL('../specs/api/drafts/model-review-examples.json',import.meta.url),'utf8'));
const request=examples.request,header=examples.exportHeader,token='export-read-fixture-'.repeat(3);
const end=modelReviewExportFrame({type:'end',data:{snapshotDigest:header.data.snapshotDigest,reviewerCount:0,eventCount:0,lastContentDigest:header.digest}},1,header.digest);
const line=(value:unknown)=>JSON.stringify(value)+'\n',stream=line(header)+line(end);
const code=(expected:string)=>(e:unknown)=>e instanceof AgentCIError&&e.code===expected;
async function fixture(t:any,handler:(res:ServerResponse)=>void){
 let calls=0;
 const server=createServer((req,res)=>{calls++;assert.equal(req.url,`/v1/model-reviews/${request.id}/export`);assert.equal(req.headers.authorization,`Bearer ${token}`);handler(res);});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());}));
 const url=`http://127.0.0.1:${(server.address() as any).port}`;
 return {client:new ModelReviewClient({url,readToken:token}),url,calls:()=>calls};
}
const ndjson=(res:ServerResponse,body:string|Buffer)=>{res.writeHead(200,{'content-type':'application/x-ndjson'});res.end(body);};

test('export records including end stay provisional until actual EOF',async t=>{
 let response:ServerResponse|undefined;
 const {client}=await fixture(t,res=>{response=res;res.writeHead(200,{'content-type':'application/x-ndjson'});res.write(stream);});
 const iterator=client.modelReviewExport(request);
 for(const type of ['header','end']){const record=(await iterator.next()).value!;assert.equal(record.type,'record');if(record.type==='record'){assert.equal(record.provisional,true);assert.equal(record.frame.type,type);}}
 let complete=false;const next=iterator.next().then(value=>{complete=true;return value;});
 await new Promise(resolve=>setTimeout(resolve,20));assert.equal(complete,false);response!.end();
 const certified=(await next).value!;assert.equal(certified.type,'complete');if(certified.type==='complete'){assert.equal(certified.data.complete,true);assert.equal(certified.data.endDigest,end.digest);}
 assert.equal((await iterator.next()).done,true);
});

test('export never certifies missing end, partial final line, trailing frames or invalid UTF-8',async t=>{
 let body:string|Buffer=stream;
 const {client}=await fixture(t,res=>ndjson(res,body));
 for(const broken of [line(header),stream.trimEnd(),stream+'\n',stream+line(end),Buffer.concat([Buffer.from(line(header)),Buffer.from([0xc0,0xaf,10])]),line({...header,sequence:1})+line(end)]){
  body=broken;const outputs:ModelReviewExportOutput[]=[];await assert.rejects(async()=>{for await(const r of client.modelReviewExport(request))outputs.push(r);});
  assert.ok(outputs.every(r=>r.type==='record'));
 }
});

test('export rejects wrong admission, oversized frames and private errors without retry',async t=>{
 let mode='identity';
 const {client,calls}=await fixture(t,res=>{
  if(mode==='error'){res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({error:{code:token}}));return;}
  ndjson(res,mode==='large'?' '.repeat(MAX_MODEL_EXPORT_FRAME_BYTES+1):stream);
 });
 await assert.rejects(async()=>{for await(const _ of client.modelReviewExport({...request,subject:{...request.subject,pullRequest:8}})){}},code('invalid-export'));
 mode='large';await assert.rejects(async()=>{for await(const _ of client.modelReviewExport(request)){}},code('response-too-large'));
 mode='error';await assert.rejects(async()=>{for await(const _ of client.modelReviewExport(request)){}},e=>code('invalid-response')(e)&&!String(e).includes(token));
 assert.equal(calls(),3,'stream errors never retry');
});

test('export abort after provisional data cannot produce completion',async t=>{
 const {client}=await fixture(t,res=>{res.writeHead(200,{'content-type':'application/x-ndjson'});res.write(line(header));});
 const controller=new AbortController(),iterator=client.modelReviewExport(request,{signal:controller.signal});
 assert.equal((await iterator.next()).value!.type,'record');controller.abort();await assert.rejects(iterator.next(),code('transport-failure'));
});

test('buffered export respects cancellation while the consumer pauses between records',async t=>{
 t.mock.method(globalThis,'fetch',async()=>new Response(stream,{headers:{'content-type':'application/x-ndjson'}}));
 const client=new ModelReviewClient({url:'https://export.fixture.invalid',readToken:token});
 for(const consumed of [1,2]){
  const controller=new AbortController(),iterator=client.modelReviewExport(request,{signal:controller.signal});
  for(let i=0;i<consumed;i++)assert.equal((await iterator.next()).value!.type,'record');
  controller.abort();
  await assert.rejects(iterator.next(),code('transport-failure'));
 }
});

test('executable export emits completion only on full stream and exits2 on a valid prefix',async t=>{
 let complete=true;const {url}=await fixture(t,res=>ndjson(res,complete?stream:line(header)));
 const root=await mkdtemp(join(tmpdir(),'agentci-export-cli-'));t.after(()=>rm(root,{recursive:true,force:true}));const file=join(root,'request.json');await writeFile(file,JSON.stringify(request));
 const exec=promisify(execFile),main=new URL('../cmd/agentci/main.ts',import.meta.url).pathname;
 const env={...process.env,AGENTCI_API_URL:url,AGENTCI_EVIDENCE_TOKEN:token,AGENTCI_OPERATOR_TOKEN:undefined};
 const args=['--import','tsx',main,'model-review','export','--request',file];
 const result=await exec(process.execPath,args,{env});assert.equal(result.stderr,'');assert.equal(JSON.parse(result.stdout.trim().split('\n').at(-1)!).type,'complete');
 complete=false;await assert.rejects(exec(process.execPath,args,{env}),(e:any)=>{assert.equal(e.code,2);assert.equal(JSON.parse(e.stdout.trim()).type,'record');assert.deepEqual(JSON.parse(e.stderr),{error:{code:'incomplete-export'}});return true;});
});
