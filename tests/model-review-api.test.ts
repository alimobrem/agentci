import test from 'node:test';import assert from 'node:assert/strict';import {once} from 'node:events';import {request as httpRequest} from 'node:http';import {readFileSync} from 'node:fs';import {Ajv} from 'ajv';import SwaggerParser from '@apidevtools/swagger-parser';
import {createControlApi} from '../apps/control/server.ts';
import type {ModelReviewControl} from '../apps/control/model-reviews.ts';
import {webhookConfig} from './fixtures/control.ts';
import {canonical,digest} from '../packages/review/engine.ts';
import {validateModelReviewStatus,validateReviewerProfileList} from '../packages/reviewers/transport.ts';
const examples=JSON.parse(readFileSync(new URL('../specs/api/drafts/model-review-examples.json',import.meta.url),'utf8'));
const config={...webhookConfig,operatorToken:'operator-fixture-token-'.repeat(3)};
const contract:any=await SwaggerParser.dereference(JSON.parse(readFileSync(new URL('../specs/api/openapi.json',import.meta.url),'utf8'))),ajv=new Ajv({strict:false,validateFormats:false});
async function serve(t:any,control?:Partial<ModelReviewControl>){
 const backend:ModelReviewControl={scope:examples.request.subject,profiles:async()=>({schemaVersion:'v1alpha1',profiles:[]}),status:async id=>id===examples.request.id?examples.statuses.queued:undefined,cancel:async id=>id===examples.request.id?examples.cancellation:undefined,admit:async r=>({schemaVersion:'v1alpha1',id:r.id,requestDigest:digest(canonical(r))}),...control};
 const server=createControlApi(config,{ready:async()=>{},evidence:async()=>undefined,recordDelivery:async()=>'accepted'},undefined,backend);server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());}));const address=server.address();if(!address||typeof address==='string')throw Error();return `http://127.0.0.1:${address.port}`;
}
async function matches(response:Response,path:string,method:string):Promise<any>{const value=await response.json();assert(ajv.validate(contract.paths[path][method].responses[response.status].content['application/json'].schema,value),JSON.stringify(ajv.errors));assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-content-type-options'),'nosniff');return value;}
const auth=(token=config.operatorToken)=>({authorization:`Bearer ${token}`});
test('new routes enforce separate mutation credentials and preserve released read authorization',async t=>{
 const url=await serve(t);for(const token of [config.operatorToken,config.evidenceToken]){const response=await fetch(url+'/v1/reviewer-profiles',{headers:auth(token)});assert.equal(response.status,200);validateReviewerProfileList(await matches(response,'/v1/reviewer-profiles','get'));}
 const response=await fetch(url+'/v1/model-reviews',{method:'POST',headers:{...auth(config.evidenceToken),'content-type':'application/json'},body:JSON.stringify(examples.request)});assert.equal(response.status,403);assert.equal((await matches(response,'/v1/model-reviews','post')).error.code,'forbidden');
 assert.equal((await fetch(url+'/v1/reviewer-profiles')).status,401);
 assert.equal((await fetch(url+'/v1/evidence/'+examples.request.id,{headers:auth()})).status,401);
 assert.throws(()=>createControlApi({...config,operatorToken:config.evidenceToken},{ready:async()=>{},evidence:async()=>undefined,recordDelivery:async()=>'accepted'}),/credentials/);
});
test('admission validates content scope limits and returns bounded contract errors before invoking backend',async t=>{
 let calls=0;const url=await serve(t,{admit:async r=>{calls++;return {schemaVersion:'v1alpha1',id:r.id,requestDigest:digest(canonical(r))};}});
 const send=(body:any,headers:any={})=>fetch(url+'/v1/model-reviews',{method:'POST',headers:{...auth(),'content-type':'application/json',...headers},body});
 for(const [body,headers,status] of [['{',{},400],[new Uint8Array([0xff]),{},400],[JSON.stringify({...examples.request,credentials:'private'}),{},400],[JSON.stringify({...examples.request,subject:{...examples.request.subject,repository:'other/repo'}}),{},404],[JSON.stringify(examples.request),{'content-encoding':'gzip'},415],[JSON.stringify(examples.request),{'content-type':'text/plain'},415]] as const){const response=await send(body,headers);assert.equal(response.status,status);await matches(response,'/v1/model-reviews','post');}
 assert.equal(calls,0);const response=await send(JSON.stringify(examples.request));assert.equal(response.status,202);assert.equal(response.headers.get('location'),'/v1/model-reviews/'+examples.request.id);assert.equal((await matches(response,'/v1/model-reviews','post')).requestDigest,examples.accepted.requestDigest);assert.equal(calls,1);
 const wrong=await fetch(url+'/v1/model-reviews/'+examples.request.id+'?unknown=1',{headers:auth()});assert.equal(wrong.status,400);
 const method=await fetch(url+'/v1/reviewer-profiles',{method:'POST',headers:auth()});assert.equal(method.status,405);assert.equal(method.headers.get('allow'),'GET');
});
test('oversized unfinished chunked request receives 413 promptly without waiting for upload end',{timeout:5000},async t=>{
 let calls=0;const url=await serve(t,{admit:async()=>{calls++;throw Error('should not run');}});
 const response=await new Promise<{status:number;body:string}>( (resolve,reject)=>{
  const request=httpRequest(url+'/v1/model-reviews',{method:'POST',headers:{...auth(),'content-type':'application/json','transfer-encoding':'chunked'}},res=>{let body='';res.on('data',v=>body+=v);res.on('end',()=>{request.destroy();resolve({status:res.statusCode!,body});});});request.on('error',reject);request.write('x'.repeat(8192)); // deliberately never end the upload
 });assert.equal(response.status,413);assert.deepEqual(JSON.parse(response.body),{error:{code:'body-too-large'}});assert.equal(calls,0);
});
test('disabled admission preserves reads/cancel, validates returned digests and redacts backend outages',async t=>{
 const url=await serve(t,{admit:undefined});const response=await fetch(url+'/v1/model-reviews',{method:'POST',headers:{...auth(),'content-type':'application/json'},body:JSON.stringify(examples.request)});assert.equal(response.status,503);assert.equal(response.headers.get('retry-after'),'1');await matches(response,'/v1/model-reviews','post');
 const status=await fetch(url+'/v1/model-reviews/'+examples.request.id.toUpperCase(),{headers:auth(config.evidenceToken)});assert.equal(status.status,200);validateModelReviewStatus(await matches(status,'/v1/model-reviews/{id}','get'));
 const cancelled=await fetch(url+'/v1/model-reviews/'+examples.request.id+'/cancellation',{method:'POST',headers:auth()});assert.equal(cancelled.status,202);await matches(cancelled,'/v1/model-reviews/{id}/cancellation','post');
 const bad=await serve(t,{admit:async r=>({schemaVersion:'v1alpha1',id:r.id,requestDigest:'sha256:'+'f'.repeat(64)}),status:async()=>{throw Error('private-db-password');}});
 for(const [path,options] of [['/v1/model-reviews',{method:'POST',headers:{...auth(),'content-type':'application/json'},body:JSON.stringify(examples.request)}],['/v1/model-reviews/'+examples.request.id,{headers:auth()}]] as const){const result=await fetch(bad+path,options);assert.equal(result.status,503);assert.deepEqual(await result.json(),{error:{code:'service-unavailable'}});}
});
