import {writeFile,readFile,lstat,appendFile,rm} from 'node:fs/promises';
import {dirname,join,isAbsolute,resolve,basename} from 'node:path';
import {cleanupSmokeResources} from './smoke-resources.mjs';
export async function registerImageSmokeState(directory,owner){
 const path=join(directory,'ownership.json');await writeFile(path,JSON.stringify({schemaVersion:1,owner}),{mode:0o600});
 if(process.env.GITHUB_ENV){if(!isAbsolute(process.env.GITHUB_ENV)||/[\r\n]/.test(path))throw Error('Private runner state path required');await appendFile(process.env.GITHUB_ENV,'AGENTCI_IMAGE_SMOKE_STATE_FILE='+path+'\n');}return path;
}
export async function cleanupImageSmokeState(path,{command}={}){
 if(!isAbsolute(path)||resolve(path)!==path||basename(path)!=='ownership.json'||!basename(dirname(path)).startsWith('agentci-image-smoke-'))throw Error('Owned smoke state path required');
 let record;
 try{for(const [file,directory,mode]of[[dirname(path),true,0o700],[path,false,0o600]]){const info=await lstat(file);if(info.isSymbolicLink()||(directory?!info.isDirectory():!info.isFile())||(info.mode&0o777)!==mode||(process.getuid&&info.uid!==process.getuid()))throw Error('Smoke state privacy guard failed');}record=JSON.parse(await readFile(path,'utf8'));}
 catch(error){if(error.code!=='ENOENT')throw error;const file=dirname(path)+'.cleanup.json',info=await lstat(file);if(!info.isFile()||info.isSymbolicLink()||(info.mode&0o777)!==0o600||(process.getuid&&info.uid!==process.getuid()))throw Error('Private smoke cleanup receipt unavailable');record=JSON.parse(await readFile(file,'utf8'));if(record.result!=='passed'||record.privateFilesRemoved!==true)throw Error('Prior smoke cleanup incomplete');}
 if(record.schemaVersion!==1||!/^agentci-smoke-[a-f0-9]{16}$/.test(record.owner))throw Error('Smoke cleanup identity invalid');
 const receipt=cleanupSmokeResources(record.owner,{command});await rm(dirname(path),{recursive:true,force:true});const complete={...receipt,privateFilesRemoved:true};await writeFile(dirname(path)+'.cleanup.json',JSON.stringify(complete)+'\n',{mode:0o600});return complete;
}
