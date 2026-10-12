import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {Octokit} from '@octokit/rest';
import {createAppAuth} from '@octokit/auth-app';
import {requireCustomerActivation} from './lib/customer-activation.mjs';
import {inspectCustomerScope,inspectCustomerInstallationScope,validateCustomerInputs,validateCustomerInstallationInputs,withCustomerKey} from './lib/customer-acceptance-preflight.mjs';
// Trusted main only. Secret is consumed after dependency setup/build, never a child process input.
const secret=process.env.AGENTCI_CUSTOMER_APP_PRIVATE_KEY;delete process.env.AGENTCI_CUSTOMER_APP_PRIVATE_KEY;
try{
 if(process.env.GITHUB_REPOSITORY!=='alimobrem/agentci'||process.env.GITHUB_REF!=='refs/heads/main'||!['workflow_dispatch','push'].includes(process.env.GITHUB_EVENT_NAME))throw Error('Trusted manual main execution required');
 const scopeOnly=process.argv[3]==='--scope-only';if(process.argv.length!==(scopeOnly?4:3))throw Error('Invalid preflight arguments');
 const input=(scopeOnly?validateCustomerInstallationInputs:validateCustomerInputs)(JSON.parse(await readFile(process.argv[2],'utf8')));
 await requireCustomerActivation(scopeOnly?'scope':'existing-fixtures',input);
 if(input.serviceSource!==process.env.GITHUB_SHA||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',env:{PATH:process.env.PATH}}).trim()!==input.serviceSource)throw Error('Trusted service source mismatch');
 const result=await withCustomerKey(secret,process.env.RUNNER_TEMP,async path=>{
  const privateKey=await readFile(path,'utf8');
  const appAuth=createAppAuth({appId:input.appId,privateKey});
  const app=new Octokit({auth:(await appAuth({type:'app'})).token,request:{timeout:30000}});
  const installation=new Octokit({authStrategy:createAppAuth,auth:{appId:input.appId,installationId:input.installationId,privateKey},request:{timeout:30000}});
  return (scopeOnly?inspectCustomerInstallationScope:inspectCustomerScope)(input,app,installation);
 });
 await writeFile('customer-preflight.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}catch{console.error('Customer preflight failed; no live scenarios or fixture mutations were executed.');process.exitCode=1;}
