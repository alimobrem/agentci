import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createServer as createTlsServer} from 'node:https';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {runHttpTrial,validateHttpProvider,type HttpProviderPolicy} from '../packages/evals/http.ts';
import {evalSuite} from './fixtures/evals.ts';
import {executeComparison,executeModelMatrix,executeSuite,compareRuns} from '../packages/evals/execution.ts';
import {validateEvalSuite} from '../packages/evals/contracts.ts';
const revision='sha256:'+'c'.repeat(64);
const suite=evalSuite({runner:{adapter:'http',provider:'example',timeoutMs:1000,maxOutputBytes:1024},trials:{count:1,passRate:1,confidenceMethod:'wilson'}});
const snapshot={sha:'a'.repeat(40),files:{'subject.txt':'good','.env.example':'synthetic-deployment-template'}};
test('HTTP provider configuration belongs to the operator, requires pinned IP and verified HTTPS',()=>{
  const base={id:'example',revision,endpoint:'https://provider.example/evaluate',address:'203.0.113.10'};
  const credentialUrl=new URL(base.endpoint);credentialUrl.username='synthetic-user';credentialUrl.password='synthetic-password';
  assert.equal(validateHttpProvider(base).hostname,'provider.example');
  for(const patch of [{revision:'latest'},{address:'provider.example'},{endpoint:credentialUrl.href},{endpoint:'https://provider.example/evaluate?token=x'},{endpoint:'https://provider.example/evaluate#fragment'},{endpoint:'http://provider.example/evaluate',allowInsecureLoopbackForTests:true},{endpoint:'http://127.0.0.1/evaluate',address:'127.0.0.1'},{endpoint:'https://127.0.0.1/evaluate'},{authorization:'Bearer x\r\nCookie: bad'},{authorization:'Bearer \u2603'},{maxRequestBytes:Infinity}])assert.throws(()=>validateHttpProvider({...base,...patch}));
});
test('real HTTP transport binds input identity and contains redirects, errors, deadlines, cancellation and payload limits',async()=>{
  let mode='passed',requests=0;const ids=new Set<string>();
  const server=createServer((req,res)=>{
    requests++;
    const chunks:Buffer[]=[];req.on('data',chunk=>chunks.push(chunk));req.on('end',()=>{
      if(mode==='hang')return;
      if(mode==='redirect'){res.writeHead(307,{location:'http://127.0.0.1:1/leak'});res.end();return;}
      if(mode==='private-error'){res.writeHead(500,{'content-type':'application/json'});res.end('synthetic private provider token');return;}
      if(mode==='wrong-media'){res.writeHead(200,{'content-type':'text/plain'});res.end('no');return;}
      if(mode==='compressed'){res.writeHead(200,{'content-type':'application/json','content-encoding':'gzip'});res.end('no');return;}
      if(mode==='disconnect'){req.socket.destroy();return;}
      if(mode==='oversized'){res.writeHead(200,{'content-type':'application/json'});res.end('x'.repeat(4096));return;}
      const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      assert.equal(req.method,'POST');assert.equal(req.headers.authorization,'Bearer synthetic-eval-only');
      assert.equal(input.files['.env.example'],undefined);assert.equal(input.files['subject.txt'],'good');
      assert.equal(input.sourceSha,snapshot.sha);assert.equal(input.providerRevision,revision);
      assert.ok(!ids.has(input.requestId));ids.add(input.requestId);
      const response:Record<string,unknown>={apiVersion:input.apiVersion,kind:'HttpEvalResponse',requestId:input.requestId,sourceSha:input.sourceSha,inputDigest:input.inputDigest,suiteRevision:input.suiteRevision,providerRevision:input.providerRevision,results:[{scenario:'safe-response',status:mode==='failed'?'failed':'passed'}]};
      if(mode==='wrong-identity')response.sourceSha='b'.repeat(40);
      if(mode==='wrong-revision')response.providerRevision='sha256:'+'d'.repeat(64);
      if(mode==='wrong-suite')response.suiteRevision='sha256:'+'d'.repeat(64);
      if(mode==='wrong-input')response.inputDigest='sha256:'+'d'.repeat(64);
      if(mode==='wrong-request')response.requestId='00000000-0000-4000-8000-000000000000';
      if(mode==='wrong-model')response.model='unrequested-model';
      if(mode==='unknown-field')response.privateDetail='synthetic private provider token';
      res.writeHead(200,{'content-type':'application/json'});res.end(mode==='malformed'?'not JSON':JSON.stringify(response));
    });
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const address=server.address();assert.ok(address&&typeof address==='object');
  const policy:HttpProviderPolicy={id:'example',revision,endpoint:`http://127.0.0.1:${address.port}/evaluate`,address:'127.0.0.1',allowInsecureLoopbackForTests:true,authorization:'Bearer synthetic-eval-only'};
  try{
    for(const status of ['passed','failed']){mode=status;const result=await runHttpTrial(snapshot,suite,policy);assert.equal(result.status,'completed');assert.equal(JSON.parse(result.report!).results[0].status,status);assert.deepEqual(result.provider,{id:'example',revision});}
    for(const [fault,error] of [['redirect','provider-protocol'],['private-error','provider-protocol'],['wrong-media','provider-protocol'],['compressed','provider-protocol'],['disconnect','provider-connection'],['oversized','response-limit'],['wrong-identity','provider-response'],['wrong-revision','provider-response'],['wrong-suite','provider-response'],['wrong-input','provider-response'],['wrong-request','provider-response'],['wrong-model','provider-response'],['unknown-field','provider-response'],['malformed','provider-response']]){
      mode=fault!;const before=requests;const result=await runHttpTrial(snapshot,suite,policy);assert.equal(result.status,'error');assert.equal(result.error,error);assert.equal(requests,before+1,'a redirect must not dispatch another request');assert.ok(!JSON.stringify(result).includes('private provider token'));
    }
    mode='hang';const fast=structuredClone(suite);fast.spec.runner.timeoutMs=50;
    assert.equal((await runHttpTrial(snapshot,fast,policy)).status,'timeout');
    const abort=new AbortController();const pending=runHttpTrial(snapshot,suite,policy,{signal:abort.signal});setTimeout(()=>abort.abort(),20);assert.equal((await pending).status,'cancelled');
    const before=requests;assert.equal((await runHttpTrial(snapshot,suite,policy,{signal:AbortSignal.abort()})).status,'cancelled');assert.equal(requests,before);
    assert.equal((await runHttpTrial({...snapshot,files:{'subject.txt':'x'.repeat(2048)}},suite,{...policy,maxRequestBytes:1024})).error,'request-limit');assert.equal(requests,before);
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test('HTTPS verifies the operator trust root and pinned destination before sending eval credentials or input',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'agentci-http-tls-'));let requests=0;
  try{
    execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(directory,'key.pem'),'-out',join(directory,'cert.pem'),'-days','1','-subj','/CN=provider.example','-addext','subjectAltName=DNS:provider.example'],{stdio:'ignore'});
    const server=createTlsServer({key:readFileSync(join(directory,'key.pem')),cert:readFileSync(join(directory,'cert.pem'))},(req,res)=>{requests++;const chunks:Buffer[]=[];req.on('data',chunk=>chunks.push(chunk));req.on('end',()=>{assert.equal(req.headers.authorization,'Bearer synthetic-eval-only');const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));const {apiVersion,requestId,sourceSha,inputDigest,suiteRevision,providerRevision}=input;res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({apiVersion,kind:'HttpEvalResponse',requestId,sourceSha,inputDigest,suiteRevision,providerRevision,results:[{scenario:'safe-response',status:'passed'}]}));});});
    server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();assert.ok(address&&typeof address==='object');
    try{
      const policy={id:'example',revision,endpoint:`https://provider.example:${address.port}/evaluate`,address:'127.0.0.1',authorization:'Bearer synthetic-eval-only'};
      const result=await runHttpTrial(snapshot,suite,policy);
      assert.equal(result.status,'error');assert.equal(result.error,'provider-connection');assert.equal(requests,0);
      const trusted=await runHttpTrial(snapshot,suite,{...policy,tlsCa:readFileSync(join(directory,'cert.pem'),'utf8')});assert.equal(trusted.status,'completed');assert.equal(requests,1);
      const wrongHost=await runHttpTrial(snapshot,suite,{...policy,endpoint:`https://wrong.example:${address.port}/evaluate`,tlsCa:readFileSync(join(directory,'cert.pem'),'utf8')});assert.equal(wrongHost.error,'provider-connection');assert.equal(requests,1);
    }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
  }finally{rmSync(directory,{recursive:true,force:true});}
});
test('HTTP suites use the default trial pipeline, stable baseline assertions, model matrix and provider provenance',async()=>{
  let broken=false;const models=new Set<string>();
  const server=createServer((req,res)=>{
    const chunks:Buffer[]=[];req.on('data',chunk=>chunks.push(chunk));req.on('end',()=>{
      const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      assert.equal(input.files['evals/assertion.txt'],'hello');
      if(input.model)models.add(input.model);
      const {apiVersion,requestId,sourceSha,inputDigest,suiteRevision,providerRevision,model}=input;
      res.writeHead(200,{'content-type':'application/json'});
      res.end(JSON.stringify({apiVersion,kind:'HttpEvalResponse',requestId,sourceSha,inputDigest,suiteRevision,providerRevision,...(model===undefined?{}:{model}),results:broken?[]:[{scenario:'safe-response',status:input.files['subject.txt']===input.files['evals/assertion.txt']?'passed':'failed'}]}));
    });
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();assert.ok(address&&typeof address==='object');
  const provider:HttpProviderPolicy={id:'example',revision,endpoint:`http://127.0.0.1:${address.port}/evaluate`,address:'127.0.0.1',allowInsecureLoopbackForTests:true};
  const policy={image:'sha256:'+'b'.repeat(64),httpProviders:[provider]};
  const baseline={sha:'a'.repeat(40),files:{'subject.txt':'hello','evals/assertion.txt':'hello'}};
  const head={sha:'b'.repeat(40),files:{'subject.txt':'bad','evals/assertion.txt':'bad'}};
  const config=evalSuite({runner:{adapter:'http',provider:'example',harness:['evals/assertion.txt'],timeoutMs:1000},trials:{count:3,passRate:1,confidenceMethod:'wilson'}});
  try{
    const comparison=await executeComparison('example/repo',baseline,head,config,policy);
    assert.equal(comparison.base.status,'passed');assert.equal(comparison.head.status,'failed');assert.deepEqual(comparison.regressions,['safe-response']);
    assert.equal(comparison.head.scenarios[0]!.failed,3);assert.equal(comparison.head.runnerImage,undefined);assert.deepEqual(comparison.head.runnerProvider,{id:'example',revision});
    assert.throws(()=>compareRuns(comparison.base,{...comparison.head,runnerProvider:{id:'example',revision:'sha256:'+'d'.repeat(64)}}),/same baseline/);
    const modelConfig=structuredClone(config);modelConfig.spec.models=['model-a','model-b'];modelConfig.spec.trials.count=1;
    const matrix=await executeModelMatrix('example/repo',baseline,head,modelConfig,policy);assert.equal(matrix.complete,true);assert.deepEqual([...models].sort(),['model-a','model-b']);assert.equal(matrix.comparisons.length,2);
    broken=true;assert.equal((await executeSuite('example/repo',baseline,config,policy)).status,'error');
    await assert.rejects(executeSuite('example/repo',baseline,config,{image:policy.image}),/configured operator provider/);
    await assert.rejects(executeSuite('example/repo',baseline,config,{...policy,httpProviders:[provider,provider]}),/exactly one/);
    assert.throws(()=>validateEvalSuite({...config,spec:{...config.spec,runner:{...config.spec.runner,command:['node','untrusted.mjs']}}}),/Invalid/);
    assert.throws(()=>validateEvalSuite({...config,spec:{...config.spec,runner:{...config.spec.runner,provider:'https://untrusted.example'}}}),/Invalid/);
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
