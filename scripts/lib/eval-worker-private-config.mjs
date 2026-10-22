import {randomBytes} from 'node:crypto';
import {lstat,open,unlink} from 'node:fs/promises';
import {isAbsolute,join,resolve} from 'node:path';
import {escapeLiteral} from 'pg';

// Fixture-only identities: the administrator never becomes the evaluator login.
export const EVAL_FIXTURE_SCOPE=Object.freeze({database:'agentci',login:'eval_image',repository:'example/repo',organization:'00000000-0000-4000-8000-000000000001',temporalAddress:'temporal:7233'});
const invalid=()=>{throw Error('Invalid private evaluator fixture configuration');};
const text=value=>typeof value==='string'&&value.length>0&&value.length<=8192&&value.isWellFormed()&&!/[\u0000-\u001f\u007f]/.test(value);
const credential=value=>{if(!text(value)||Buffer.byteLength(value)>1024)invalid();return value;};
const image=value=>typeof value==='string'&&/^sha256:[a-f0-9]{64}$/.test(value)&&value.length===71;
const absolute=value=>text(value)&&isAbsolute(value)&&resolve(value)===value;

/** Docker env-file semantics: literal single-line values, not shell/YAML interpolation. */
export function serializePrivateEnvironment(values){
 if(!(values instanceof Map)||values.size===0||values.size>64)invalid();
 const lines=[];
 for(const [key,value]of values){
  if(!text(key)||key.length>128||!(/^[A-Z][A-Z0-9_]*$/).test(key)||!text(value))invalid();
  lines.push(key+'='+value);
 }
 const content=lines.join('\n')+'\n';if(Buffer.byteLength(content)>65536)invalid();return content;
}

/** node-postgres supports URL query parameters; URLSearchParams encodes delimiters once. */
export function evalFixtureDatabaseUrl({host,port,user,credential:authentication}={}){
 if(!['127.0.0.1','postgres'].includes(host)||!['postgres',EVAL_FIXTURE_SCOPE.login].includes(user)||!Number.isInteger(port)||port<1||port>65535)invalid();
 const url=new URL('postgresql://'+host+'/'+EVAL_FIXTURE_SCOPE.database);url.port=String(port);
 url.searchParams.set('user',user);url.searchParams.set('password',credential(authentication));return url.href;
}

export function evalFixtureRestrictedRoleSql(authentication){
 return 'CREATE ROLE '+EVAL_FIXTURE_SCOPE.login+' LOGIN PASSWORD '+escapeLiteral(credential(authentication))+' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS IN ROLE agentci_eval_executor';
}

/** Exclusive creation in an owned private directory; never follow/overwrite an existing file. */
export async function writePrivateFixtureFile(directory,name,content){
 let file,path,created;
 try{
  if(!absolute(directory)||!text(name)||name.length>128||!(/^[a-z][a-z0-9-]*\.(?:env|json|yaml)$/).test(name)||typeof content!=='string'||!content.isWellFormed()||Buffer.byteLength(content)>65536)invalid();
  const metadata=await lstat(directory);
  if(!metadata.isDirectory()||metadata.isSymbolicLink()||(metadata.mode&0o777)!==0o700||process.getuid&&metadata.uid!==process.getuid())invalid();
  path=join(directory,name);file=await open(path,'wx',0o600);
  created=await file.stat();
  if(!created.isFile()||(created.mode&0o777)!==0o600||created.nlink!==1||process.getuid&&created.uid!==process.getuid())invalid();
  await file.writeFile(content,'utf8');await file.close();file=undefined;return path;
 }catch{
  // A failed write must not strand a provider file outside the main fixture directory.
  // Remove only the inode exclusively created by this call; never an existing/replaced path.
  if(created)try{const current=await lstat(path);if(created.dev===current.dev&&created.ino===current.ino&&!current.isSymbolicLink())await unlink(path);}catch{}
  throw Error('Private evaluator fixture file operation failed');
 }
 finally{try{await file?.close();}catch{throw Error('Private evaluator fixture file operation failed');}}
}

/** Credentials stay in this closure; public serialization never contains their values. */
export function createEvalWorkerPrivateConfig(){
 const bootstrapCredential=randomBytes(32).toString('hex'),evaluatorCredential=randomBytes(32).toString('hex');
 if(bootstrapCredential===evaluatorCredential)invalid();
 const workerUrl=()=>evalFixtureDatabaseUrl({host:'postgres',port:5432,user:EVAL_FIXTURE_SCOPE.login,credential:evaluatorCredential});
 return Object.freeze({
  scope:EVAL_FIXTURE_SCOPE,
  postgresEnvironment:()=>new Map([['POSTGRES_PASSWORD',bootstrapCredential],['POSTGRES_DB',EVAL_FIXTURE_SCOPE.database]]),
  administratorUrl:port=>evalFixtureDatabaseUrl({host:'127.0.0.1',port,user:'postgres',credential:bootstrapCredential}),
  restrictedRoleSql:()=>evalFixtureRestrictedRoleSql(evaluatorCredential),
  workerEnvironment({engine,runnerImage}={}){
   if(!['docker','podman'].includes(engine)||!image(runnerImage))invalid();
   return new Map([
    ['AGENTCI_CONTAINER_ENGINE',engine],['CONTAINER_HOST','unix:///run/agentci/engine.sock'],['DOCKER_HOST','unix:///run/agentci/engine.sock'],
    ['AGENTCI_REPOSITORY',EVAL_FIXTURE_SCOPE.repository],['AGENTCI_ORGANIZATION_ID',EVAL_FIXTURE_SCOPE.organization],
    ['AGENTCI_EVAL_DATABASE_URL',workerUrl()],['TEMPORAL_ADDRESS',EVAL_FIXTURE_SCOPE.temporalAddress],['AGENTCI_EVAL_RUNNER_IMAGE',runnerImage],
   ]);
  },
  composeEnvironment({environment,endpoint,socket,socketGid,workerImage,runnerImage,remoteShared,owner}={}){
   if(!environment||typeof environment!=='object'||Array.isArray(environment)||!text(endpoint)||!endpoint.startsWith('unix:///')||!absolute(endpoint.slice(7))||!absolute(socket)||typeof socketGid!=='string'||socketGid.length>10||!(/^[0-9]+$/).test(socketGid)||!image(workerImage)||!image(runnerImage)||!absolute(remoteShared)||typeof owner!=='string'||owner.length!==30||!(/^agentci-smoke-[a-f0-9]{16}$/).test(owner))invalid();
   const values=new Map([
    ['DOCKER_HOST',endpoint],['DOCKER_CONTEXT',''],['AGENTCI_CONTAINER_ENGINE','podman'],['AGENTCI_CONTAINER_SOCKET_PATH',socket],['AGENTCI_CONTAINER_SOCKET_GID',socketGid],
    ['AGENTCI_EVAL_WORKER_IMAGE',workerImage],['AGENTCI_EVAL_RUNNER_IMAGE',runnerImage],['AGENTCI_EVAL_ENGINES_IMAGE',''],
    ['AGENTCI_REPOSITORY',EVAL_FIXTURE_SCOPE.repository],['AGENTCI_ORGANIZATION_ID',EVAL_FIXTURE_SCOPE.organization],['AGENTCI_EVAL_DATABASE_URL',workerUrl()],
    ['AGENTCI_EVAL_PGUSER',EVAL_FIXTURE_SCOPE.login],['AGENTCI_EVAL_PGPASSWORD',evaluatorCredential],['AGENTCI_EVAL_TEMPORAL_ADDRESS',EVAL_FIXTURE_SCOPE.temporalAddress],
    ['AGENTCI_EVAL_PROVIDERS_FILE',join(remoteShared,owner+'-providers.json')],['AGENTCI_CONTROLLER_NETWORK',owner],
   ]);
   // Empty values intentionally disable context/optional engine inheritance in Compose.
   return {...environment,...Object.fromEntries(values)};
  },
 });
}
