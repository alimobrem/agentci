import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,chmod,access,symlink,link,open} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {gzipSync,gunzipSync} from 'node:zlib';
// @ts-expect-error operational ESM helper
import {assembleSourcePackage,validateCandidateManifest,verifyCandidateArchive,extractCandidateArchive,readCandidateArchive} from '../scripts/lib/source-package.mjs';
// @ts-expect-error operational ESM helper
import {hash} from '../scripts/lib/development-artifacts.mjs';

const version='0.4.0-m3-dev.4';
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'agentci-source-package-test-'));
 const put=async(path:string,bytes:string|Buffer)=>{await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),bytes);};
 const git=(...args:string[])=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const package_={name:'agentci',version,type:'module',bin:{agentci:'dist/cmd/agentci/main.js'},files:['dist','README.md','docs'],scripts:Object.fromEntries(['prepack','prepare','postpack'].map(name=>[name,`node -e "require('node:fs').writeFileSync('${name}-ran','unexpected')"`]))};
 await put('package.json',JSON.stringify(package_,null,2)+'\n');await put('.gitignore','dist/\n');await put('README.md','Synthetic package fixture\n');await put('docs/guide.md','Committed synthetic documentation\n');
 const lock=JSON.stringify({name:'agentci',version,lockfileVersion:3,packages:{'':{name:'agentci',version,bin:package_.bin}}},null,2)+'\n';
 await put('package-lock.json',lock);await put('npm-shrinkwrap.json',lock);
 await put('dist/cmd/agentci/main.js',`#!/usr/bin/env node\nconsole.log('${version}');\n`);await chmod(join(root,'dist/cmd/agentci/main.js'),0o755);await put('dist/packages/version.js',`export const VERSION='${version}';\n`);
 git('init','--quiet');git('add','package.json','package-lock.json','npm-shrinkwrap.json','.gitignore','README.md','docs/guide.md');
 const commit=()=>git('-c','user.name=Synthetic package fixture','-c','user.email=synthetic@example.invalid','commit','--quiet','-am','Synthetic package source');commit();
 return {root,put,git,commit,lock,assemble:(expected:any={})=>assembleSourcePackage({root,destination:'releases',expected:{runId:'123',attempt:'2',...expected}})};
}
function mutateArchive(archive:Buffer,change:(tar:Buffer)=>Buffer|void){const tar=gunzipSync(archive),changed=change(tar)??tar;return gzipSync(changed);}
function checksum(tar:Buffer,offset=0){tar.fill(32,offset+148,offset+156);let sum=0;for(const byte of tar.subarray(offset,offset+512))sum+=byte;tar.write(sum.toString(8).padStart(7,'0')+'\0',offset+148,8,'ascii');}
async function rejectMutated(archive:Buffer,manifest:any,change:(tar:Buffer)=>Buffer|void,pattern:RegExp){const bytes=mutateArchive(archive,change);await assert.rejects(verifyCandidateArchive(bytes,{...manifest,package:{...manifest.package,sha256:hash(bytes)}}),pattern);}

test('actual pinned npm assembly restores committed locks, suppresses lifecycle and verifies final archive and executable modes',async()=>{
 const f=await fixture();try{
  const assembled=await f.assemble({candidateCommit:'b'.repeat(40)}),manifest=assembled.manifest,archive=await readFile(assembled.archivePath);
  assert.equal(manifest.sourceCommit,f.git('rev-parse','HEAD'));assert.equal(manifest.sourceTree,f.git('rev-parse','HEAD^{tree}'));assert.equal(manifest.candidateCommit,'b'.repeat(40));assert.equal(manifest.runId,'123');assert.equal(manifest.attempt,'2');
  assert.equal(hash(archive),manifest.package.sha256);assert.equal(hash(assembled.manifestBytes),assembled.manifestSha256);
  const verified=await verifyCandidateArchive(archive,manifest,{...manifest});
  for(const path of ['package-lock.json','npm-shrinkwrap.json']){const member=verified.members.find((entry:any)=>entry.path===path),lock=manifest.committedLocks.find((entry:any)=>entry.path===path);assert.equal(member.bytes.toString(),f.lock);assert.equal(lock.gitBlob,f.git('rev-parse',`HEAD:${path}`));}
  assert.equal(verified.members.find((entry:any)=>entry.path==='dist/cmd/agentci/main.js').mode,0o755);
  assert.equal(verified.members.find((entry:any)=>entry.path==='dist/release-source.json').bytes.toString(),JSON.stringify({schemaVersion:1,version,sourceCommit:manifest.sourceCommit})+'\n');
  const external=execFileSync('tar',['-tzf',assembled.archivePath],{encoding:'utf8'}).trim().split('\n');assert.deepEqual(external.sort(),manifest.files.map((entry:any)=>'package/'+entry.path).sort());
  for(const name of ['prepack','prepare','postpack'])await assert.rejects(access(join(f.root,name+'-ran')),{code:'ENOENT'});
  await assert.rejects(access(join(f.root,'dist/release-source.json')),{code:'ENOENT'});
  const extracted=join(f.root,'extracted');await mkdir(extracted);const result=await extractCandidateArchive(archive,manifest,extracted);assert.equal(await readFile(join(result.packageRoot,'package-lock.json'),'utf8'),f.lock);
  await assert.rejects(extractCandidateArchive(archive,manifest,extracted),{code:'EEXIST'});
  assert.deepEqual(Object.keys(assembled.publicationManifest).sort(),['schemaVersion','version','sourceCommit','runId','attempt','package','files'].sort());
 }finally{await rm(f.root,{recursive:true,force:true});}
});
test('assembly rejects missing, unequal or identically modified locks and wrong committed dependency identities',async()=>{
 for(const kind of ['missing','unequal','modified-both','wrong-dependency']){const f=await fixture();try{
  if(kind==='missing')await rm(join(f.root,'package-lock.json'));
  if(kind==='unequal'){await f.put('npm-shrinkwrap.json',f.lock+'\n');f.commit();}
  if(kind==='modified-both'){await f.put('package-lock.json',f.lock+'\n');await f.put('npm-shrinkwrap.json',f.lock+'\n');}
  if(kind==='wrong-dependency'){const lock=JSON.parse(f.lock);lock.packages[''].dependencies={unapproved:'1.0.0'};await f.put('package-lock.json',JSON.stringify(lock));await f.put('npm-shrinkwrap.json',JSON.stringify(lock));f.commit();}
  await assert.rejects(f.assemble(),/Tracked checkout|locks differ|dependency declarations/);await assert.rejects(access(join(f.root,'releases')),{code:'ENOENT'});
 }finally{await rm(f.root,{recursive:true,force:true});}}
});
test('assembly rejects wrong identities, selected untracked content and project npm configuration without reading it',async()=>{
 const f=await fixture();try{
  for(const expected of [{sourceCommit:'c'.repeat(40)},{sourceTree:'c'.repeat(40)},{version:'wrong'}])await assert.rejects(f.assemble(expected),/source identity mismatch/);
  await f.put('docs/untracked.md','untracked selected content');await assert.rejects(f.assemble(),/Committed regular package source/);await rm(join(f.root,'docs/untracked.md'));
  await symlink(join(f.root,'never-existing-private-npmrc'),join(f.root,'.npmrc'));await assert.rejects(f.assemble(),/Project npm configuration/);
 }finally{await rm(f.root,{recursive:true,force:true});}
});
test('retained archive and manifest are never overwritten',async()=>{
 const f=await fixture();try{const assembled=await f.assemble(),before=await readFile(assembled.archivePath);await assert.rejects(f.assemble(),/Refusing to replace/);assert.deepEqual(await readFile(assembled.archivePath),before);}finally{await rm(f.root,{recursive:true,force:true});}
});
test('source or output symlinks cannot escape owned package assembly',async()=>{
 const f=await fixture();try{
  const target=join(f.root,'external-version.js');await writeFile(target,'external');await rm(join(f.root,'dist/packages/version.js'));await symlink(target,join(f.root,'dist/packages/version.js'));
  await assert.rejects(f.assemble(),/Required installed identity|regular|archive|Pack identity/);
  await rm(join(f.root,'dist/packages/version.js'));await f.put('dist/packages/version.js',`export const VERSION='${version}';\n`);
  const external=join(f.root,'external-modules');await mkdir(external);await writeFile(join(external,'version.js'),`export const VERSION='${version}';\n`);await rm(join(f.root,'dist/packages'),{recursive:true});await symlink(external,join(f.root,'dist/packages'));
  await assert.rejects(f.assemble(),/Required installed identity|regular|archive|Pack identity/);await rm(join(f.root,'dist/packages'));await f.put('dist/packages/version.js',`export const VERSION='${version}';\n`);
  await rm(join(f.root,'dist/packages/version.js'));await link(target,join(f.root,'dist/packages/version.js'));await assert.rejects(f.assemble(),/regular|nonregular/);await rm(join(f.root,'dist/packages/version.js'));await f.put('dist/packages/version.js',`export const VERSION='${version}';\n`);
  await mkdir(join(f.root,'foreign-output'));await symlink(join(f.root,'foreign-output'),join(f.root,'releases'));await assert.rejects(f.assemble(),/output directory must be regular/);
 }finally{await rm(f.root,{recursive:true,force:true});}
});
test('archive verification rejects corrupt, omitted and substituted bytes before extraction',async()=>{
 const f=await fixture();try{const assembled=await f.assemble(),archive=await readFile(assembled.archivePath),manifest=assembled.manifest;
  await assert.rejects(verifyCandidateArchive(Buffer.from('corrupt'),manifest),/checksum mismatch/);
  const missing=structuredClone(manifest);missing.files=missing.files.filter((entry:any)=>entry.path!=='package-lock.json');assert.throws(()=>validateCandidateManifest(missing),/Required installed identity/);
  for(const key of ['sourceCommit','sourceTree','candidateCommit','runId','attempt','version'])await assert.rejects(verifyCandidateArchive(archive,manifest,{[key]:'wrong'}));
  await rejectMutated(archive,manifest,tar=>{tar[512]=(tar[512]??0)^1;},/member bytes/);
  const wrongBlob=structuredClone(manifest);wrongBlob.committedLocks[0].gitBlob='f'.repeat(40);await assert.rejects(verifyCandidateArchive(archive,wrongBlob),/committed lock bytes/);
  const missingMember=mutateArchive(archive,tar=>tar.subarray(0,1024));await assert.rejects(verifyCandidateArchive(missingMember,{...manifest,package:{...manifest.package,sha256:hash(missingMember)}}));
 }finally{await rm(f.root,{recursive:true,force:true});}
});
test('strict tar verification rejects duplicate, traversal, absolute, link, device and unsafe mode members',async()=>{
 const f=await fixture();try{const assembled=await f.assemble(),archive=await readFile(assembled.archivePath),manifest=assembled.manifest;
  for(const path of ['package/../escape','/absolute','package/a//file','package/a/./file'])await rejectMutated(archive,manifest,tar=>{tar.fill(0,0,100);tar.write(path,0,'ascii');checksum(tar);},/Unsafe|prefix/);
  for(const type of ['1','2','3','5','x'])await rejectMutated(archive,manifest,tar=>{tar[156]=type.charCodeAt(0);checksum(tar);},/nonregular/);
  await rejectMutated(archive,manifest,tar=>{tar.write('0004755\0',100,8,'ascii');checksum(tar);},/mode/);
  await rejectMutated(archive,manifest,tar=>{const size=Number.parseInt(tar.subarray(124,136).toString().replace(/\0.*$/s,''),8),length=512+Math.ceil(size/512)*512;return Buffer.concat([tar.subarray(0,tar.length-1024),tar.subarray(0,length),Buffer.alloc(1024)]);},/Duplicate/);
  const destination=join(f.root,'rejected-extract');await mkdir(destination);const bad=structuredClone(manifest);bad.files[0].mode=0o7777;await assert.rejects(extractCandidateArchive(archive,bad,destination),/size\/mode/);await assert.rejects(access(join(destination,'package')),{code:'ENOENT'});
 }finally{await rm(f.root,{recursive:true,force:true});}
});
test('shared archive reader bounds bytes before reading and rejects symlink, hardlink, empty and oversized inputs',async()=>{
 const root=await mkdtemp(join(tmpdir(),'agentci-archive-reader-test-'));try{
  const path=join(root,'archive.tgz'),bytes=Buffer.from('bounded synthetic archive bytes');await writeFile(path,bytes);
  assert.deepEqual(await readCandidateArchive(path),bytes);assert.deepEqual(await readCandidateArchive(bytes),bytes);
  const rejected={code:'candidate-archive-input-rejected'};
  await assert.rejects(readCandidateArchive(Buffer.alloc(0)),rejected);
  await assert.rejects(readCandidateArchive(Buffer.alloc(64*1024*1024+1)),rejected);
  await symlink(path,join(root,'symlink.tgz'));await assert.rejects(readCandidateArchive(join(root,'symlink.tgz')),rejected);
  await link(path,join(root,'hardlink.tgz'));await assert.rejects(readCandidateArchive(path),rejected);await assert.rejects(readCandidateArchive(join(root,'hardlink.tgz')),rejected);
  const sparse=await open(join(root,'oversized.tgz'),'wx');try{await sparse.truncate(64*1024*1024+1);}finally{await sparse.close();}
  await assert.rejects(readCandidateArchive(join(root,'oversized.tgz')),rejected);await assert.rejects(readCandidateArchive(root),rejected);
 }finally{await rm(root,{recursive:true,force:true});}
});
