import test from 'node:test';import assert from 'node:assert/strict';import {once} from 'node:events';import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';import {createServer} from 'node:http';import {Ajv} from 'ajv';import {createRequire} from 'node:module';import SwaggerParser from '@apidevtools/swagger-parser';
import {createControlApi} from '../apps/control/server.ts';import {AgentCIClient,AgentCIError} from '../packages/client/index.ts';
import {comparisonFixture} from './fixtures/comparison.ts';import {webhookConfig as config} from './fixtures/control.ts';
import {comparisonRecord} from '../packages/evals/comparison.ts';
import {exportFixture} from './fixtures/export.ts';
const contract:any=await SwaggerParser.dereference(JSON.parse(readFileSync(new URL('../specs/api/openapi.json',import.meta.url),'utf8'))),ajv=new Ajv({strict:false});createRequire(import.meta.url)('ajv-formats')(ajv);
async function fixture(t:any){
 const record=await comparisonFixture(),state={record,unavailable:false,reads:0};
 const server=createControlApi(config,{ready:async()=>{},recordDelivery:async()=> 'accepted',evidence:async()=>undefined},{organizationId:record.comparison.organizationId,repository:config.repository,ready:async()=>{if(state.unavailable)throw new Error('private-database-error');},comparison:async id=>{state.reads++;if(state.unavailable)throw new Error('private-database-error');return id===record.id?state.record:undefined;},exportComparison:async function*(id){state.reads++;if(state.unavailable)throw new Error('private-database-error');if(id===record.id)yield* exportFixture(state.record);}});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
 const url=`http://127.0.0.1:${(server.address() as {port:number}).port}`,auth={authorization:`Bearer ${config.evidenceToken}`},expected={...record.comparison.subject,organizationId:record.comparison.organizationId,reviewId:record.comparison.reviewId,attemptId:record.comparison.attemptId};
 return {url,auth,record,state,expected,client:new AgentCIClient({url,token:config.evidenceToken})};
}
async function matches(response:Response){const body=await response.json();assert(ajv.validate(contract.paths['/v1/eval-comparisons/{id}'].get.responses[String(response.status)].content['application/json'].schema,body),JSON.stringify(ajv.errors));return body;}
test('comparison API authenticates before UUID disclosure and matches every documented response',async t=>{
 const f=await fixture(t),path=f.url+'/v1/eval-comparisons/';
 for(const id of ['invalid',randomUUID()]){const r=await fetch(path+id);assert.equal(r.status,401);await matches(r);}assert.equal(f.state.reads,0);
 const invalid=await fetch(path+'invalid',{headers:f.auth});assert.equal(invalid.status,400);await matches(invalid);assert.equal(f.state.reads,0);
 const missing=await fetch(path+randomUUID(),{headers:f.auth});assert.equal(missing.status,404);await matches(missing);
 const valid=await fetch(path+f.record.id,{headers:f.auth});assert.equal(valid.status,200);assert.equal(valid.headers.get('cache-control'),'no-store');assert.deepEqual(await matches(valid),f.record);
 const method=await fetch(path+f.record.id,{method:'POST',headers:f.auth});assert.equal(method.status,405);assert.equal(method.headers.get('allow'),'GET');await matches(method);
 f.state.unavailable=true;const down=await fetch(path+f.record.id,{headers:f.auth});assert.equal(down.status,503);const body=await matches(down);assert.ok(!JSON.stringify(body).includes('private-database-error'));assert.equal((await fetch(f.url+'/readyz')).status,503);
});
test('export authenticates and validates IDs before storage, and sanitizes startup failure',async t=>{
 const f=await fixture(t),path=f.url+'/v1/eval-comparisons/';
 const denied=await fetch(path+'invalid/export');assert.equal(denied.status,401);assert.equal(f.state.reads,0);
 const invalid=await fetch(path+'invalid/export',{headers:f.auth});assert.equal(invalid.status,400);assert.equal(f.state.reads,0);
 assert.equal((await fetch(path+randomUUID()+'/export',{headers:f.auth})).status,404);
 const method=await fetch(path+f.record.id+'/export',{method:'POST',headers:f.auth});assert.equal(method.status,405);assert.equal(method.headers.get('allow'),'GET');
 f.state.unavailable=true;const down=await fetch(path+f.record.id+'/export',{headers:f.auth});assert.equal(down.status,503);assert.ok(!(await down.text()).includes('private-database-error'));
});
test('export concurrency is bounded and abandoned HTTP streams release their slots',async t=>{
 const record=await comparisonFixture();let released=0;
 const server=createControlApi(config,{ready:async()=>{},recordDelivery:async()=> 'accepted',evidence:async()=>undefined},{organizationId:record.comparison.organizationId,repository:config.repository,ready:async()=>{},comparison:async()=>record,exportComparison:async function*(id,signal){
   if(id!==record.id)return;
   try{for await(const item of exportFixture(record)){yield item;if(item.type==='header'){await new Promise<void>(resolve=>{if(signal?.aborted)resolve();else signal?.addEventListener('abort',()=>resolve(),{once:true});});return;}}}finally{released++;}
 }});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
 const url=`http://127.0.0.1:${(server.address() as {port:number}).port}/v1/eval-comparisons/`,headers={authorization:`Bearer ${config.evidenceToken}`};
 const first=await fetch(url+record.id+'/export',{headers}),second=await fetch(url+record.id+'/export',{headers});assert.equal(first.status,200);assert.equal(second.status,200);
 const busy=await fetch(url+record.id+'/export',{headers});assert.equal(busy.status,503);assert.equal(busy.headers.get('retry-after'),'1');
 await first.body!.cancel();await second.body!.cancel();
 for(let i=0;i<100&&released!==2;i++)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(released,2);
 assert.equal((await fetch(url+randomUUID()+'/export',{headers})).status,404);
});
test('agent client verifies exact comparison scope, source, review, attempt, digest and derived result',async t=>{
 const f=await fixture(t);assert.deepEqual(await f.client.evalComparison(f.record.id,f.expected),f.record);
 for(const expected of [{...f.expected,organizationId:randomUUID()},{...f.expected,reviewId:randomUUID()},{...f.expected,attemptId:randomUUID()},{...f.expected,repository:'wrong/repo'},{...f.expected,headSha:'c'.repeat(40)},{...f.expected,pullRequest:2}])await assert.rejects(f.client.evalComparison(f.record.id,expected),/identity-mismatch/);
 await assert.rejects(f.client.evalComparison('invalid',f.expected),/invalid-comparison-id/);
 const wrong=new AgentCIClient({url:f.url,token:'x'.repeat(32)});await assert.rejects(wrong.evalComparison(f.record.id,f.expected),error=>error instanceof AgentCIError&&error.code==='unauthorized'&&!error.message.includes(config.evidenceToken));
 f.state.record={...f.record,digest:'sha256:'+'0'.repeat(64)};assert.equal((await fetch(f.url+'/v1/eval-comparisons/'+f.record.id,{headers:f.auth})).status,503);
 f.state.record={...f.record,comparison:{...f.record.comparison,summary:{...f.record.comparison.summary,outcome:'passed'}}};assert.equal((await fetch(f.url+'/v1/eval-comparisons/'+f.record.id,{headers:f.auth})).status,503);
});
test('comparison API rejects cross-scope records and oversized evidence without truncating results',async t=>{
 const f=await fixture(t),path=f.url+'/v1/eval-comparisons/'+f.record.id;
 f.state.record=comparisonRecord({...f.record.comparison,organizationId:randomUUID()});assert.equal((await fetch(path,{headers:f.auth})).status,503);
 const c=structuredClone(f.record.comparison);c.units[0]!.result!.subject.omittedInputs=Array.from({length:1100},(_,i)=>`.env.${i}-`+'x'.repeat(4000));
 f.state.record=comparisonRecord(c);const response=await fetch(path,{headers:f.auth});assert.equal(response.status,413);await matches(response);
 await assert.rejects(f.client.evalComparison(f.record.id,f.expected),/response-too-large/);
 let units=0,comparisons=0,completed=false;
 for await(const item of f.client.evalComparisonExport(f.record.id,f.expected)){if(item.type==='unit'){units++;if(item.data.side==='base')assert.equal(item.data.result!.subject.omittedInputs.length,1100);}if(item.type==='comparison')comparisons++;if(item.type==='summary'){completed=true;assert.equal(item.data.outcome,'failed');assert.equal(item.data.unitCount,2);}}
 assert.equal(units,2);assert.equal(comparisons,1);assert.ok(completed);
});
test('comparison client rejects provider redirects, malformed/forged evidence and oversized responses without private diagnostics',async t=>{
 const record=await comparisonFixture(),token='x'.repeat(32),state={value:record as unknown,status:200,redirect:false};
 const server=createServer((req,res)=>{assert.equal(req.headers.authorization,'Bearer '+token);if(state.redirect){res.writeHead(302,{location:'/elsewhere'});res.end();return;}res.writeHead(state.status,{'content-type':'application/json'});res.end(JSON.stringify(state.value));});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
 const client=new AgentCIClient({url:`http://127.0.0.1:${(server.address() as {port:number}).port}`,token}),expected={...record.comparison.subject,organizationId:record.comparison.organizationId,reviewId:record.comparison.reviewId,attemptId:record.comparison.attemptId};
 for(const value of [null,{...record,digest:'sha256:'+'0'.repeat(64)},{...record,comparison:{...record.comparison,summary:{...record.comparison.summary,outcome:'passed'}}}]){state.value=value;await assert.rejects(client.evalComparison(record.id,expected),/invalid-comparison/);}
 state.redirect=true;await assert.rejects(client.evalComparison(record.id,expected),/transport-failure/);state.redirect=false;
 state.value='x'.repeat(4*1024*1024);await assert.rejects(client.evalComparison(record.id,expected),/response-too-large/);
 state.value={error:{code:'private-provider-diagnostic'}};state.status=413;await assert.rejects(client.evalComparison(record.id,expected),error=>error instanceof AgentCIError&&error.code==='response-too-large'&&!error.message.includes('private-provider'));
});
