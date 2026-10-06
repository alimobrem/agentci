import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile,chmod} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {trustedGitBlobSeed} from '../packages/github/git-object-seed.ts';import {createRemoteSnapshotReader} from '../packages/github/client.ts';import {GitHubRateLimitWait} from '../packages/github/rate-limit.ts';
const repository='example/repo',commit='1'.repeat(40),tree='2'.repeat(40);
const hash=(bytes:Buffer)=>createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
async function fixture(t:any){const root=await mkdtemp(join(tmpdir(),'agentci-seed-'));t.after(()=>rm(root,{recursive:true,force:true}));const git=(...args:string[])=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();git('init','-q');
 const put=(bytes:Buffer)=>execFileSync('git',['-C',root,'hash-object','-w','--stdin'],{input:bytes,encoding:'utf8'}).trim();return{root,git,put,seed:trustedGitBlobSeed(root,repository)};}
function remote(bytes:Buffer[]){const blobs=bytes.map((value,i)=>({sha:hash(value),path:`file-${i}`,bytes:value}));const counts={commit:0,tree:0,blob:0},state={denied:false,wrongCommit:false,wrongTree:false,sizeDelta:0,cooldown:false};
 const client={git:{getCommit:async()=>{counts.commit++;if(state.denied)throw Error('denied');if(state.cooldown)throw new GitHubRateLimitWait(Date.now()+60000,Date.now());return{data:{sha:state.wrongCommit?'3'.repeat(40):commit,tree:{sha:tree}}};},getTree:async()=>{counts.tree++;return{data:{sha:state.wrongTree?'4'.repeat(40):tree,truncated:false,tree:blobs.map(b=>({path:b.path,sha:b.sha,size:b.bytes.length+state.sizeDelta,type:'blob',mode:'100644'}))}};},getBlob:async({file_sha}:any)=>{counts.blob++;const b=blobs.find(b=>b.sha===file_sha)!;return{data:{sha:b.sha,encoding:'base64',content:b.bytes.toString('base64')}};}}};return{client:client as any,counts,state,blobs};}

test('real trusted Git objects match cold snapshots, miss to REST, and retain fresh identity/authorization checks',async t=>{
 const f=await fixture(t),bytes=[Buffer.from('tracked fixture'),Buffer.from('new candidate content')];f.put(bytes[0]!);
 const api=remote(bytes),cold=createRemoteSnapshotReader(api.client),expected=await cold(repository,commit),read=createRemoteSnapshotReader(api.client,{seed:f.seed});
 assert.deepEqual(await read(repository,commit),expected);assert.equal(read.metrics().localHits,1);assert.equal(read.metrics().localMisses,1);assert.equal(read.metrics().remoteHits,1);
 assert.deepEqual(await read(repository,commit),expected);assert.equal(read.metrics().memoryHits,2);assert.equal(read.metrics().commitAttempts,2);assert.equal(read.metrics().treeAttempts,2);
 const before=api.counts.blob;api.state.denied=true;await assert.rejects(read(repository,commit),/denied/);assert.equal(api.counts.blob,before);api.state.denied=false;
 api.state.wrongCommit=true;await assert.rejects(read(repository,commit),/Commit identity/);api.state.wrongCommit=false;
 api.state.wrongTree=true;await assert.rejects(read(repository,commit),/Tree identity/);api.state.wrongTree=false;
 const requests=api.counts.commit;await assert.rejects(read('example/other',commit),/repository mismatch/);assert.equal(api.counts.commit,requests);
 assert.equal(read.metrics().requestFailures,1);api.state.cooldown=true;await assert.rejects(read(repository,commit),GitHubRateLimitWait);assert.equal(read.metrics().localCooldownBlocks,1);assert.equal(read.metrics().requestFailures,1);
 assert.ok(!JSON.stringify(read.metrics()).includes('candidate'));
});

test('local candidates never bypass blob hash, size, binary, UTF8 or output bounds, and failures do not enter cache',async t=>{
 const f=await fixture(t),bytes=Buffer.from('verified text'),sha=f.put(bytes),api=remote([bytes]);
 const read=createRemoteSnapshotReader(api.client,{seed:{repository,read:async()=>Buffer.from('tampered text')}});
 for(let i=0;i<2;i++)await assert.rejects(read(repository,commit),/mismatched/);assert.equal(read.metrics().memoryHits,0);assert.equal(read.metrics().localHits,0);assert.equal(api.counts.blob,0);
 const seeded=createRemoteSnapshotReader(api.client,{seed:f.seed});api.state.sizeDelta=1;await assert.rejects(seeded(repository,commit),/object mismatch/);api.state.sizeDelta=0;assert.equal((await seeded(repository,commit)).files['file-0'],'verified text');
 for(const invalid of [Buffer.from([0xff]),Buffer.from([0])]){f.put(invalid);const bad=createRemoteSnapshotReader(remote([invalid]).client,{seed:f.seed});await assert.rejects(bad(repository,commit));assert.equal(bad.metrics().localHits,0);assert.equal(bad.metrics().remoteBlobAttempts,0);}
 await assert.rejects(f.seed.read(sha,2*1024*1024+1),/bounds/);
 const huge=Buffer.alloc(2*1024*1024+300,65),hugeSha=f.put(huge);await assert.rejects(f.seed.read(hugeSha,1),/unavailable/);
 // Corrupt a real loose object; corruption is not treated as a cache miss.
 const objectPath=join(f.root,'.git','objects',sha.slice(0,2),sha.slice(2));await chmod(objectPath,0o600);await writeFile(objectPath,Buffer.from('corrupt'));
 await assert.rejects(f.seed.read(sha,bytes.length),/unavailable|mismatch/);
});

test('raw object reads disable replacements and lazy fetch and never checkout or execute content',async t=>{
 const f=await fixture(t),original=Buffer.from('original'),replacement=Buffer.from('replacement'),sha=f.put(original),other=f.put(replacement);f.git('replace',sha,other);
 assert.deepEqual(await f.seed.read(sha,original.length),original);
 const script=Buffer.from('touch SHOULD_NOT_EXIST\n'),scriptSha=f.put(script);assert.deepEqual(await f.seed.read(scriptSha,script.length),script);await assert.rejects(readFile(join(f.root,'SHOULD_NOT_EXIST')));
 f.git('config','extensions.partialClone','origin');f.git('config','remote.origin.promisor','true');f.git('config','remote.origin.url','ext::touch '+join(f.root,'FETCH_SHOULD_NOT_RUN'));f.git('config','protocol.ext.allow','always');
 assert.equal(await f.seed.read('a'.repeat(40),12),undefined);await assert.rejects(readFile(join(f.root,'FETCH_SHOULD_NOT_RUN')));
 await assert.rejects(readFile(join(f.root,'.git','HEAD.lock')));
});

test('local reads use the same bounded cache and bounded subprocess queue',async t=>{
 const f=await fixture(t),bytes=[Buffer.from('one'),Buffer.from('two')];for(const b of bytes)f.put(b);
 const read=createRemoteSnapshotReader(remote(bytes).client,{seed:f.seed,maxEntries:1});await read(repository,commit);await read(repository,commit);assert.equal(read.metrics().localHits,4);assert.equal(read.metrics().memoryHits,0);assert.equal(read.metrics().remoteBlobAttempts,0);
 const small=createRemoteSnapshotReader(remote(bytes).client,{seed:f.seed,maxBytes:1});await small(repository,commit);await small(repository,commit);assert.equal(small.metrics().localHits,4);
 const pending=Array.from({length:18},()=>f.seed.read(hash(bytes[0]!),3));const settled=await Promise.allSettled(pending);assert.equal(settled.filter(r=>r.status==='rejected').length,1);assert.match((settled[17] as PromiseRejectedResult).reason.message,/concurrency/);
});

test('a stalled local Git subprocess is killed with a bounded redacted failure',async t=>{
 const f=await fixture(t),fake=join(f.root,'git');await writeFile(fake,'#!'+process.execPath+'\nsetInterval(()=>{},1000);\n',{mode:0o700});
 const old=process.env.PATH;process.env.PATH=f.root;let seed;try{seed=trustedGitBlobSeed(f.root,repository);}finally{process.env.PATH=old;}
 const started=Date.now();await assert.rejects(seed.read('a'.repeat(40),1),error=>error instanceof Error&&error.message==='Local Git object unavailable');assert.ok(Date.now()-started<5000);
});

test('a stalled asynchronous seed rejects by deadline and late results never populate cache',async()=>{
 const bytes=Buffer.from('late content'),api=remote([bytes]);let release!:(b:Buffer)=>void,calls=0;
 const read=createRemoteSnapshotReader(api.client,{seed:{repository,read:async()=>{calls++;return new Promise<Buffer>(resolve=>{release=resolve;});}},seedTimeoutMs:10});
 await assert.rejects(read(repository,commit),/seed deadline/);assert.equal(read.metrics().localReadFailures,1);assert.equal(api.counts.blob,0);release(bytes);await new Promise(resolve=>setImmediate(resolve));
 await assert.rejects(read(repository,commit),/seed deadline/);release(bytes);assert.equal(calls,2);assert.equal(read.metrics().memoryHits,0);assert.equal(read.metrics().localHits,0);assert.equal(api.counts.blob,0);
 for(const seedTimeoutMs of[0,40001,NaN])assert.throws(()=>createRemoteSnapshotReader(api.client,{seed:{repository,read:async()=>undefined},seedTimeoutMs}),/timeout/);
 assert.throws(()=>createRemoteSnapshotReader(api.client,{seedTimeoutMs:1}),/timeout/);
});
