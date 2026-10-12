import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, mkdir, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes, generateKeyPairSync } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
// @ts-expect-error standalone trusted CI harness
import { scanForward } from '../scripts/security/scan-forward.mjs';
const cache = resolve('.agentci/local/tools/gitleaks-8.30.1');
const supported = { skip: process.platform !== 'linux' || process.arch !== 'x64' };
const git = (root: string, ...args: string[]) => execFileSync('git', ['-C',root,...args], { stdio: ['ignore','pipe','ignore'] }).toString().trim();
const commit = (root: string) => { git(root,'add','-A'); git(root,'commit','-m','generated private fixture'); return git(root,'rev-parse','HEAD'); };
async function fixture() { const root=await mkdtemp(join(tmpdir(),'agentci-forward-')); git(root,'init'); git(root,'config','user.name','Synthetic'); git(root,'config','user.email','synthetic@example.invalid'); await writeFile(join(root,'safe.txt'),'public information\n'); return {root,base:commit(root),output:join(root,'.git','private-report')}; }
const cli = (root: string,base: string,head: string,output: string) => spawnSync(process.execPath,[resolve('scripts/security/scan-forward.mjs'),'--repo',root,'--base',base,'--head',head,'--cache',cache,'--output',output],{encoding:'utf8',timeout:30000,env:{...process.env,GITLEAKS_CONFIG_TOML:'title="untrusted no-op policy"'}});
test('actual CLI scans intermediate add/delete binary blobs with private generated keys and rejects inline/repo policy bypass; unchanged history stays outside',supported,async()=>{
  const f=await fixture(); try {
    const old=randomBytes(24).toString('hex'); await writeFile(join(f.root,'unchanged-old.txt'),`password=${old}\n`); const base=commit(f.root);
    await writeFile(join(f.root,'public.txt'),'ordinary public change\n'); const clean=commit(f.root);
    let child=cli(f.root,base,clean,f.output); assert.equal(child.status,0); let report=JSON.parse(await readFile(f.output,'utf8')); assert.equal(report.findings.length,0);
    const secret=randomBytes(24).toString('hex'); const key=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});
    await writeFile(join(f.root,'.gitattributes'),'* -diff\n'); await writeFile(join(f.root,'private.txt'),`password=${secret} # gitleaks:allow\nhttps://synthetic:${secret}@example.invalid\n`); await writeFile(join(f.root,'.gitleaks.toml'),`password=${secret}\n`); await writeFile(join(f.root,'package-lock.json'),JSON.stringify({password:secret})); await writeFile(join(f.root,'private.pem'),key); const added=commit(f.root);
    git(f.root,'rm','private.txt','private.pem','.gitleaks.toml','package-lock.json'); const deleted=commit(f.root);
    child=cli(f.root,base,deleted,f.output); assert.equal(child.status,1); assert.ok(!`${child.stdout}${child.stderr}`.includes(secret)); assert.ok(!`${child.stdout}${child.stderr}`.includes(old));
    report=JSON.parse(await readFile(f.output,'utf8')); assert.ok(report.findings.some((x: {commit: string})=>x.commit===added)); assert.ok(report.findings.some((x: {rule: string})=>x.rule==='private-key')); assert.ok(report.findings.some((x: {rule: string})=>x.rule==='agentci-url-userinfo')); assert.ok(report.findings.some((x: {path: string})=>x.path==='package-lock.json')); assert.ok(report.findings.some((x: {path: string})=>x.path==='.gitleaks.toml')); assert.ok(!JSON.stringify(report).includes(secret)); assert.ok(!JSON.stringify(report).includes(old)); assert.ok(!JSON.stringify(report).includes('Secret')); assert.equal(report.baseCommit,base); assert.equal(report.headCommit,deleted);
    await writeFile(join(f.root,'private.txt'),`password=${secret}\n`); const reintroduced=commit(f.root); child=cli(f.root,deleted,reintroduced,f.output); assert.equal(child.status,1); report=JSON.parse(await readFile(f.output,'utf8')); assert.ok(report.findings.some((x: {commit: string})=>x.commit===reintroduced));
    git(f.root,'checkout','--detach',added); child=cli(f.root,deleted,added,f.output); assert.equal(child.status,1); report=JSON.parse(await readFile(f.output,'utf8')); assert.equal(report.introducedCommitCount,0); assert.ok(report.findings.length>0);
  }finally{await rm(f.root,{recursive:true,force:true});}
});
test('actual CLI supports exact divergent PR base/head comparisons',supported,async()=>{
  const f=await fixture();try{await writeFile(join(f.root,'main-only.txt'),'public main update\n');const base=commit(f.root);git(f.root,'checkout','--detach',f.base);const value=randomBytes(24).toString('hex');await writeFile(join(f.root,'fixture.txt'),`password=${value}\n`);const head=commit(f.root);const child=cli(f.root,base,head,f.output);assert.equal(child.status,1);const report=JSON.parse(await readFile(f.output,'utf8'));assert.equal(report.introducedCommitCount,1);assert.ok(!JSON.stringify(report).includes(value));}finally{await rm(f.root,{recursive:true,force:true});}
});
test('actual CLI fails coverage on invalid UTF8/BOM path identity, introduced symlink, missing base/head mismatch and shallow source',supported,async()=>{
  const f=await fixture();try{
    const value=randomBytes(24).toString('hex');const name=(n: number)=>Buffer.concat([Buffer.from(f.root+'/'),Buffer.from([n]),Buffer.from('name')]);await writeFile(join(f.root,'.gitattributes'),'* -diff\n');await writeFile(name(0xfe),`password=${value}\n`);await writeFile(name(0xff),'ordinary public value\n');let head=commit(f.root);await writeFile(f.output,'{"status":"no-new-change-findings"}');let child=cli(f.root,f.base,head,f.output);assert.equal(child.status,2);assert.ok(!`${child.stdout}${child.stderr}`.includes(value));await assert.rejects(readFile(f.output),{code:'ENOENT'});
    git(f.root,'checkout','--detach',f.base);await writeFile(join(f.root,'\uFEFFname'),'ordinary value\n');head=commit(f.root);assert.equal(cli(f.root,f.base,head,f.output).status,2);
    git(f.root,'checkout','--detach',f.base);git(f.root,'update-index','--add','--cacheinfo','120000',git(f.root,'hash-object','safe.txt'),'link');git(f.root,'commit','-m','unsupported link');head=git(f.root,'rev-parse','HEAD');assert.equal(cli(f.root,f.base,head,f.output).status,2);
    git(f.root,'checkout','--detach',f.base);assert.equal(cli(f.root,'1'.repeat(40),f.base,f.output).status,2);assert.equal(cli(f.root,f.base,head,f.output).status,2);assert.equal(cli(f.root,'0'.repeat(40),f.base,f.output).status,2);
    const shallow=join(f.root,'shallow');execFileSync('git',['clone','--depth=1',`file://${f.root}`,shallow],{stdio:'ignore'});assert.equal(cli(shallow,f.base,f.base,f.output).status,2);
  }finally{await rm(f.root,{recursive:true,force:true});}
});
test('actual pinned tool/archive and fetched policy integrity failures fail closed without report',supported,async()=>{
  const f=await fixture();try{
    await writeFile(join(f.root,'public.txt'),'ordinary public change\n');const head=commit(f.root);const broken=join(f.root,'broken-cache');await mkdir(broken);await writeFile(join(broken,'gitleaks.tar.gz'),'corrupt');await assert.rejects(scanForward({repo:f.root,base:f.base,head,cache:broken,output:f.output}),/integrity/);await assert.rejects(readFile(f.output),{code:'ENOENT'});
    await copyFile(join(cache,'gitleaks.tar.gz'),join(broken,'gitleaks.tar.gz'));await writeFile(join(broken,'upstream-policy.toml'),'corrupt');await assert.rejects(scanForward({repo:f.root,base:f.base,head,cache:broken,output:f.output}),/integrity/);await assert.rejects(readFile(f.output),{code:'ENOENT'});
  }finally{await rm(f.root,{recursive:true,force:true});}
});
