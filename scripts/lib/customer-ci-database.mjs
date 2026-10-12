import {randomBytes} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,readFile,lstat,rm} from 'node:fs/promises';
import {resolve,dirname,join,isAbsolute} from 'node:path';
import {spawnSync} from 'node:child_process';
import {Client} from 'pg';
export const CUSTOMER_POSTGRES_IMAGE='postgres:18.6-alpine@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873';
const INSPECT='{"name":{{json .Name}},"image":{{json .Config.Image}},"labels":{{json .Config.Labels}},"running":{{json .State.Running}},"status":{{json .State.Status}},"ports":{{json .NetworkSettings.Ports}}}';
const LABEL='agentci.customer.ci-db.owner';
export function databaseCommand(args){const result=spawnSync('docker',args,{env:{PATH:process.env.PATH},encoding:'utf8',timeout:30000,maxBuffer:1024*1024,stdio:['ignore','pipe','pipe']});if(result.error||result.status!==0)throw Error('Owned database engine operation failed');return result.stdout.trim();}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
export async function readDatabaseState(path){
 if(!isAbsolute(path)||resolve(path)!==path)throw Error('Absolute private database state required');
 for(const [file,mode,directory] of [[dirname(path),0o700,true],[path,0o600,false]]){const info=await lstat(file);if(info.isSymbolicLink()||(directory?!info.isDirectory():!info.isFile())||(info.mode&0o777)!==mode||(process.getuid&&info.uid!==process.getuid()))throw Error('Database state privacy guard failed');}
 let state;try{state=JSON.parse(await readFile(path,'utf8'));}catch{throw Error('Private database state is invalid');}
 if(state.schemaVersion!==1||state.image!==CUSTOMER_POSTGRES_IMAGE||!/^agentci-customer-pg-[1-9]\d*-[1-9]\d*-[a-f0-9]{16}$/.test(state.name)||!/^\d+:\d+:[a-f0-9]{40}:[a-f0-9]{16}$/.test(state.owner)||!/^[a-f0-9]{64}$/.test(state.password)||state.database!=='agentci_customer'||state.user!=='postgres')throw Error('Database state identity guard failed');
 return state;
}
function ownership(state){if(state.image!==CUSTOMER_POSTGRES_IMAGE||!/^agentci-customer-pg-[1-9]\d*-[1-9]\d*-[a-f0-9]{16}$/.test(state.name)||!/^\d+:\d+:[a-f0-9]{40}:[a-f0-9]{16}$/.test(state.owner))throw Error('Database cleanup identity invalid');return {schemaVersion:1,name:state.name,owner:state.owner,image:state.image};}
async function cleanupState(path){const file=dirname(path)+'.cleanup.json',info=await lstat(file);if(!info.isFile()||info.isSymbolicLink()||(info.mode&0o777)!==0o600||(process.getuid&&info.uid!==process.getuid()))throw Error('Private cleanup receipt unavailable');let record;try{record=JSON.parse(await readFile(file,'utf8'));}catch{throw Error('Private cleanup receipt invalid');}if(record.schemaVersion!==1||record.result!=='passed'||record.ownedContainers!==0||record.privateFilesRemoved!==true)throw Error('Incomplete prior database cleanup');return ownership(record);}
function verifyOwned(info,state){if(info.name!=='/'+state.name||info.image!==state.image||info.labels?.[LABEL]!==state.owner)throw Error('Database ownership mismatch');}
function inspected(id,command){const info=JSON.parse(command(['inspect','--format',INSPECT,id]));if(Object.keys(info).sort().join(',')!=='image,labels,name,ports,running,status')throw Error('Unexpected database inspection fields');return info;}
function connectionUrl(state){if(!Number.isInteger(state.port)||state.port<1||state.port>65535)throw Error('Owned database port unavailable');const url=new URL('postgresql://127.0.0.1/agentci_customer');url.port=String(state.port);url.username=state.user;url.password=state.password;return url.href;}
export async function databaseOwnership(path){try{return ownership(await readDatabaseState(path));}catch(error){if(error.code==='ENOENT')return cleanupState(path);throw error;}}
export async function customerDatabaseUrl(path){return connectionUrl(await readDatabaseState(path));}
export async function stopCustomerDatabase(path,{command=databaseCommand}={}){
 if(!path)return {result:'not-started',ownedContainers:0};
 let state;try{state=await readDatabaseState(path);}catch(error){if(error.code==='ENOENT')state=await cleanupState(path);else throw error;}
 const ids=command(['ps','--all','--quiet','--filter','name=^/'+state.name+'$']).split(/\s+/).filter(Boolean);if(ids.length>1)throw Error('Ambiguous owned database inventory');
 for(const id of ids){if(!/^[a-f0-9]{12,64}$/.test(id))throw Error('Invalid owned database ID');verifyOwned(inspected(id,command),state);command(['rm','--force','--volumes',id]);}
 if(command(['ps','--all','--quiet','--filter','name=^/'+state.name+'$']).trim())throw Error('Owned database remains after cleanup');
 const receipt={...ownership(state),result:'passed',ownedContainers:0,privateFilesRemoved:true};await rm(dirname(path),{recursive:true,force:true});await writeFile(dirname(path)+'.cleanup.json',JSON.stringify(receipt),{mode:0o600});return receipt;
}
export async function startCustomerDatabase({base,runId,attempt,source,mask,onState=async()=>{},command=databaseCommand,health,tries=60,delay=500,removePrivateDirectory=rm}){
 if(!isAbsolute(base)||!(/^[1-9]\d*$/.test(runId)&&/^[1-9]\d*$/.test(attempt)&&/^[a-f0-9]{40}$/.test(source))||typeof mask!=='function')throw Error('Owned database setup identity required');
 await mkdir(base,{recursive:true});const root=await mkdtemp(join(base,'agentci-customer-pg-')),path=join(root,'state.json'),nonce=randomBytes(8).toString('hex');
 let creationAttempted=false;const state={schemaVersion:1,name:`agentci-customer-pg-${runId}-${attempt}-${nonce}`,owner:`${runId}:${attempt}:${source}:${nonce}`,image:CUSTOMER_POSTGRES_IMAGE,user:'postgres',database:'agentci_customer',password:randomBytes(32).toString('hex'),port:null};
 try{
  await writeFile(path,JSON.stringify(state),{mode:0o600});mask(state.password);await onState(path);
  const envFile=join(root,'postgres.env');await writeFile(envFile,`POSTGRES_PASSWORD=${state.password}\nPOSTGRES_USER=${state.user}\nPOSTGRES_DB=${state.database}\nPOSTGRES_HOST_AUTH_METHOD=scram-sha-256\nPOSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 --auth-local=scram-sha-256\n`,{mode:0o600});
  // The environment file is read by the client, never mounted. No credential in argv or child environment.
  creationAttempted=true;command(['run','--detach','--name',state.name,'--label',`${LABEL}=${state.owner}`,'--env-file',envFile,'--publish','127.0.0.1::5432','--memory','768m','--cpus','1','--pids-limit','256','--tmpfs','/var/lib/postgresql:rw,nosuid,nodev,size=512m',state.image]);
  const ids=command(['ps','--all','--quiet','--filter','name=^/'+state.name+'$']).split(/\s+/).filter(Boolean);if(ids.length!==1||!/^[a-f0-9]{12,64}$/.test(ids[0]))throw Error('Owned database creation outcome ambiguous');
  const info=inspected(ids[0],command);verifyOwned(info,state);const ports=info.ports?.['5432/tcp'];if(info.running!==true||!Array.isArray(ports)||ports.length!==1||ports[0].HostIp!=='127.0.0.1'||!/^\d+$/.test(ports[0].HostPort))throw Error('Owned database loopback binding required');state.port=Number(ports[0].HostPort);await writeFile(path,JSON.stringify(state),{mode:0o600});const url=connectionUrl(state);mask(url);
  const probe=health??(async()=>{const client=new Client({connectionString:url,connectionTimeoutMillis:1000,statement_timeout:1000});try{await client.connect();await client.query('SELECT 1');}finally{await client.end().catch(()=>{});}});
  let ready=false;for(let i=0;i<tries;i++){try{await probe();ready=true;break;}catch{if(i+1<tries)await pause(delay);}}
  if(!ready)throw Error('Authenticated owned database health check failed');
  await writeFile(join(root,'startup.json'),JSON.stringify({...ownership(state),result:'authenticated-ready'}),{mode:0o600});
  return {path,name:state.name,image:state.image,host:'127.0.0.1',port:state.port};
 }catch{try{if(creationAttempted)await stopCustomerDatabase(path,{command});else{const receipt={...ownership(state),result:'passed',ownedContainers:0,privateFilesRemoved:true,creationAttempted:false};await removePrivateDirectory(root,{recursive:true,force:true});await writeFile(root+'.cleanup.json',JSON.stringify(receipt),{mode:0o600});}}catch{throw Error('Owned database startup failed; cleanup incomplete, private state retained');}throw Error('Owned database startup failed; owned resources cleaned');}
}
