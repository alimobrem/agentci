import {requireCustomerInfrastructureTeardown,stopCustomerTemporal} from './lib/customer-infrastructure-teardown.mjs';
import {appendFile,writeFile,rm} from 'node:fs/promises';
import {startCustomerDatabase,stopCustomerDatabase} from './lib/customer-ci-database.mjs';
try{
 if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REPOSITORY!=='alimobrem/agentci'||process.env.GITHUB_REF!=='refs/heads/main')throw Error('Trusted customer CI database context required');
 const command=process.argv[2];
 if(command==='start'){
  if(!process.env.GITHUB_ENV||!process.env.RUNNER_TEMP)throw Error('Private runner context required');
  await startCustomerDatabase({base:process.env.RUNNER_TEMP,runId:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT,source:process.env.GITHUB_SHA,mask:value=>process.stdout.write('::add-mask::'+value+'\n'),onState:path=>{if(/[\r\n]/.test(path))throw Error('Invalid private state path');return appendFile(process.env.GITHUB_ENV,'AGENTCI_CUSTOMER_DATABASE_CONFIG_FILE='+path+'\n');}});
  console.log('Owned loopback database passed authenticated health check');
 }else if(command==='stop'){
  if(process.env.AGENTCI_CUSTOMER_DATABASE_CONFIG_FILE)await requireCustomerInfrastructureTeardown(process.env.AGENTCI_CUSTOMER_DATABASE_CONFIG_FILE);else if(process.env.AGENTCI_CUSTOMER_DATABASE_START_OUTCOME!=='skipped'||process.env.AGENTCI_CUSTOMER_DEMO_OUTCOME!=='skipped')throw Error('Unknown database startup state');
  const receipt=await stopCustomerDatabase(process.env.AGENTCI_CUSTOMER_DATABASE_CONFIG_FILE);await writeFile('customer-ci-database-cleanup.json',JSON.stringify(receipt,null,2)+'\n');console.log('Owned database cleanup completed');
 }else if(command==='stop-temporal'){const receipt=await stopCustomerTemporal(process.env.AGENTCI_CUSTOMER_DATABASE_CONFIG_FILE);await writeFile('customer-ci-temporal-cleanup.json',JSON.stringify(receipt,null,2)+'\n');await rm('customer-demo-input.json',{force:true});console.log('Owned Temporal cleanup completed');}else throw Error('Use start, stop or stop-temporal');
}catch{if(['stop','stop-temporal'].includes(process.argv[2]))await writeFile(process.argv[2]==='stop'?'customer-ci-database-cleanup.json':'customer-ci-temporal-cleanup.json',JSON.stringify({schemaVersion:1,result:'recovery-required-or-unverified',ownedInfrastructureRemoved:'unverified',privateStateRetained:'unverified',retentionPolicy:'retain when recovery is required'})+'\n').catch(()=>{});console.error('Customer CI database operation failed; no credentials logged, preserve owned cleanup state');process.exitCode=1;}
