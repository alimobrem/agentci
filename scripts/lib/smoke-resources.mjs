import {spawnSync} from 'node:child_process';
export const SMOKE_OWNER_LABEL='agentci.image-smoke.owner';
export function smokeEngine(args,{input}={}){
 const result=spawnSync('docker',args,{input,env:{PATH:process.env.PATH},encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:60000,maxBuffer:16*1024*1024});
 if(result.error||result.status!==0)throw Error('Owned smoke engine operation failed; diagnostic content withheld');return result.stdout.trim();
}
export function cleanupSmokeResources(owner,{command=smokeEngine}={}){
 if(!/^agentci-smoke-[a-f0-9]{16}$/.test(owner))throw Error('Smoke ownership identity required');
 const filter=`label=${SMOKE_OWNER_LABEL}=${owner}`;
 const inventory=kind=>command(kind==='container'?['ps','--all','--quiet','--filter',filter]:[kind,'ls','--quiet','--filter',filter]).split(/\s+/).filter(Boolean);
 const verify=(kind,id)=>{
  const format=kind==='container'?'{"name":{{json .Name}},"labels":{{json .Config.Labels}}}':'{"name":{{json .Name}},"labels":{{json .Labels}}}';
  const info=JSON.parse(command(kind==='container'?['inspect','--format',format,id]:[kind,'inspect','--format',format,id]));
  if(Object.keys(info).sort().join(',')!=='labels,name'||info.labels?.[SMOKE_OWNER_LABEL]!==owner||!(info.name===owner||info.name.startsWith(owner+'-')||info.name.startsWith('/'+owner+'-')))throw Error('Smoke resource ownership mismatch');
 };
 for(const kind of ['container','network','volume']){
  const ids=inventory(kind);if(new Set(ids).size!==ids.length)throw Error('Ambiguous smoke resource inventory');
  for(const id of ids){verify(kind,id);try{command(kind==='container'?['rm','--force','--volumes',id]:[kind,'rm',id]);}catch{if(inventory(kind).includes(id))throw Error('Smoke resource teardown incomplete');}}
  if(inventory(kind).length)throw Error('Owned smoke resources remain after teardown');
 }
 return {schemaVersion:1,result:'passed',owner,ownedContainers:0,ownedNetworks:0,ownedVolumes:0};
}
