import test from 'node:test';import assert from 'node:assert/strict';
// Registry responses model the external overwrite boundary, including ambiguous failures.
// @ts-expect-error operational ESM tool has no TypeScript declaration
import {assertUnusedImageTag} from '../scripts/image-publication.mjs';
const credentials={actor:'fixture-actor',token:'private-fixture-token'};
const response=(status:number)=>new Response('',{status});
test('publication refuses existing tags and ambiguous registry failures without leaking credentials',async()=>{
 for(const status of [200,401,403,429,500]){
  let calls=0;const request=async()=>++calls===1?Response.json({token:'private-registry-token'}):response(status);
  await assert.rejects(assertUnusedImageTag('eval-worker','0.3.0-m2',credentials,request),status===200?/already exists/:/inconclusive/);
 }
 for(const request of [async()=>response(401),async()=>Response.json({}),async()=>{throw new Error(credentials.token);}]){
  await assert.rejects(assertUnusedImageTag('api','0.3.0-m2',credentials,request),error=>error instanceof Error&&error.message.includes('inconclusive')&&!error.message.includes(credentials.token));
 }
});
test('publication allows only explicit authenticated absence for valid repository-scoped roles',async()=>{
 const calls:{url:string;options:any}[]=[];
 const request=async(url:any,options:any)=>{calls.push({url:String(url),options});return calls.length===1?Response.json({token:'scoped-token'}):response(404);};
 await assertUnusedImageTag('eval-engines','0.3.0-m2',credentials,request);
 assert.equal(new URL(calls[0]!.url).searchParams.get('scope'),'repository:alimobrem/agentci-eval-engines:pull,push');
 assert.equal(calls[1]!.url,'https://ghcr.io/v2/alimobrem/agentci-eval-engines/manifests/0.3.0-m2');assert.equal(calls[1]!.options.method,'HEAD');
 await assert.rejects(assertUnusedImageTag('../other','0.3.0-m2',credentials,request),/identity/);
 await assert.rejects(assertUnusedImageTag('api','latest',credentials,request),/identity/);
 await assert.rejects(assertUnusedImageTag('api','0.3.0-m2',{},request),/credentials/);
});
