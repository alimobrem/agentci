import {execFileSync} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {IMAGE_ROLES} from './image-publication.mjs';

export function validateDownloadedIdentity(role,reference,source,version,arch,image){
 if(!IMAGE_ROLES.includes(role)||!new RegExp('^ghcr\\.io/alimobrem/agentci-'+role+'@sha256:[a-f0-9]{64}$').test(reference))throw new Error('Repository-scoped immutable role digest required');
 if(!/^[a-f0-9]{40}$/.test(source)||!/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(version)||!['amd64','arm64'].includes(arch))throw new Error('Invalid release identity');
 if(image.Os!=='linux'||image.Architecture!==arch||image.Config?.Labels?.['org.opencontainers.image.revision']!==source||image.Config?.Labels?.['org.opencontainers.image.version']!==version||image.Config?.Labels?.['org.opencontainers.image.source']!=='https://github.com/alimobrem/agentci'||!image.RepoDigests?.includes(reference)||!/^sha256:[a-f0-9]{64}$/.test(image.Id))throw new Error('Downloaded source/version/platform/digest identity mismatch');
 return {role,image:reference,localImageId:image.Id,platform:'linux/'+arch,sourceCommit:source,version};
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
 const source=process.env.RELEASE_SOURCE,version=process.env.RELEASE_VERSION,arch=process.env.RELEASE_ARCH;
 const nativeArch=process.arch==='x64'?'amd64':process.arch;
 if(arch!==nativeArch||process.platform!=='linux')throw new Error('Download acceptance requires a native Linux host for the requested architecture');
 const configuration=await mkdtemp(join(tmpdir(),'agentci-anonymous-docker-'));
 const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',env:{...process.env,DOCKER_CONFIG:configuration},stdio:['pipe','pipe','pipe'],timeout:300000}).trim();
 try{
  const server=JSON.parse(docker('info','--format','{{json .}}'));
  if(server.OSType!=='linux'||!([arch,arch==='amd64'?'x86_64':'aarch64'].includes(server.Architecture)))throw new Error('Docker server architecture differs from native acceptance host');
  const identities=[];
  for(const role of IMAGE_ROLES){
   const reference=process.env[role.toUpperCase().replaceAll('-','_')+'_IMAGE'];
   // Reject malformed references before passing an input to the container engine.
   if(!new RegExp('^ghcr\\.io/alimobrem/agentci-'+role+'@sha256:[a-f0-9]{64}$').test(reference??''))throw new Error('Missing immutable role image: '+role);
   docker('pull','--platform','linux/'+arch,reference);
   const image=JSON.parse(docker('image','inspect',reference))[0];
   identities.push(validateDownloadedIdentity(role,reference,source,version,arch,image));
   docker('tag',reference,'agentci-'+role+':downloaded');
  }
  await writeFile('downloaded-identities.json',JSON.stringify({sourceCommit:source,version,platform:'linux/'+arch,execution:'native',anonymous:true,dockerServer:{version:server.ServerVersion,architecture:server.Architecture},images:identities},null,2)+'\n');
 }finally{await rm(configuration,{recursive:true,force:true});}
}
