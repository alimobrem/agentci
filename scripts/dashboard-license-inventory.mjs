import{readdir,readFile,writeFile,mkdir,lstat,realpath,copyFile}from'node:fs/promises';
import{resolve,relative,dirname,join,isAbsolute,basename}from'node:path';
import{createHash}from'node:crypto';
import{fileURLToPath}from'node:url';
import{applyDashboardNoticeAssociations}from'./dashboard-notice-associations.mjs';
const digest=b=>createHash('sha256').update(b).digest('hex');
const inside=(root,path)=>{const r=relative(root,path);return r===''||r!=='..'&&!r.startsWith('../')&&!isAbsolute(r);};
const notice=name=>/^(?:licen[sc]e|copying|copyright|notice)(?:[._-].*)?$/i.test(name)||/^.+\.LEGAL\.txt$/i.test(name);
const descriptorKeys=new Set(['type','main','module','exports','imports','sideEffects','react-native']);
const isModuleDescriptor=value=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length>0&&Object.keys(value).every(key=>descriptorKeys.has(key));
async function resolvedPathStaysOwned(owner,path){
 if(!inside(owner,path)||relative(owner,path).split('/').includes('node_modules'))return false;
 const actualOwner=await realpath(owner);
 // Missing projected entrypoints are permitted only when their nearest existing
 // component resolves inside the owner. Broken or escaping links fail closed.
 for(let cursor=path;inside(owner,cursor);cursor=dirname(cursor)){
  try{await lstat(cursor);}catch(e){if(e.code==='ENOENT'||e.code==='ENOTDIR'){if(cursor===owner)return false;continue;}throw e;}
  let actual;try{actual=await realpath(cursor);}catch{return false;}
  return inside(actualOwner,actual)&&!relative(actualOwner,actual).split('/').includes('node_modules');
 }
 return false;
}
async function descriptorPathsStayOwned(value,sourceDir,sourceOwner,runtimeDir,runtimeOwner){
 const targets=[];
 const target=v=>v===null||(typeof v==='string'&&!isAbsolute(v)&&!v.includes('\\')&&!/^[a-z]+:/i.test(v)&&(targets.push(v),true))||(Array.isArray(v)&&v.every(target))||(v&&typeof v==='object'&&Object.values(v).every(target));
 const localTargets=v=>v===null||(typeof v==='string'&&v.startsWith('./')&&target(v))||(Array.isArray(v)&&v.every(localTargets))||(v&&typeof v==='object'&&Object.values(v).every(localTargets));
 if(value.type!==undefined&&!['module','commonjs'].includes(value.type))return false;
 for(const key of ['main','module','react-native'])if(value[key]!==undefined&&(typeof value[key]!=='string'||!target(value[key])))return false;
 for(const key of ['exports','imports'])if(value[key]!==undefined&&!localTargets(value[key]))return false;
 for(const entry of targets)if(!await resolvedPathStaysOwned(sourceOwner,resolve(sourceDir,entry))||!await resolvedPathStaysOwned(runtimeOwner,resolve(runtimeDir,entry)))return false;
 return true;
}
async function files(root,{ignore=new Set()}={}){const out=[];async function visit(dir){for(const e of(await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){if(ignore.has(e.name))continue;const path=join(dir,e.name),info=await lstat(path);if(info.isSymbolicLink()){const target=await realpath(path);if(!inside(root,target))throw Error('Inventory symlink escapes owned artifact');continue;}if(info.isDirectory())await visit(path);else if(info.isFile())out.push(path);else throw Error('Unsupported inventory file type');if(out.length>100000)throw Error('Inventory exceeds file bound');}}await visit(root);return out;}
async function manifest(path){const bytes=await readFile(path);if(bytes.length>1024*1024)throw Error('Package identity exceeds bound');let value;try{value=JSON.parse(bytes);}catch{throw Error('Invalid package identity');}return{value,sha256:digest(bytes)};}
async function ancestorIdentity(root,dir){for(let parent=dirname(dir);inside(root,parent);parent=dirname(parent)){if(basename(parent)==='node_modules')break;try{const p=join(parent,'package.json'),m=await manifest(p);if(typeof m.value.name==='string')return{path:relative(root,p),name:m.value.name,version:m.value.version??null,manifestSha256:m.sha256,qualification:'Nearest named package ancestor provenance only; no guessed third-party license or notice'};}catch{}if(parent===root)break;}return null;}
/** Inventory actual traced runtime packages and ship corresponding locked-source notices, never execute package code. */
export async function dashboardLicenseInventory({root,standalone,output},noticeRecipes){
 root=await realpath(resolve(root));standalone=await realpath(resolve(standalone));output=resolve(output);if(inside(standalone,output))throw Error('Inventory output must be outside standalone input');
 const all=await files(standalone),packageFiles=all.filter(p=>p.endsWith('/package.json')),packages=[],issues=[];await mkdir(output,{recursive:true});
 const rootIdentity=await manifest(join(root,'package.json')),uiIdentity=await manifest(join(root,'apps/dashboard/package.json'));
 for(const path of packageFiles){const rel=relative(standalone,path),runtime=await manifest(path);let source=join(root,rel);let original;
 try{original=await manifest(source);}catch{issues.push({path:rel,kind:'missing-locked-source-manifest'});continue;}
 const name=typeof runtime.value.name==='string'?runtime.value.name:null,version=typeof runtime.value.version==='string'?runtime.value.version:null;
 if(name!== (typeof original.value.name==='string'?original.value.name:null)||version!==(typeof original.value.version==='string'?original.value.version:null))throw Error('Runtime package differs from locked source identity');
 let declared=runtime.value.license??original.value.license??null;let licenseBasis='package-manifest';if(name===uiIdentity.value.name&&!declared){declared=rootIdentity.value.license??null;licenseBasis='repository-manifest; private UI has no separate declaration';}
 const sourceDir=dirname(source),own=name===rootIdentity.value.name||name===uiIdentity.value.name;
 const candidates=own?(await readdir(sourceDir)).filter(notice).map(n=>join(sourceDir,n)):(await files(sourceDir,{ignore:new Set(['node_modules','.git','.next','.agentci','tests','test','examples'])})).filter(p=>notice(p.split('/').at(-1)));
 if(name===uiIdentity.value.name&&!candidates.length)candidates.push(join(root,'LICENSE'));
 const id=digest(Buffer.from(rel)).slice(0,24),notices=[];
 for(const file of candidates){const info=await lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.size>2*1024*1024)throw Error('Invalid license notice source');const bytes=await readFile(file),from=inside(sourceDir,file)?relative(sourceDir,file):'repository-LICENSE';const dest=join(output,'notices',id,from);await mkdir(dirname(dest),{recursive:true});await copyFile(file,dest);notices.push({source:from,path:relative(output,dest),sha256:digest(bytes),bytes:bytes.length});}
 if(!declared)issues.push({path:rel,kind:'missing-license-declaration'});if(!notices.length)issues.push({path:rel,kind:'missing-license-notice'});
 const nearestNamedPackageAncestor=(!name||!version)?await ancestorIdentity(root,sourceDir):null;
 packages.push({path:rel,name,version,nearestNamedPackageAncestor,manifestSha256:runtime.sha256,lockedSourceManifestSha256:original.sha256,declaredLicense:declared,licenseBasis,notices});
 }
 // Associate only identity-free module descriptors. Named bundled components never
 // inherit a surrounding package's license, even when their version is omitted.
 const rawMetadataIssues=[...issues],qualifiedDescriptorAssociations=[];
 const byPath=new Map(packages.map(p=>[p.path,p]));
 for(const pkg of packages){
  const source=await manifest(join(root,pkg.path)),ancestor=pkg.nearestNamedPackageAncestor;
  if(pkg.name!==null||pkg.version!==null||!isModuleDescriptor(source.value)||!ancestor)continue;
  const owner=byPath.get(ancestor.path);if(!owner||!owner.name||!owner.version)continue;
  if(!await descriptorPathsStayOwned(source.value,dirname(join(root,pkg.path)),dirname(join(root,owner.path)),dirname(join(standalone,pkg.path)),dirname(join(standalone,owner.path))))continue;
  if(pkg.manifestSha256!==pkg.lockedSourceManifestSha256)throw Error('Runtime descriptor differs from source bytes');
  if(owner.manifestSha256!==owner.lockedSourceManifestSha256||owner.lockedSourceManifestSha256!==ancestor.manifestSha256)throw Error('Runtime parent differs from source bytes');
  if(owner.licenseBasis.startsWith('repository-manifest')){
   const repository=byPath.get('package.json');
   if(!repository||repository.manifestSha256!==rootIdentity.sha256||repository.lockedSourceManifestSha256!==rootIdentity.sha256)throw Error('Repository license identity differs from runtime');
  }
  const association={path:pkg.path,ownerPath:owner.path,ownerName:owner.name,ownerVersion:owner.version,sourceManifestSha256:owner.lockedSourceManifestSha256,runtimeManifestSha256:owner.manifestSha256,declaredLicense:owner.declaredLicense,licenseBasis:owner.licenseBasis,notices:owner.notices,qualification:'Identity-free module descriptor bound to exact source/runtime parent manifests and actual parent evidence; no child SPDX declaration or legal clearance inferred'};
  pkg.descriptorEvidence=association;qualifiedDescriptorAssociations.push(association);
 }
 const noticeAssociations=await applyDashboardNoticeAssociations({root,standalone,output,packages},noticeRecipes);
 const associated=new Map(noticeAssociations.map(a=>[a.path,a]));
 const qualified=new Map(qualifiedDescriptorAssociations.map(a=>[a.path,a]));
 const remainingIssues=issues.filter(issue=>{
  const a=associated.get(issue.path)??qualified.get(issue.path);if(!a)return true;
  if(issue.kind==='missing-license-declaration')return !(a.associatedDeclaration??a.declaredLicense);
  if(issue.kind==='missing-license-notice')return a.notices.length===0;
  return true;
 });
 const licensingReviewItems=noticeAssociations.flatMap(a=>a.pendingReview.map(kind=>({path:a.path,kind})));
 const report={schemaVersion:3,scope:'Actual standalone runtime package inventory and locked installed-source notices; SPDX declarations and verified descriptor associations are evidence, not legal approval',rootPackage:{name:rootIdentity.value.name,version:rootIdentity.value.version,sha256:rootIdentity.sha256},dashboardPackage:{name:uiIdentity.value.name,version:uiIdentity.value.version,sha256:uiIdentity.sha256},runtimeFileCount:all.length,packageCount:packages.length,namedPackageCount:packages.filter(p=>p.name!==null).length,moduleDescriptorCount:packages.filter(p=>p.name===null).length,noticeCount:packages.reduce((n,p)=>n+p.notices.length,0),associatedNoticeCount:noticeAssociations.reduce((n,a)=>n+a.notices.length,0),packages,rawMetadataIssues,qualifiedDescriptorAssociations,noticeAssociations,licensingReviewItems,licensingReview:'Recovered notices and evidence associations do not decide license compatibility, native redistribution/source obligations or complete bundled-component enumeration; original historical inventories and all aggregate gates remain unchanged.',issues:remainingIssues,status:remainingIssues.length||licensingReviewItems.length?'inventory-with-review-items':'inventory-complete',platformQualification:'JavaScript runtime trace only; UBI/RPM/Node notices and image/native/security acceptance remain separate'};
 await writeFile(join(output,'inventory.json'),JSON.stringify(report,null,2)+'\n');return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const value=flag=>process.argv[process.argv.indexOf(flag)+1];try{const result=await dashboardLicenseInventory({root:value('--root'),standalone:value('--standalone'),output:value('--output')});console.log(JSON.stringify({status:result.status,packages:result.packageCount,notices:result.noticeCount,associatedNotices:result.associatedNoticeCount,metadataIssueCount:result.issues.length,licensingReviewItemCount:result.licensingReviewItems.length,reviewItems:result.issues.length+result.licensingReviewItems.length}));}catch{console.error('Dashboard license inventory failed; no complete inventory claimed');process.exitCode=1;}}
