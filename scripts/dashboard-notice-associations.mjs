import{readFile,writeFile,mkdir,lstat,readdir,realpath}from'node:fs/promises';
import{resolve,relative,dirname,join,isAbsolute}from'node:path';
import{createHash}from'node:crypto';
import{fileURLToPath}from'node:url';
const sha=b=>createHash('sha256').update(b).digest('hex');
const owned=(root,path)=>{const r=relative(root,path);return r===''||r!=='..'&&!r.startsWith('../')&&!isAbsolute(r);};
const child=(root,path)=>{if(typeof path!=='string'||!path||path.includes('\\')||isAbsolute(path)||path.split('/').includes('..'))throw Error('Invalid notice evidence path');const p=resolve(root,path);if(!owned(root,p))throw Error('Notice evidence escapes owner');return p;};
async function bytes(root,path){const p=child(root,path),info=await lstat(p);if(!info.isFile()||info.isSymbolicLink()||!owned(await realpath(root),await realpath(p)))throw Error('Invalid notice evidence file');return readFile(p);}
async function componentCoverage(recipe,sourceDir,runtimeDir,runtimeTree){
 const c=recipe.componentCoverage;if(c===undefined)return null;
 if(c?.status!=='partial'||c.complete!==false||!Number.isSafeInteger(c.declaredComponentCount)||c.declaredComponentCount<1||!Array.isArray(c.components)||!c.components.length||c.components.length>=c.declaredComponentCount)throw Error('Invalid partial component notice coverage');
 if(!['native-component-copyright-and-full-license-notice-completeness-unverified','native-redistribution-and-source-obligations-pending'].every(k=>recipe.pendingReview?.includes(k)))throw Error('Partial component notice review qualifications missing');
 const source=await bytes(sourceDir,c.versions.path),retained=recipe.supportingEvidence?.find(e=>e.name===c.versions.retainedEvidence);
 if(source.length>65536||sha(source)!==c.versions.sha256||retained?.origin!=='installed'||retained.path!==dirname(recipe.path)+'/'+c.versions.path||retained.sha256!==c.versions.sha256||retained.bytes!==source.length)throw Error('Component versions evidence changed');
 const runtimeVersion=runtimeTree.files.find(f=>f.path===c.versions.path);if(runtimeVersion){const b=await bytes(runtimeDir,c.versions.path);if(b.length!==source.length||sha(b)!==c.versions.sha256)throw Error('Component versions evidence changed');}
 const versions=JSON.parse(source),names=Object.keys(versions).sort();if(names.length!==c.declaredComponentCount||names.some(n=>typeof versions[n]!=='string'))throw Error('Component version inventory changed');
 const covered=new Set();for(const component of c.components){
  if(!component.name||covered.has(component.name)||versions[component.name]!==component.version||!Array.isArray(component.notices)||!component.notices.length)throw Error('Component notice version binding changed');
  covered.add(component.name);for(const name of component.notices){const n=recipe.notices.find(n=>n.name===name);if(!n||n.provenance?.component?.name!==component.name||n.provenance.component.version!==component.version)throw Error('Component notice provenance changed');}
 }
 return{status:'partial',complete:false,declaredComponentCount:names.length,retainedComponentCount:covered.size,versions:{...c.versions,runtimeFile:runtimeVersion?'retained-source-identical':'not-retained-in-runtime',binding:'Authenticated package source archive/version declaration and byte-identical retained runtime projection; not an independent reconstruction of the binary component closure.'},components:c.components,uncoveredComponents:names.filter(n=>!covered.has(n)),qualification:'Exact-version upstream root notice files for the listed components only; no complete native component/copyright enumeration, rebuild, relinkability, source-obligation disposition or legal clearance.'};
}
function exactRuntimeCoverage(recipe,runtimeTree){
 const c=recipe.runtimeCoverage;if(c===undefined)return null;
 if(c?.kind!=='exact-observed-runtime-files'||!Array.isArray(c.files)||!c.files.length||c.files.length!==runtimeTree.files.length)throw Error('Observed runtime file coverage changed');
 if(c.sourceVersion?.published!==recipe.version||typeof c.sourceVersion.upstream!=='string'||!c.sourceVersion.upstream||c.sourceVersion.upstream===c.sourceVersion.published||c.sourceVersion.mapping!=='unverified'||!recipe.pendingReview?.includes('published-release-source-version-discrepancy-unresolved'))throw Error('Observed source version discrepancy qualification missing');
 const expected=new Map();for(const f of c.files){if(typeof f.path!=='string'||!f.path||f.path.split('/').includes('..')||isAbsolute(f.path)||f.path.includes('\\')||expected.has(f.path)||!Number.isSafeInteger(f.bytes)||f.bytes<0||!/^[a-f0-9]{64}$/.test(f.sha256))throw Error('Invalid observed runtime file coverage');expected.set(f.path,f);}
 for(const f of runtimeTree.files){const e=expected.get(f.path);if(!e||e.sha256!==f.sha256||e.bytes!==f.bytes)throw Error('Observed runtime file coverage changed');}
 return c;
}
/** Canonical byte inventory, including manifests, never execute dependency code. */
export async function noticeSourceTree(root,{rejectIgnored=false}={}){
 let total=0;const records=[];async function visit(dir){for(const name of(await readdir(dir)).sort()){if(name==='node_modules'||name==='.git'){if(rejectIgnored)throw Error('Observed runtime file coverage changed');continue;}const path=join(dir,name),s=await lstat(path);if(s.isSymbolicLink())throw Error('Notice source contains symlink');if(s.isDirectory())await visit(path);else if(s.isFile()){total+=s.size;if(s.size>64*1024*1024||total>128*1024*1024)throw Error('Notice source byte bound exceeded');const b=await readFile(path);records.push({path:relative(root,path).split('\\').join('/'),sha256:sha(b),bytes:b.length});}else throw Error('Unsupported notice source file');if(records.length>100000)throw Error('Notice source file bound exceeded');}}
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
  const sourceTree=await noticeSourceTree(sourceDir),runtimeTree=await noticeSourceTree(runtimeDir,{rejectIgnored:recipe.runtimeCoverage!==undefined});
  if(sourceTree.sha256!==recipe.sourceTreeSha256)throw Error('Notice source package bytes changed');
  const sourceFiles=new Map(sourceTree.files.map(f=>[f.path,f]));for(const f of runtimeTree.files){const source=sourceFiles.get(f.path);if(!source||source.sha256!==f.sha256||source.bytes!==f.bytes)throw Error('Notice runtime projection differs from authenticated source');}
  const coverage=await componentCoverage(recipe,sourceDir,runtimeDir,runtimeTree),runtimeCoverage=exactRuntimeCoverage(recipe,runtimeTree);
  const retain=async(items,subdir)=>{const retained=[],names=new Set();for(const item of items){const b=await bytes(item.origin==='installed'?root:assetRoot,item.path);if(sha(b)!==item.sha256||b.length!==item.bytes)throw Error('Notice authentic evidence bytes changed');
   if(!item.name||item.name.includes('/')||item.name.includes('\\')||item.name==='..')throw Error('Invalid retained notice name');
   if(names.has(item.name))throw Error('Duplicate retained notice name');names.add(item.name);
   const id=sha(Buffer.from(recipe.path)).slice(0,24),dest=child(output,'associations/'+id+'/'+subdir+item.name);await mkdir(dirname(dest),{recursive:true});await writeFile(dest,b);retained.push({source:item.path,path:relative(output,dest),sha256:item.sha256,bytes:b.length,provenance:item.provenance});}return retained;};
  const notices=await retain(recipe.notices,''),supportingEvidence=await retain(recipe.supportingEvidence??[],'provenance/');
  const evidence={path:pkg.path,owner:recipe.owner,lock:recipe.lock,sourceTreeSha256:sourceTree.sha256,runtimeProjectionSha256:runtimeTree.sha256,runtimeFileCount:runtimeTree.files.length,sourceProvenance:recipe.sourceProvenance,associatedDeclaration:recipe.associatedDeclaration??null,evidenceKind:recipe.evidenceKind??'package-specific-source-notice',pendingReview:recipe.pendingReview??[],notices,qualification:recipe.qualification,...(coverage?{componentCoverage:coverage}:{}),...(supportingEvidence.length?{supportingEvidence}:{}),...(runtimeCoverage?{runtimeCoverage}:{})};
  pkg.noticeEvidence=evidence;associations.push(evidence);
 }
 return associations;
}
