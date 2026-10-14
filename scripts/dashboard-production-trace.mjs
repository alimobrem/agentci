import{readFile,lstat,realpath,rm}from'node:fs/promises';import{resolve,join,relative,isAbsolute}from'node:path';import{fileURLToPath}from'node:url';
/** Remove only dependencies proven development-only by the unchanged root lock; retain Next's production trace. */
export async function pruneDashboardDevelopmentTrace({root,standalone}){
 root=await realpath(resolve(root));standalone=await realpath(resolve(standalone));const lock=JSON.parse(await readFile(join(root,'npm-shrinkwrap.json'))),removed=[];
 if(![2,3].includes(lock.lockfileVersion)||!lock.packages)throw Error('Unsupported locked dependency identity');
 for(const [path,entry]of Object.entries(lock.packages)){if(entry.dev!==true||!path.startsWith('node_modules/'))continue;if(path.split('/').some(p=>p==='..'||p==='.'))throw Error('Unsafe locked dependency path');const target=join(standalone,path),r=relative(standalone,target);if(r.startsWith('../')||isAbsolute(r))throw Error('Runtime removal escapes artifact');let info;try{info=await lstat(target);}catch(e){if(e.code==='ENOENT')continue;throw e;}if(!info.isDirectory()||info.isSymbolicLink())throw Error('Unexpected development dependency file type');const actual=await realpath(target);if(actual!==target)throw Error('Development dependency link escapes owned path');await rm(target,{recursive:true});removed.push(path);}
 return{schemaVersion:1,scope:'Root-lock development-only trace removal; production/shared dependency entries unchanged',removed};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{console.log(JSON.stringify(await pruneDashboardDevelopmentTrace({root:process.cwd(),standalone:process.argv[2]})));}catch{console.error('Production trace preparation failed; no production-only claim');process.exitCode=1;}}
