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
test('actual CLI preserves path-conditioned rules across identical bytes, rename and file/directory commit epochs',supported,async()=>{
  const f=await fixture();try{
    const value=randomBytes(24).toString('hex');const xml=`<configuration><packageSourceCredentials><synthetic><add key="ClearTextPassword" value="${value}" /></synthetic></packageSourceCredentials></configuration>\n`;
    await writeFile(join(f.root,'contextless.xml'),xml);const base=commit(f.root);
    await mkdir(join(f.root,'nested'));git(f.root,'mv','contextless.xml','nested/NuGet.Config');await writeFile(join(f.root,'nested/data.xml'),xml);const renamed=commit(f.root);
    let child=cli(f.root,base,renamed,f.output);assert.equal(child.status,1);let report=JSON.parse(await readFile(f.output,'utf8'));
    assert.ok(report.findings.some((x:{rule:string;path:string})=>x.rule==='nuget-config-password'&&x.path==='nested/NuGet.Config'));
    assert.ok(!report.findings.some((x:{rule:string;path:string})=>x.rule==='nuget-config-password'&&x.path==='nested/data.xml'));assert.ok(!JSON.stringify(report).includes(value));
    // A path is a file in one commit and a directory in the next; epochs stay separate.
    await writeFile(join(f.root,'switch'),xml);const fileEpoch=commit(f.root);git(f.root,'rm','switch');await mkdir(join(f.root,'switch'));await writeFile(join(f.root,'switch/NuGet.Config'),xml);const dirEpoch=commit(f.root);
    child=cli(f.root,base,dirEpoch,f.output);assert.equal(child.status,1);report=JSON.parse(await readFile(f.output,'utf8'));assert.ok(report.findings.some((x:{rule:string;path:string;commit:string})=>x.rule==='nuget-config-password'&&x.path==='switch/NuGet.Config'&&x.commit===dirEpoch));assert.ok(!report.findings.some((x:{rule:string;path:string;commit:string})=>x.rule==='nuget-config-password'&&x.path==='switch'&&x.commit===fileEpoch));
    const b64=randomBytes(24).toString('base64');await writeFile(join(f.root,'secret.yaml'),`apiVersion: v1\nkind: Secret\nmetadata:\n  name: synthetic\ndata:\n  value: ${b64}\n`);
    await writeFile(join(f.root,'secret.tf'),`password = "${randomBytes(8).toString('hex')}"\n`);
    await writeFile(join(f.root,'fixture.php'),`<?php $x = array('secret_key' => 'sk_${randomBytes(15).toString('hex').slice(0,29)}');\n`);
    const keyDir=join(f.root,'.git','private-material');await mkdir(keyDir);const keyPath=join(keyDir,'key.pem');const certPath=join(keyDir,'cert.crt');await writeFile(keyPath,generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
    const childEnv={PATH:process.env.PATH,HOME:'/nonexistent'};execFileSync('openssl',['req','-new','-x509','-key',keyPath,'-out',certPath,'-subj','/CN=synthetic.invalid','-days','1'],{stdio:'ignore',env:childEnv});execFileSync('openssl',['pkcs12','-export','-inkey',keyPath,'-in',certPath,'-out',join(f.root,'generated.pfx'),'-passout','pass:'],{stdio:'ignore',env:childEnv});const head=commit(f.root);
    child=cli(f.root,dirEpoch,head,f.output);assert.equal(child.status,1);report=JSON.parse(await readFile(f.output,'utf8'));
    for(const rule of ['kubernetes-secret-yaml','hashicorp-tf-password','freemius-secret-key','pkcs12-file'])assert.ok(report.findings.some((x:{rule:string})=>x.rule===rule),`missing path-aware rule ${rule}`);
    assert.ok(!JSON.stringify(report).includes(value));assert.ok(!JSON.stringify(report).includes(b64));assert.ok(!`${child.stdout}${child.stderr}`.includes(value));
  }finally{await rm(f.root,{recursive:true,force:true});}
});
test('trusted PR workflow rescans edited/retargeted base identities',async()=>{
  const {parse}=await import('yaml');const workflow=parse(await readFile('.github/workflows/sensitive-forward.yaml','utf8'));
  assert.ok(workflow.on.pull_request_target.types.includes('edited'));
  const steps=workflow.jobs.scan.steps;assert.equal(steps[0].with.ref,'${{ github.event.pull_request.base.sha || github.sha }}');
  const scan=steps.find((x:{name?:string})=>x.name==='Scan exact introduced content locally');assert.equal(scan.env.BASE_SHA,'${{ github.event.pull_request.base.sha || github.event.before }}');assert.equal(scan.env.HEAD_SHA,'${{ github.event.pull_request.head.sha || github.sha }}');
});
