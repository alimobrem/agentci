import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {Octokit} from '@octokit/rest';
import {trustedGitBlobSeed} from '../packages/github/git-object-seed.ts';
import {createRemoteSnapshotReader} from '../packages/github/client.ts';
const repository='seed-fixture/repo',commit='1'.repeat(40),tree='2'.repeat(40);
const blob=(bytes:Buffer)=>createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
async function repo(t:any){
 const root=await mkdtemp(join(tmpdir(),'agentci-seed-adversarial-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const git=(...args:string[])=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();git('init','-q');
 const put=(bytes:Buffer)=>execFileSync('git',['-C',root,'hash-object','-w','--stdin'],{encoding:'utf8',input:bytes}).trim();
 return {root,git,put};
}
function api(bytes:Buffer){
 const counts={commit:0,tree:0,blob:0};let denyTree=false;
 return {counts,deny:()=>{denyTree=true;},client:{git:{
  getCommit:async()=>{counts.commit++;return {data:{sha:commit,tree:{sha:tree}}};},
  getTree:async()=>{counts.tree++;if(denyTree)throw Error('tree-authorization-denied');return {data:{sha:tree,truncated:false,tree:[{path:'file.txt',type:'blob',mode:'100644',sha:blob(bytes),size:bytes.length}]}};},
  getBlob:async()=>{counts.blob++;return {data:{sha:blob(bytes),encoding:'base64',content:bytes.toString('base64')}};}
 }} as any};
}

test('real tree and commit objects cannot masquerade as seeded blobs',async t=>{
 const f=await repo(t),seed=trustedGitBlobSeed(f.root,repository);
 const treeSha=f.git('mktree');
 const commitSha=execFileSync('git',['-C',f.root,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit-tree',treeSha,'-m','fixture'],{encoding:'utf8'}).trim();
 for(const sha of [treeSha,commitSha])await assert.rejects(seed.read(sha,Number(f.git('cat-file','-s',sha))),/Local Git object mismatch/);
});

test('seed ignores hostile Git environment and actual configured smudge and hook commands',async t=>{
 const f=await repo(t),other=await repo(t),bytes=Buffer.from('raw bytes\n'),sha=f.put(bytes),marker=join(f.root,'filter-ran');
 await writeFile(join(f.root,'.gitattributes'),'*.txt filter=tripwire\n');
 // Paths are generated safe fixture paths; the positive control proves this
 // Git filter is executable, rather than merely checking an inert script.
 f.git('config','filter.tripwire.smudge',`touch '${marker}'; cat`);
 execFileSync('git',['-C',f.root,'cat-file','--filters','--path=file.txt',sha]);
 await readFile(marker);await rm(marker);
 const hooks=join(f.root,'hooks');await mkdir(hooks);
 for(const name of ['post-checkout','post-index-change','fsmonitor-watchman'])await writeFile(join(hooks,name),`#!/bin/sh\ntouch '${marker}'\n`,{mode:0o700});
 f.git('config','core.hooksPath',hooks);f.git('config','core.fsmonitor',join(hooks,'fsmonitor-watchman'));
 const injected={GIT_DIR:join(other.root,'.git'),GIT_WORK_TREE:other.root,GIT_OBJECT_DIRECTORY:join(other.root,'.git','objects'),GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:'core.hooksPath',GIT_CONFIG_VALUE_0:hooks};
 const prior=Object.fromEntries(Object.keys(injected).map(k=>[k,process.env[k]]));
 let seed;try{Object.assign(process.env,injected);seed=trustedGitBlobSeed(f.root,repository);}finally{for(const [k,v] of Object.entries(prior)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
 assert.deepEqual(await seed.read(sha,bytes.length),bytes);
 await assert.rejects(readFile(marker),{code:'ENOENT'});
 await assert.rejects(readFile(join(f.root,'file.txt')),{code:'ENOENT'});
});

test('fresh tree authorization failure stops a memory-primed snapshot before any seed callback',async t=>{
 const f=await repo(t),bytes=Buffer.from('authorized content'),sha=f.put(bytes),source=api(bytes),seed=trustedGitBlobSeed(f.root,repository);let reads=0;
 const read=createRemoteSnapshotReader(source.client,{seed:{repository,read:async(s,n)=>{reads++;return seed.read(s,n);}}});
 assert.equal((await read(repository,commit)).files['file.txt'],'authorized content');assert.equal(reads,1);
 source.deny();await assert.rejects(read(repository,commit),/tree-authorization-denied/);
 assert.equal(reads,1);assert.deepEqual(source.counts,{commit:2,tree:2,blob:0});
 assert.equal(read.metrics().memoryHits,0);assert.equal(read.metrics().requestFailures,1);
 assert.equal(sha,blob(bytes));
});


test('actual HTTP commit and tree authorization precedes local reuse and repeats on warm reads',async t=>{
 const f=await repo(t),bytes=Buffer.from('retained source'),sha=f.put(bytes);let denied=false,reads=0;const paths:string[]=[];
 const token='local-http-seed-fixture-token';
 const server=createServer((req,res)=>{
  assert.equal(req.headers.authorization,`token ${token}`);const path=new URL(req.url!,'http://localhost');paths.push(path.pathname);
  res.setHeader('content-type','application/json');
  if(denied&&path.pathname.includes('/trees/')){res.writeHead(403);res.end(JSON.stringify({message:'Synthetic tree denied'}));return;}
  if(path.pathname.endsWith('/commits/'+commit))res.end(JSON.stringify({sha:commit,tree:{sha:tree}}));
  else if(path.pathname.endsWith('/trees/'+tree)){assert.equal(path.searchParams.get('recursive'),'true');res.end(JSON.stringify({sha:tree,truncated:false,tree:[{path:'file.txt',type:'blob',mode:'100644',sha,size:bytes.length}]}));}
  else if(path.pathname.endsWith('/blobs/'+sha))res.end(JSON.stringify({sha,encoding:'base64',content:bytes.toString('base64')}));
  else{res.writeHead(404);res.end('{}');}
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());}));
 const client=new Octokit({baseUrl:`http://127.0.0.1:${(server.address() as any).port}`,auth:token,request:{timeout:1000}});
 const expected=await createRemoteSnapshotReader(client)(repository,commit),seed=trustedGitBlobSeed(f.root,repository);
 const read=createRemoteSnapshotReader(client,{seed:{repository,read:async(s,n)=>{reads++;return seed.read(s,n);}}});
 assert.deepEqual(await read(repository,commit),expected);assert.deepEqual(await read(repository,commit),expected);assert.equal(reads,1);
 assert.equal(paths.filter(p=>p.includes('/blobs/')).length,1,'Only cold control uses remote blob HTTP');
 const count=paths.length;await assert.rejects(read('seed-fixture/other',commit),/repository mismatch/);assert.equal(paths.length,count);
 denied=true;await assert.rejects(read(repository,commit),(e:any)=>e.status===403);assert.equal(reads,1);assert.equal(paths.length,count+2);
 assert.equal(read.metrics().memoryHits,1);assert.equal(read.metrics().requestFailures,1);
});
