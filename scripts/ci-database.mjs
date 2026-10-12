import {appendFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {isAbsolute} from 'node:path';
import {startCustomerDatabase,stopCustomerDatabase} from './lib/customer-ci-database.mjs';
import {runWithDatabase,requireDatabaseCommandsStopped} from './lib/ci-database-command.mjs';
const action=process.argv[2];
try{
 if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REPOSITORY!=='alimobrem/agentci')throw Error('Owned CI runner required');
 if(action==='start'){
  const source=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',env:{PATH:process.env.PATH}}).trim();
  if(!isAbsolute(process.env.RUNNER_TEMP??'')||!isAbsolute(process.env.GITHUB_ENV??''))throw Error('Private runner paths required');
  await startCustomerDatabase({base:process.env.RUNNER_TEMP,runId:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT,source,mask:value=>process.stdout.write('::add-mask::'+value+'\n'),onState:path=>{if(/[\r\n]/.test(path))throw Error('Invalid private state path');return appendFile(process.env.GITHUB_ENV,'AGENTCI_CI_DATABASE_CONFIG_FILE='+path+'\n');}});
  console.log('Private loopback CI database authenticated');
 }else if(action==='run'){
  const args=process.argv.slice(3),redactArtifact=args[0]==='--redact-integration-artifact';if(redactArtifact)args.shift();
  process.exitCode=await runWithDatabase(process.env.AGENTCI_CI_DATABASE_CONFIG_FILE,args,{redactArtifact,onArtifactSafe:async()=>{if(!isAbsolute(process.env.GITHUB_OUTPUT??''))throw Error('Private runner output path required');await appendFile(process.env.GITHUB_OUTPUT,'redaction_complete=true\n');}});
 }else if(action==='stop'){
  if(!process.env.AGENTCI_CI_DATABASE_CONFIG_FILE&&process.env.AGENTCI_CI_DATABASE_START_OUTCOME!=='skipped')throw Error('Database start outcome unknown');
  if(process.env.AGENTCI_CI_DATABASE_CONFIG_FILE)await requireDatabaseCommandsStopped(process.env.AGENTCI_CI_DATABASE_CONFIG_FILE);
  const receipt=await stopCustomerDatabase(process.env.AGENTCI_CI_DATABASE_CONFIG_FILE);
  await writeFile('ci-database-cleanup.json',JSON.stringify(receipt,null,2)+'\n');console.log('Owned CI database removed and private files cleared');
 }else throw Error('Use start, run or stop');
}catch{
 if(action==='stop')await writeFile('ci-database-cleanup.json',JSON.stringify({schemaVersion:1,result:'recovery-required-or-unverified',ownedContainers:'unverified',privateState:'retain for owned recovery'})+'\n').catch(()=>{});
 console.error('CI database operation failed; credentials withheld, preserve incomplete private cleanup state');process.exitCode=1;
}
