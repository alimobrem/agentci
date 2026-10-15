import{readFile,writeFile,mkdir,lstat,readdir,realpath}from'node:fs/promises';
import{resolve,relative,dirname,join,isAbsolute}from'node:path';
import{createHash}from'node:crypto';
import{fileURLToPath}from'node:url';
const sha=b=>createHash('sha256').update(b).digest('hex');
const owned=(root,path)=>{const r=relative(root,path);return r===''||!r.startsWith('../')&&!isAbsolute(r);};
const child=(root,path)=>{if(typeof path!=='string'||!path||path.includes('\\')||isAbsolute(path)||path.split('/').includes('..'))throw Error('Invalid notice evidence path');const p=resolve(root,path);if(!owned(root,p))throw Error('Notice evidence escapes owner');return p;};
async function bytes(root,path){const p=child(root,path),info=await lstat(p);if(!info.isFile()||info.isSymbolicLink()||!owned(await realpath(root),await realpath(p)))throw Error('Invalid notice evidence file');return readFile(p);}
/** Canonical byte inventory, including manifests, never execute dependency code. */
export async function noticeSourceTree(root){
 let total=0;const records=[];async function visit(dir){for(const name of(await readdir(dir)).sort()){if(name==='node_modules'||name==='.git')continue;const path=join(dir,name),s=await lstat(path);if(s.isSymbolicLink())throw Error('Notice source contains symlink');if(s.isDirectory())await visit(path);else if(s.isFile()){total+=s.size;if(s.size>64*1024*1024||total>128*1024*1024)throw Error('Notice source byte bound exceeded');const b=await readFile(path);records.push({path:relative(root,path).split('\\').join('/'),sha256:sha(b),bytes:b.length});}else throw Error('Unsupported notice source file');if(records.length>100000)throw Error('Notice source file bound exceeded');}}
 await visit(root);return{sha256:sha(Buffer.from(JSON.stringify(records))),files:records};
}
/** Apply only reviewed package-specific recipes; missing or drifted evidence fails closed. */
export async function applyDashboardNoticeAssociations({root,standalone,output,packages},recipes){
 const assetRoot=fileURLToPath(new URL('./dashboard-notices/',import.meta.url));
 recipes??=JSON.parse(await readFile(join(assetRoot,'associations.json'),'utf8')).associations;
 const byPath=new Map(packages.map(p=>[p.path,p])),associations=[];
 for(const recipe of recipes){const pkg=byPath.get(recipe.path);if(!pkg)continue;
  const owner=byPath.get(recipe.owner.path);if(!owner||owner.name!==recipe.owner.name||owner.version!==recipe.owner.version||owner.manifestSha256!==recipe.owner.manifestSha256||owner.lockedSourceManifestSha256!==recipe.owner.manifestSha256)throw Error('Notice source owner identity changed');
  if(pkg.name!==recipe.name||pkg.version!==recipe.version||pkg.manifestSha256!==recipe.manifestSha256||pkg.lockedSourceManifestSha256!==recipe.manifestSha256)throw Error('Notice target identity changed');
  const lock=JSON.parse(await bytes(root,recipe.lock.path)),locked=lock.packages?.[recipe.lock.key];if(!locked||locked.version!==recipe.owner.version||locked.integrity!==recipe.lock.integrity||locked.resolved!==recipe.lock.resolved)throw Error('Notice locked archive identity changed');
  const sourceDir=dirname(child(root,recipe.path)),runtimeDir=dirname(child(standalone,recipe.path));
  if(!owned(await realpath(root),await realpath(sourceDir))||!owned(await realpath(standalone),await realpath(runtimeDir)))throw Error('Notice package directory escapes owner');
  const sourceTree=await noticeSourceTree(sourceDir),runtimeTree=await noticeSourceTree(runtimeDir);
  if(sourceTree.sha256!==recipe.sourceTreeSha256)throw Error('Notice source package bytes changed');
  const sourceFiles=new Map(sourceTree.files.map(f=>[f.path,f]));for(const f of runtimeTree.files){const source=sourceFiles.get(f.path);if(!source||source.sha256!==f.sha256||source.bytes!==f.bytes)throw Error('Notice runtime projection differs from authenticated source');}
  const notices=[];for(const item of recipe.notices){const b=await bytes(item.origin==='installed'?root:assetRoot,item.path);if(sha(b)!==item.sha256||b.length!==item.bytes)throw Error('Notice authentic evidence bytes changed');
   if(!item.name||item.name.includes('/')||item.name.includes('\\')||item.name==='..')throw Error('Invalid retained notice name');
   const id=sha(Buffer.from(recipe.path)).slice(0,24),dest=child(output,'associations/'+id+'/'+item.name);await mkdir(dirname(dest),{recursive:true});await writeFile(dest,b);notices.push({source:item.path,path:relative(output,dest),sha256:item.sha256,bytes:b.length,provenance:item.provenance});}
  const evidence={path:pkg.path,owner:recipe.owner,lock:recipe.lock,sourceTreeSha256:sourceTree.sha256,runtimeProjectionSha256:runtimeTree.sha256,runtimeFileCount:runtimeTree.files.length,sourceProvenance:recipe.sourceProvenance,associatedDeclaration:recipe.associatedDeclaration??null,evidenceKind:recipe.evidenceKind??'package-specific-source-notice',pendingReview:recipe.pendingReview??[],notices,qualification:recipe.qualification};
  pkg.noticeEvidence=evidence;associations.push(evidence);
 }
 return associations;
}
