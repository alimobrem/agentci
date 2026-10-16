import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {readFile,writeFile,mkdir,mkdtemp,rm,lstat,realpath,chmod,open} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,dirname,relative} from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {normalizePackOutput,validatePackageManifest,hash} from './development-artifacts.mjs';

const MAX_ARCHIVE=64*1024*1024,MAX_CONTENT=128*1024*1024,MAX_FILES=10000;
const LOCKS=['package-lock.json','npm-shrinkwrap.json'];
const SOURCE='dist/release-source.json';
const sha=/^[a-f0-9]{40}$/,digest=/^[a-f0-9]{64}$/;
function packagePath(path){
 if(typeof path!=='string'||!path||!/^[-A-Za-z0-9_.\/]+$/.test(path)||path.startsWith('/')||path.split('/').some(part=>!part||part==='.'||part==='..'))throw Error('Unsafe package member path');
 return path;
}
function distinctPaths(files){
 const paths=new Set();
 for(const file of files){packagePath(file.path);if(paths.has(file.path))throw Error('Duplicate package member');paths.add(file.path);}
 for(const path of paths){const parts=path.split('/');parts.pop();while(parts.length){if(paths.has(parts.join('/')))throw Error('Package file is also an ancestor');parts.pop();}}
}
function git(root,args){return execFileSync('git',args,{cwd:root,encoding:'buffer',stdio:['ignore','pipe','pipe'],timeout:30000,maxBuffer:MAX_CONTENT});}
async function regularSource(root,path){
 packagePath(path);const parts=path.split('/');let current=root;
 for(let index=0;index<parts.length;index++){current=join(current,parts[index]);const info=await lstat(current);if(info.isSymbolicLink()||(index===parts.length-1?(!info.isFile()||info.nlink!==1):!info.isDirectory()))throw Error('Source package paths must have unlinked regular files and directory ancestors');}
 return readFile(current);
}
function committedFile(root,commit,path){
 const entry=git(root,['ls-tree','-z',commit,'--',path]).toString();
 const match=/^(100644|100755) blob ([a-f0-9]{40})\t([^\0]+)\0$/.exec(entry);
 if(!match||match[3]!==path)throw Error('Committed regular package source required: '+path);
 return {bytes:git(root,['cat-file','blob',match[2]]),gitBlob:match[2],mode:match[1]==='100755'?0o755:0o644};
}
function lockIdentity(bytes,package_){
 const lock=JSON.parse(bytes.toString());
 if(![2,3].includes(lock.lockfileVersion)||lock.name!==package_.name||lock.version!==package_.version||lock.packages?.['']?.name!==package_.name||lock.packages[''].version!==package_.version)throw Error('Lock package identity mismatch');
 const canonical=value=>JSON.stringify(Object.entries(value??{}).sort(([a],[b])=>a.localeCompare(b)));
 for(const key of ['dependencies','devDependencies','optionalDependencies','peerDependencies'])if(canonical(lock.packages[''][key])!==canonical(package_[key]))throw Error('Lock dependency declarations differ from package');
}
function octal(bytes){const value=bytes.toString('ascii').replace(/\0.*$/s,'').trim();if(!/^[0-7]+$/.test(value))throw Error('Invalid tar numeric field');const number=Number.parseInt(value,8);if(!Number.isSafeInteger(number))throw Error('Oversized tar numeric field');return number;}
function textField(bytes){const zero=bytes.indexOf(0);if(zero!==-1&&bytes.subarray(zero).some(value=>value!==0))throw Error('Invalid tar text field');return bytes.subarray(0,zero===-1?bytes.length:zero).toString('utf8');}
function parseArchive(archive){
 if(!Buffer.isBuffer(archive)||!archive.length||archive.length>MAX_ARCHIVE)throw Error('Package archive exceeds byte bound');
 const tar=gunzipSync(archive,{maxOutputLength:MAX_CONTENT}),members=[];let offset=0,ended=false;
 while(offset+512<=tar.length){
  const header=tar.subarray(offset,offset+512);
  if(header.every(value=>value===0)){if(tar.length-offset<1024||tar.subarray(offset).some(value=>value!==0))throw Error('Invalid tar termination');ended=true;break;}
  const recorded=octal(header.subarray(148,156));let checksum=0;for(let index=0;index<512;index++)checksum+=index>=148&&index<156?32:header[index];if(checksum!==recorded)throw Error('Package tar header checksum mismatch');
  if(!header.subarray(257,263).toString('ascii').startsWith('ustar')||![0,48].includes(header[156])||header.subarray(157,257).some(value=>value!==0))throw Error('Package archive contains nonregular or unsupported members');
  const prefix=textField(header.subarray(345,500)),name=textField(header.subarray(0,100)),full=prefix?prefix+'/'+name:name;
  if(!full.startsWith('package/'))throw Error('Package archive prefix required');
  const path=packagePath(full.slice(8)),size=octal(header.subarray(124,136)),mode=octal(header.subarray(100,108));
  if(mode>0o777||size>MAX_CONTENT||members.length>=MAX_FILES||offset+512+size>tar.length)throw Error('Invalid package member size or mode');
  const bytes=Buffer.from(tar.subarray(offset+512,offset+512+size));
  members.push({path,mode,size,sha256:hash(bytes),bytes});offset+=512+Math.ceil(size/512)*512;
 }
 if(!ended||!members.length)throw Error('Incomplete package tar archive');distinctPaths(members);return members;
}
function makeArchive(members){
 const blocks=[];let total=1024;
 for(const member of members){
  const full='package/'+packagePath(member.path);let name=full,prefix='';
  if(Buffer.byteLength(full)>100){const slash=full.lastIndexOf('/');prefix=full.slice(0,slash);name=full.slice(slash+1);if(Buffer.byteLength(prefix)>155||Buffer.byteLength(name)>100)throw Error('Package path exceeds portable tar bound');}
  const header=Buffer.alloc(512),put=(start,length,value)=>{if(Buffer.byteLength(value)>length)throw Error('Tar field overflow');header.write(value,start,length,'ascii');},number=(start,length,value)=>put(start,length,value.toString(8).padStart(length-1,'0')+'\0');
  put(0,100,name);number(100,8,member.mode);number(108,8,0);number(116,8,0);number(124,12,member.bytes.length);number(136,12,0);header.fill(32,148,156);header[156]=48;put(257,6,'ustar\0');put(263,2,'00');put(345,155,prefix);
  number(148,8,header.reduce((sum,value)=>sum+value,0));const padding=Buffer.alloc((512-member.bytes.length%512)%512);blocks.push(header,member.bytes,padding);total+=512+member.bytes.length+padding.length;if(total>MAX_CONTENT)throw Error('Package content exceeds byte bound');
 }
 blocks.push(Buffer.alloc(1024));return gzipSync(Buffer.concat(blocks),{level:9});
}
function gitBlob(bytes){return createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');}
export function validateCandidateManifest(value,expected={}){
 validatePackageManifest(value,{version:expected.version??value?.version,sourceCommit:expected.sourceCommit??value?.sourceCommit,...expected});
 if(value.artifactKind!=='candidate-source-package'||!sha.test(value.sourceTree??'')||!sha.test(value.candidateCommit??''))throw Error('Candidate source/tree binding required');
 if(value.packaging?.npm!=='12.2.0'||value.packaging.lifecycleScripts!==false)throw Error('Pinned lifecycle-suppressed packaging policy required');
 for(const key of ['sourceCommit','sourceTree','candidateCommit','version','runId','attempt'])if(expected[key]!==undefined&&expected[key]!==value[key])throw Error('Candidate package identity mismatch: '+key);
 distinctPaths(value.files);
 for(const file of value.files)if(!Number.isSafeInteger(file.size)||file.size<0||file.size>MAX_CONTENT||!Number.isInteger(file.mode)||file.mode<0||file.mode>0o777)throw Error('Candidate member size/mode required');
 if(!(value.files.find(file=>file.path==='dist/cmd/agentci/main.js').mode&0o111))throw Error('Packaged CLI must remain executable');
 if(!Array.isArray(value.committedLocks)||value.committedLocks.length!==2||new Set(value.committedLocks.map(lock=>lock.path)).size!==2)throw Error('Both committed locks required');
 for(const path of LOCKS){const lock=value.committedLocks.find(entry=>entry.path===path),file=value.files.find(entry=>entry.path===path);if(!lock||!sha.test(lock.gitBlob??'')||!digest.test(lock.sha256??'')||lock.sha256!==file.sha256)throw Error('Committed lock member binding mismatch');}
 if(value.committedLocks[0].sha256!==value.committedLocks[1].sha256||value.provenance?.path!==SOURCE||value.provenance.sha256!==value.files.find(file=>file.path===SOURCE).sha256)throw Error('Candidate lock/provenance mismatch');
 return value;
}
export async function readCandidateArchive(value){
 try{
  if(Buffer.isBuffer(value)){if(!value.length||value.length>MAX_ARCHIVE)throw Error();return value;}
  const regular=info=>info.isFile()&&!info.isSymbolicLink()&&info.nlink===1&&info.size>0&&info.size<=MAX_ARCHIVE;
  const info=await lstat(value);if(!regular(info))throw Error();
  const handle=await open(value,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
   const before=await handle.stat();if(!regular(before)||before.dev!==info.dev||before.ino!==info.ino||before.size!==info.size)throw Error();
   // Read at most the validated size plus one byte, even if a file grows meanwhile.
   const bytes=Buffer.alloc(before.size);let offset=0;
   while(offset<bytes.length){const {bytesRead}=await handle.read(bytes,offset,bytes.length-offset,offset);if(!bytesRead)throw Error();offset+=bytesRead;}
   if((await handle.read(Buffer.alloc(1),0,1,offset)).bytesRead)throw Error();
   const after=await handle.stat();if(!regular(after)||after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs)throw Error();
   return bytes;
  }finally{await handle.close();}
 }catch{throw Object.assign(Error('Candidate archive input rejected'),{code:'candidate-archive-input-rejected'});}
}
export async function verifyCandidateArchive(value,manifest,expected={}){
 validateCandidateManifest(manifest,expected);const archive=await readCandidateArchive(value);if(hash(archive)!==manifest.package.sha256)throw Error('Candidate package archive checksum mismatch');
 const members=parseArchive(archive);
 if(members.length!==manifest.files.length)throw Error('Candidate archive member set mismatch');
 for(const member of members){const file=manifest.files.find(entry=>entry.path===member.path);if(!file||file.sha256!==member.sha256||file.size!==member.size||file.mode!==member.mode)throw Error('Candidate archive member bytes/mode mismatch');}
 const byPath=path=>members.find(member=>member.path===path).bytes;
 const package_=JSON.parse(byPath('package.json')),provenance=JSON.parse(byPath(SOURCE));
 if(package_.name!=='agentci'||package_.version!==manifest.version||provenance.schemaVersion!==1)throw Error('Candidate package/provenance identity mismatch');
 for(const key of ['version','sourceCommit'])if(provenance[key]!==manifest[key])throw Error('Candidate provenance mismatch');
 if(!byPath(LOCKS[0]).equals(byPath(LOCKS[1])))throw Error('Candidate production locks differ');
 for(const lock of manifest.committedLocks){const bytes=byPath(lock.path);if(gitBlob(bytes)!==lock.gitBlob||hash(bytes)!==lock.sha256)throw Error('Candidate committed lock bytes mismatch');lockIdentity(bytes,package_);}
 return {manifest,members,packageSha256:hash(archive)};
}
export async function extractCandidateArchive(value,manifest,destination,expected={}){
 const verified=await verifyCandidateArchive(value,manifest,expected);const directory=await realpath(destination);if(!(await lstat(destination)).isDirectory()||(await lstat(destination)).isSymbolicLink())throw Error('Owned extraction directory required');
 const packageRoot=join(directory,'package');await mkdir(packageRoot,{mode:0o700});
 for(const member of verified.members){const path=join(packageRoot,member.path);await mkdir(dirname(path),{recursive:true,mode:0o700});await writeFile(path,member.bytes,{flag:'wx',mode:member.mode});await chmod(path,member.mode);}
 return {...verified,packageRoot};
}
export async function assembleSourcePackage({root=process.cwd(),destination,expected={}}={}){
 root=await realpath(root);const sourceCommit=git(root,['rev-parse','HEAD']).toString().trim(),sourceTree=git(root,['rev-parse','HEAD^{tree}']).toString().trim();
 if(!sha.test(sourceCommit)||!sha.test(sourceTree))throw Error('Exact Git checkout required');
 try{git(root,['diff','--quiet','HEAD','--']);}catch{throw Error('Tracked checkout differs from committed source');}
 try{await lstat(join(root,'.npmrc'));throw Error('Project npm configuration is not allowed for source packaging');}catch(error){if(error.code!=='ENOENT')throw error;}
 const committedPackage=committedFile(root,sourceCommit,'package.json'),packageBytes=await regularSource(root,'package.json');if(!committedPackage.bytes.equals(packageBytes))throw Error('Package manifest differs from committed source');
 const package_=JSON.parse(packageBytes),identity={version:package_.version,sourceCommit,sourceTree,candidateCommit:expected.candidateCommit??sourceCommit,runId:expected.runId??'0',attempt:expected.attempt??'1'};
 for(const key of ['version','sourceCommit','sourceTree'])if(expected[key]!==undefined&&expected[key]!==identity[key])throw Error('Assembly source identity mismatch: '+key);
 const locks=[];for(const path of LOCKS){const committed=committedFile(root,sourceCommit,path),bytes=await regularSource(root,path);if(!committed.bytes.equals(bytes))throw Error('Production lock differs from committed source');lockIdentity(bytes,package_);locks.push({path,...committed,sha256:hash(bytes)});}
 if(!locks[0].bytes.equals(locks[1].bytes))throw Error('Source production locks differ');
 const staging=await mkdtemp(join(tmpdir(),'agentci-source-package-'));
 try{
  await writeFile(join(staging,'empty.npmrc'),'');await writeFile(join(staging,'empty-global.npmrc'),'');
  const options={cwd:root,encoding:'utf8',env:{PATH:process.env.PATH,HOME:staging,npm_config_userconfig:join(staging,'empty.npmrc'),npm_config_globalconfig:join(staging,'empty-global.npmrc'),npm_config_cache:join(staging,'cache'),npm_config_registry:'https://registry.npmjs.org/'},timeout:120000,maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']};
  if(execFileSync('npm',['--version'],options).trim()!=='12.2.0')throw Error('Pinned npm 12.2.0 required for package assembly');
  const pack=normalizePackOutput(JSON.parse(execFileSync('npm',['pack','--ignore-scripts','--json','--pack-destination',staging],options)),identity.version);
  const selected=parseArchive(await readCandidateArchive(join(staging,pack.filename)));if(selected.length!==pack.files.length||selected.some(member=>!pack.files.some(file=>file.path===member.path)))throw Error('npm selected archive differs from pack output');
  for(const member of selected){const sourceBytes=await regularSource(root,member.path);if(!sourceBytes.equals(member.bytes))throw Error('Selected package bytes differ from source: '+member.path);if(!member.path.startsWith('dist/')){const committed=committedFile(root,sourceCommit,member.path);if(!committed.bytes.equals(member.bytes))throw Error('Selected package member differs from committed source: '+member.path);}}
  const provenance=Buffer.from(JSON.stringify({schemaVersion:1,version:identity.version,sourceCommit})+'\n');
  const members=[...selected.filter(member=>!LOCKS.includes(member.path)&&member.path!==SOURCE),...locks.map(lock=>({path:lock.path,bytes:lock.bytes,mode:lock.mode})),{path:SOURCE,bytes:provenance,mode:0o644}].sort((a,b)=>a.path.localeCompare(b.path));distinctPaths(members);
  const archive=makeArchive(members),files=members.map(member=>({path:member.path,mode:member.mode,size:member.bytes.length,sha256:hash(member.bytes)}));
  const manifest=validateCandidateManifest({schemaVersion:1,artifactKind:'candidate-source-package',...identity,packaging:{npm:'12.2.0',lifecycleScripts:false},package:{name:pack.filename,sha256:hash(archive)},files,committedLocks:locks.map(({path,gitBlob,sha256})=>({path,gitBlob,sha256})),provenance:{path:SOURCE,sha256:hash(provenance)}},identity);
  await verifyCandidateArchive(archive,manifest,identity);const manifestBytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');
  const publicationManifest=validatePackageManifest({schemaVersion:1,version:identity.version,sourceCommit,runId:identity.runId,attempt:identity.attempt,package:manifest.package,files:files.map(({path,sha256})=>({path,sha256}))},identity);
  try{git(root,['diff','--quiet','HEAD','--']);}catch{throw Error('Tracked checkout changed during source packaging');}
  if(git(root,['rev-parse','HEAD']).toString().trim()!==sourceCommit)throw Error('Source commit changed during packaging');
  destination=resolve(root,destination??'releases');const outputParent=await realpath(dirname(destination));if(relative(outputParent,destination).includes('/'))throw Error('Invalid package output directory');
  try{await mkdir(destination,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}
  if((await lstat(destination)).isSymbolicLink()||!(await lstat(destination)).isDirectory())throw Error('Package output directory must be regular');
  const archivePath=join(destination,pack.filename),manifestPath=join(destination,'candidate-package-manifest.json');
  for(const path of [archivePath,manifestPath])try{await lstat(path);throw Error('Refusing to replace retained package output');}catch(error){if(error.code!=='ENOENT')throw error;}
  await writeFile(archivePath,archive,{flag:'wx',mode:0o644});await writeFile(manifestPath,manifestBytes,{flag:'wx',mode:0o644});
  return {manifest,manifestBytes,archivePath,manifestPath,packageSha256:hash(archive),manifestSha256:hash(manifestBytes),publicationManifest};
 }finally{await rm(staging,{recursive:true,force:true});}
}
