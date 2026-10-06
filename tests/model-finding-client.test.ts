import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {canonical,digest} from '../packages/review/engine.ts';
import {buildReviewContext} from '../packages/reviewers/context.ts';
import {findingsFromReviewer,deduplicateFindings} from '../packages/findings/model.ts';
import {createFindingTransitions} from '../packages/findings/lifecycle.ts';
import {ModelReviewClient,AgentCIError} from '../packages/client/index.ts';
import type {FindingHistoryRecord} from '../packages/findings/history.ts';
const examples=JSON.parse(readFileSync(new URL('../specs/api/drafts/model-review-examples.json',import.meta.url),'utf8'));
const request=examples.request,token='finding-read-fixture-'.repeat(3);
const code=(expected:string)=>(error:unknown)=>error instanceof AgentCIError&&error.code===expected;
async function data(claim='Missing authorization'){
 const result=JSON.parse(readFileSync(new URL('../specs/api/fixtures/reviewer-result.json',import.meta.url),'utf8'));result.subject=request.subject;
 const docs=[{kind:'source',side:'head',path:'app.ts',content:'first\nsecond',digest:digest('first\nsecond')}];
 result.contextDigest=buildReviewContext(result.subject,docs).digest;
 result.response.structuredOutput={findings:[{category:'security',severity:'high',claim,evidence:[{side:'head',path:'app.ts',digest:docs[0]!.digest,startLine:1,endLine:2}]}]};
 result.proposal.output=structuredClone(result.response.structuredOutput);result.responseDigest=digest(canonical(result.response));
 const finding=deduplicateFindings(findingsFromReviewer(result,result.subject,docs),result.subject)[0]!;
 const firstEvent={schemaVersion:'v1alpha1' as const,operationId:randomUUID(),inputDigest:digest(canonical({type:'create',finding})),previousDigest:null,action:{type:'create' as const},receipt:null,finding};
 const first:FindingHistoryRecord={event:firstEvent,digest:digest(canonical(firstEvent))};
 const next=(await createFindingTransitions(async()=>{throw Error('unused');})(finding,{type:'queue'},1)).finding;
 const secondEvent={schemaVersion:'v1alpha1' as const,operationId:randomUUID(),inputDigest:digest(canonical({id:finding.id,subject:request.subject,action:{type:'queue'},expectedVersion:1})),previousDigest:first.digest,action:{type:'queue' as const},receipt:null,finding:next};
 return {first,second:{event:secondEvent,digest:digest(canonical(secondEvent))} as FindingHistoryRecord};
}
async function fixture(t:any,handler:(path:URL)=>unknown){
 const server=createServer((req,res)=>{assert.equal(req.headers.authorization,`Bearer ${token}`);const value=handler(new URL(req.url!,'http://localhost'));res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(value));});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());}));
 return new ModelReviewClient({url:`http://127.0.0.1:${(server.address() as any).port}`,readToken:token,maxAttempts:1});
}
const page=(records:FindingHistoryRecord[],nextCursor:string|null,throughVersion=2)=>({schemaVersion:'v1alpha1',reviewId:request.id,findingId:records[0]!.event.finding.id,throughVersion,items:records,nextCursor});

test('public client reads current and pinned versions independently and validates paginated lifecycle',async t=>{
 const {first,second}=await data();let pages=0;
 const client=await fixture(t,path=>{
  if(path.pathname===`/v1/model-reviews/${request.id}`)return examples.statuses.queued;
  assert.equal(path.searchParams.get('reviewId'),request.id);
  if(path.pathname.endsWith('/history')){assert.equal(path.searchParams.get('limit'),'1');pages++;return path.searchParams.has('cursor')?page([second],null):page([first],'opaque_cursor');}
  return path.searchParams.get('version')==='1'?first:second;
 });
 assert.equal((await client.finding(request,first.event.finding.id)).event.finding.state,'reproduction-pending');
 assert.deepEqual(await client.finding(request,first.event.finding.id,{version:1}),first);
 const records=[];for await(const p of client.findingHistory(request,first.event.finding.id,{limit:1}))records.push(...p.items);
 assert.deepEqual(records,[first,second]);assert.equal(pages,2);
});

test('history rejects changed watermark, missing prefix, cross-page lifecycle mutation and interrupted completion',async t=>{
 const {first,second}=await data();let mode='watermark';
 const client=await fixture(t,path=>{
  if(path.pathname===`/v1/model-reviews/${request.id}`)return examples.statuses.queued;
  if(mode==='prefix')return page([second],null);
  if(!path.searchParams.has('cursor'))return page([first],'opaque_cursor');
  if(mode==='watermark')return page([second],'another_cursor',3);
  if(mode==='truncated')return page([first],null);
  const mutated=structuredClone(second);mutated.event.finding.sources[0]!.originalClaim='  Missing authorization  ';mutated.digest=digest(canonical(mutated.event));return page([mutated],null);
 });
 for(mode of ['watermark','prefix','truncated','mutation']){
  let yielded=0;
  await assert.rejects(async()=>{for await(const _ of client.findingHistory(request,first.event.finding.id,{limit:1}))yielded++;});
  assert.equal(yielded,mode==='prefix'?0:1,'a yielded prefix is never completion');
 }
});

test('findings require a complete manifest and never return partial or substituted references',async t=>{
 const {first}=await data();const status=structuredClone(examples.statuses.awaitingFinalization);
 status.summary.summary.findings=[{id:first.event.finding.id,digest:first.digest}];status.summary.digest=digest(canonical(status.summary.summary));
 let mode='valid';
 const client=await fixture(t,path=>{
  if(path.pathname===`/v1/model-reviews/${request.id}`)return mode==='pending'?examples.statuses.queued:status;
  return {schemaVersion:'v1alpha1',reviewId:request.id,summaryDigest:status.summary.digest,items:mode==='omitted'?[]:[{id:first.event.finding.id,version:1,digest:mode==='substituted'?digest('new-version'):first.digest}],nextCursor:mode==='continued'?'opaque_cursor':null};
 });
 assert.deepEqual((await client.findings(request,{limit:1})).items,[{id:first.event.finding.id,version:1,digest:first.digest}]);
 for(const [next,error] of [['pending','review-not-complete'],['omitted','incomplete-findings'],['substituted','identity-mismatch'],['continued','invalid-response']]){mode=next!;await assert.rejects(client.findings(request),code(error!));}
});

test('read arguments and exact finding identity fail closed',async t=>{
 const {first}=await data();let calls=0;
 const client=await fixture(t,path=>{calls++;return path.pathname.startsWith('/v1/model-reviews/')?examples.statuses.queued:first;});
 for(const id of ['../token','sha256:BAD'])await assert.rejects(client.finding(request,id),code('invalid-request'));
 for(const limit of [0,101,1.5])await assert.rejects(client.findings(request,{limit}),code('invalid-request'));
 await assert.rejects(client.finding(request,first.event.finding.id,{version:10001}),code('invalid-request'));assert.equal(calls,0);
 await assert.rejects(client.finding(request,digest('different')),code('identity-mismatch'));
 await assert.rejects(client.finding(request,first.event.finding.id,{version:2}),code('identity-mismatch'));
});


test('executable finding CLI discovers reads and exits unsuccessfully for interrupted history',async t=>{
 const {first,second}=await data();let broken=false,calls=0;
 const server=createServer((req,res)=>{
  calls++;const path=new URL(req.url!,'http://localhost');
  if(broken&&path.searchParams.has('cursor')){res.writeHead(403,{'content-type':'application/json'});res.end(JSON.stringify({error:{code:'forbidden'}}));return;}
  const value=path.pathname===`/v1/model-reviews/${request.id}`?examples.statuses.queued:
   path.pathname.endsWith('/history')?path.searchParams.has('cursor')?page([second],null):page([first],'opaque_cursor'):first;
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(value));
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());}));
 const root=await mkdtemp(join(tmpdir(),'agentci-finding-cli-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const admission=join(root,'request.json');await writeFile(admission,JSON.stringify(request));
 const env={...process.env,AGENTCI_API_URL:`http://127.0.0.1:${(server.address() as any).port}`,AGENTCI_EVIDENCE_TOKEN:token,AGENTCI_OPERATOR_TOKEN:undefined};
 const exec=promisify(execFile),main=new URL('../cmd/agentci/main.ts',import.meta.url).pathname;
 const run=(args:string[])=>exec(process.execPath,['--import','tsx',main,...args],{env});
 for(const command of ['finding','model-review'])for(const flag of ['--help','-h']){
  const help=await run([command,flag]);assert.equal(help.stderr,'');assert.match(help.stdout,command==='finding'?/finding history/:/model-review findings/);
 }
 assert.equal(calls,0);
 const common=['--request',admission,'--id',first.event.finding.id];
 for(const args of [['show',...common,'--version','0'],['history',...common,'--limit','101'],['history',...common,'--version','1']])await assert.rejects(run(['finding',...args]),(e:any)=>e.code===2&&e.stdout===''&&!e.stderr.includes(token));
 assert.equal(calls,0);
 assert.deepEqual(JSON.parse((await run(['finding','show',...common,'--version','1'])).stdout),first);
 const complete=await run(['finding','history',...common,'--limit','1']);assert.equal(complete.stderr,'');assert.equal(JSON.parse(complete.stdout.trim().split('\n').at(-1)!).nextCursor,null);
 broken=true;
 await assert.rejects(run(['finding','history',...common,'--limit','1']),(e:any)=>{
  assert.equal(e.code,2);const prefix=JSON.parse(e.stdout.trim());assert.equal(prefix.nextCursor,'opaque_cursor');assert.deepEqual(JSON.parse(e.stderr),{error:{code:'forbidden'}});return true;
 });
});


test('pinned manifest traversal rejects cross-page reordering, repeats and changed summary',async t=>{
 const records=[(await data('First allegation')).first,(await data('Second allegation')).first].sort((a,b)=>a.event.finding.id.localeCompare(b.event.finding.id));
 const refs=records.map(r=>({id:r.event.finding.id,version:1,digest:r.digest}));
 const status=structuredClone(examples.statuses.awaitingFinalization);status.summary.summary.findings=refs.map(({id,digest})=>({id,digest}));status.summary.digest=digest(canonical(status.summary.summary));let mode='valid';
 const client=await fixture(t,path=>{
  if(path.pathname===`/v1/model-reviews/${request.id}`)return status;
  const second=path.searchParams.has('cursor');
  return {schemaVersion:'v1alpha1',reviewId:request.id,summaryDigest:second&&mode==='summary'?digest('different-summary'):status.summary.digest,
   items:[refs[second&&mode!=='repeat'?1:0]],nextCursor:second?null:'opaque_cursor'};
 });
 assert.deepEqual((await client.findings(request,{limit:1})).items,refs);
 for(mode of ['repeat','summary'])await assert.rejects(client.findings(request,{limit:1}),code('identity-mismatch'));
});


test('caller cancellation interrupts initial identity read and later history page',async t=>{
 const {first}=await data();let mode='status';let reached:()=>void=()=>{};
 const server=createServer((req,res)=>{
  const path=new URL(req.url!,'http://localhost');
  if(mode==='status'||path.searchParams.has('cursor')){reached();return;}
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(path.pathname.endsWith('/history')?page([first],'opaque_cursor'):examples.statuses.queued));
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());}));
 const client=new ModelReviewClient({url:`http://127.0.0.1:${(server.address() as any).port}`,readToken:token,timeoutMs:120000,maxAttempts:1});
 for(mode of ['status','later']){
  const controller=new AbortController();const waiting=new Promise<void>(resolve=>{reached=resolve;});
  let yielded=0;const operation=mode==='status'?client.findings(request,{signal:controller.signal}):(async()=>{for await(const _ of client.findingHistory(request,first.event.finding.id,{limit:1,signal:controller.signal}))yielded++;})();
  const rejected=assert.rejects(operation,code('transport-failure'));await waiting;controller.abort();
  await Promise.race([rejected,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Caller cancellation ignored')),1000);timer.unref();})]);
  assert.equal(yielded,mode==='status'?0:1);
 }
});
