const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
exports.verifyForgeAbsence=(directory,metadata)=>{
 if(metadata.strategy!=='dependency-removed'||path.basename(directory)!=='node-forge'||path.basename(path.dirname(directory))!=='node_modules')throw Error('Bound Forge absence context required');
 const root=path.dirname(path.dirname(directory)),lockPath=path.join(root,'package-lock.json');
 const lockBytes=fs.readFileSync(lockPath),lock=JSON.parse(lockBytes),lockSha256=crypto.createHash('sha256').update(lockBytes).digest('hex');
 if(lockSha256!==metadata.lockSha256||lock.packages?.['node_modules/promptfoo']?.version!==metadata.promptfooVersion||Object.keys(lock.packages??{}).some(p=>/(^|\/)node_modules\/node-forge$/.test(p)))throw Error('Source-bound engine graph does not prove Forge removal');
 let installedPackagesChecked=0;
 const regular=p=>{const s=fs.lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||s.size>1024*1024)throw Error('Invalid installed package manifest');return JSON.parse(fs.readFileSync(p));};
 const walk=(modules,depth)=>{
  if(depth>32)throw Error('Installed graph exceeds depth bound');
  let info;try{info=fs.lstatSync(modules);}catch(e){if(e.code==='ENOENT')return;throw e;}
  if(!info.isDirectory()||info.isSymbolicLink())throw Error('Installed graph contains directory substitution');
  for(const entry of fs.readdirSync(modules,{withFileTypes:true})){
   if(entry.name==='.bin')continue;
   if(entry.name==='.package-lock.json'&&entry.isFile())continue;
   if(!entry.isDirectory()||entry.isSymbolicLink())throw Error('Installed graph contains package substitution');
   const folder=path.join(modules,entry.name);
   if(entry.name.startsWith('@')){walk(folder,depth+1);continue;}
   if(++installedPackagesChecked>10000)throw Error('Installed graph exceeds package bound');
   const manifest=regular(path.join(folder,'package.json'));
   if(entry.name==='node-forge'||manifest.name==='node-forge')throw Error('Forge remains installed');
   if(entry.name==='promptfoo'&&manifest.version!==metadata.promptfooVersion)throw Error('Installed engine version mismatch');
   walk(path.join(folder,'node_modules'),depth+1);
  }
 };
 walk(path.join(root,'node_modules'),0);
 if(!installedPackagesChecked)throw Error('Installed engine graph missing');
 const installed=regular(path.join(root,'node_modules/promptfoo/package.json'));
 if(installed.name!=='promptfoo'||installed.version!==metadata.promptfooVersion)throw Error('Actual engine missing');
 return {result:'dependency-removed-verified',forgeAbsent:true,lockSha256,installedPackagesChecked};
};
