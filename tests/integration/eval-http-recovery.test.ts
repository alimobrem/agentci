import test from 'node:test';import assert from 'node:assert/strict';import {Pool} from 'pg';
import {randomUUID,createHash} from 'node:crypto';import {createServer} from 'node:https';import {once} from 'node:events';
import {readFile,mkdtemp,rm} from 'node:fs/promises';import {execFileSync} from 'node:child_process';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {stringify} from 'yaml';import {parseYaml} from '../../packages/project/index.ts';
import {Store} from '../../packages/storage/postgres.ts';import {EvalStore} from '../../packages/storage/evals.ts';
import {analyze,canonical,digest} from '../../packages/review/engine.ts';import {executeStoredUnit} from '../../apps/eval-worker/unit.ts';
import {runHttpTrial,type HttpProviderPolicy} from '../../packages/evals/http.ts';import {evalSuite} from '../fixtures/evals.ts';
const databaseUrl=process.env.AGENTCI_TEST_DATABASE_URL;
if(!databaseUrl)throw new Error('HTTP checkpoint retry acceptance requires real PostgreSQL; never silently skip');
const org='00000000-0000-4000-8000-000000000001',repository='example/repo',sha=()=>createHash('sha1').update(randomUUID()).digest('hex');
test('real HTTPS provider deduplicates an interrupted trial and rejects conflicting request-ID reuse',{timeout:30000},async()=>{
  const directory=await mkdtemp(join(tmpdir(),'agentci-http-recovery-')),pool=new Pool({connectionString:databaseUrl});
  let server:ReturnType<typeof createServer>|undefined;
  try{
    execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(directory,'key.pem'),'-out',join(directory,'cert.pem'),'-days','1','-subj','/CN=provider.example','-addext','subjectAltName=DNS:provider.example'],{stdio:'ignore'});
    const cert=await readFile(join(directory,'cert.pem'),'utf8'),requests:string[]=[],cache=new Map<string,{hash:string;response:unknown}>();let executions=0;
    server=createServer({key:await readFile(join(directory,'key.pem')),cert},(req,res)=>{
      const chunks:Buffer[]=[];req.on('data',chunk=>chunks.push(chunk));req.on('end',()=>{
        assert.equal(req.headers.authorization,'Bearer synthetic-provider-only');
        const input=JSON.parse(Buffer.concat(chunks).toString('utf8')),hash=digest(canonical(input)),prior=cache.get(input.requestId);requests.push(input.requestId);
        res.setHeader('content-type','application/json');
        if(prior&&prior.hash!==hash){res.statusCode=409;res.end(JSON.stringify({error:'request-id-conflict'}));return;}
        if(prior){res.end(JSON.stringify(prior.response));return;}
        executions++;const {apiVersion,requestId,sourceSha,inputDigest,suiteRevision,providerRevision}=input;
        const response={apiVersion,kind:'HttpEvalResponse',requestId,sourceSha,inputDigest,suiteRevision,providerRevision,results:[{scenario:'safe-response',status:'passed',costUsd:0.01,totalTokens:10}]};
        cache.set(requestId,{hash,response});res.end(JSON.stringify(response));
      });
    });server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();assert.ok(address&&typeof address==='object');
    const provider:HttpProviderPolicy={id:'recovery',revision:'sha256:'+'c'.repeat(64),endpoint:`https://provider.example:${address.port}/eval`,address:'127.0.0.1',tlsCa:cert,authorization:'Bearer synthetic-provider-only'};
    for(const file of ['001_m1.sql','002_m2.sql'])await pool.query(await readFile(new URL('../../deploy/migrations/'+file,import.meta.url),'utf8'));
    const reviewStore=new Store(pool,org,repository);await reviewStore.ready();const store=new EvalStore(pool,org,repository);
    const config=parseYaml(await readFile(new URL('../../agentci.yaml',import.meta.url),'utf8')) as any;config.spec.specifications.include=['specs/**'];
    const base={sha:sha(),files:{'agentci.yaml':stringify(config),'specs/overview.md':'HTTP recovery fixture.','subject.txt':'good'}},head={sha:sha(),files:{...base.files,'subject.txt':'changed'}};
    const review=await reviewStore.save(analyze({repository,base,head}),1),suite=evalSuite({runner:{adapter:'http',provider:'recovery',timeoutMs:5000},trials:{count:3,passRate:1,confidenceMethod:'wilson'}});
    const stage=async()=> (await store.stage(review.id,randomUUID(),base,head,[{suite,side:'base',assertionSide:'base',runner:{runnerProvider:{id:provider.id,revision:provider.revision}}}],{suiteChanges:[],coverageGaps:[],selectionGaps:[]})).unitIds[0]!;
    const unit=await stage(),policy={image:'sha256:'+'f'.repeat(64),httpProviders:[provider]},record=store.recordTrial.bind(store);let interruption:string|undefined='before';
    store.recordTrial=async(...args)=>{if(interruption==='before'){interruption=undefined;throw new Error('Simulated interruption before checkpoint commit');}await record(...args);if(interruption==='after'){interruption=undefined;throw new Error('Simulated interruption after checkpoint commit');}};
    await assert.rejects(executeStoredUnit(store,unit,policy),/before checkpoint commit/);assert.equal(executions,1);assert.equal(await store.trial(unit,0),undefined);
    interruption='after';await assert.rejects(executeStoredUnit(store,unit,policy),/after checkpoint commit/);
    assert.equal(executions,1);assert.equal(requests.length,2);assert.ok(await store.trial(unit,0));
    const result=await executeStoredUnit(store,unit,policy);assert.equal(result.status,'passed');assert.equal(executions,3);assert.equal(requests.length,4);assert.equal(requests[0],requests[1]);assert.equal(new Set(requests).size,3);
    await executeStoredUnit(store,unit,policy);assert.equal(requests.length,4,'completed redelivery must not issue a provider request');
    const nextUnit=await stage();await executeStoredUnit(store,nextUnit,policy);assert.equal(executions,6);assert.equal(new Set(requests).size,6,'distinct immutable units must not share request IDs');
    const conflicting=await runHttpTrial({...base,files:{...base.files,'subject.txt':'other'}},suite,provider,{requestId:requests[0]});assert.equal(conflicting.status,'error');assert.equal(conflicting.error,'provider-protocol');assert.equal(executions,6);
    const before=requests.length;await assert.rejects(runHttpTrial(base,suite,provider,{requestId:'invalid'}),/request UUID/);assert.equal(requests.length,before);
  }finally{if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()));}await pool.end();await rm(directory,{recursive:true,force:true});}
});
