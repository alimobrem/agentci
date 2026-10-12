import {spawn} from 'node:child_process';
import {pipeline} from 'node:stream/promises';
import {open,rm,writeFile,readdir,readFile,lstat} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {constants} from 'node:fs';
import {readDatabaseState,customerDatabaseUrl,databaseOwnership} from './customer-ci-database.mjs';
import {credentialOutput} from './credential-output.mjs';
import {waitOwnedCommand,ownedGroupMembers,terminateOwnedGroup} from './owned-command.mjs';

export async function redactIntegrationArtifact(values,{required=true,onSafe=async()=>{}}={}){
 let file,failure=false,result='passed';
 try{
  file=await open('downloaded-integration.json',constants.O_RDWR|constants.O_NOFOLLOW);
  const info=await file.stat();if(!info.isFile()||info.nlink!==1||info.size>16*1024*1024||(process.getuid&&info.uid!==process.getuid()))throw Error('Integration artifact privacy guard failed');
  const text=await file.readFile('utf8'),safe=values.reduce((value,secret)=>value.split(secret).join('[REDACTED]'),text);
  JSON.parse(safe);await file.chmod(0o600);if(safe!==text){await file.truncate(0);await file.write(safe,0,'utf8');}
 }catch(error){
  if(error.code==='ENOENT'&&!required)result='not-produced';
  else{await rm('downloaded-integration.json',{recursive:true,force:true});failure=true;result='unsafe-artifact-removed';}
 }finally{await file?.close();}
 await writeFile('downloaded-integration-redaction.json',JSON.stringify({schemaVersion:1,result,safeForUpload:true})+'\n');await onSafe();
 if(failure)throw Error('Unsafe integration artifact removed from retained path');
}
export async function requireDatabaseCommandsStopped(path){
 let state;try{state=await readDatabaseState(path);}catch(error){
  if(error.code!=='ENOENT')throw error;
  let missing=false;try{await lstat(dirname(path));}catch(error){if(error.code!=='ENOENT')throw error;missing=true;}
  if(!missing)throw Error('Database state missing while command recovery remains unverified');await databaseOwnership(path);return;
 }
 for(const name of await readdir(dirname(path)))if(name.startsWith('command-')){
  const info=await lstat(join(dirname(path),name));if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||(info.mode&0o777)!==0o600)throw Error('Private command journal unavailable');
  const record=JSON.parse(await readFile(join(dirname(path),name),'utf8'));
  if(record.schemaVersion!==1||record.owner!==state.owner||record.result!=='zero-owned-processes'||!(record.pid===null||Number.isSafeInteger(record.pid)&&record.pid>1)||record.pid&&(await ownedGroupMembers(record.pid)).length)throw Error('Owned database command recovery remains required');
 }
}
export async function runWithDatabase(path,args,{environment=process.env,stdout=process.stdout,stderr=process.stderr,launch=spawn,redactArtifact=false,onArtifactSafe=async()=>{},journal=writeFile}={}){
 if(!args.length||args.some(value=>typeof value!=='string'||value.includes('\0')))throw Error('A trusted database command is required');
 const state=await readDatabaseState(path),url=await customerDatabaseUrl(path);
 const record=join(dirname(path),'command-'+randomBytes(8).toString('hex')+'.json');await writeFile(record,JSON.stringify({schemaVersion:1,owner:state.owner,result:'launching',pid:null}),{mode:0o600});
 let child,completion;
 let passed=false;
 try{
  child=launch(args[0],args.slice(1),{env:{...environment,DATABASE_URL:url,AGENTCI_TEST_DATABASE_URL:url,PGUSER:state.user,['PGPASSWORD']:state.password},stdio:['ignore','pipe','pipe'],detached:true});
  const output=Promise.all([pipeline(child.stdout,credentialOutput([url,state.password]),stdout,{end:false}),pipeline(child.stderr,credentialOutput([url,state.password]),stderr,{end:false})]);
  completion=waitOwnedCommand(child,output);completion.catch(()=>{});
  await journal(record,JSON.stringify({schemaVersion:1,owner:state.owner,result:'running',pid:child.pid??null}),{mode:0o600});
  passed=await completion===0;return passed?0:1;
 }finally{
  if(child)await terminateOwnedGroup(child);
  if(completion)await completion.catch(()=>{});
  if(!child?.pid||!(await ownedGroupMembers(child.pid)).length)await writeFile(record,JSON.stringify({schemaVersion:1,owner:state.owner,result:'zero-owned-processes',pid:child?.pid??null}),{mode:0o600});
  if(redactArtifact)await redactIntegrationArtifact([url,state.password],{required:passed,onSafe:onArtifactSafe});
 }
}
