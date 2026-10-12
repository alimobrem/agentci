import {mkdtemp,writeFile,rm,chmod} from 'node:fs/promises';
import {join} from 'node:path';
export const CUSTOMER_REPOSITORY='alimobrem/agentci-onboarding-demo';
const fail=()=>{throw Error('Customer preflight rejected identity, permissions or immutable fixture scope');};
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
const sha=value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
export function validateCustomerInputs(input){
 if(!exact(input,['repository','serviceSource','appId','installationId','subjects'])||input?.repository!==CUSTOMER_REPOSITORY||!sha(input.serviceSource)||!Number.isSafeInteger(input.appId)||input.appId<1||input.appId===5179954||!Number.isSafeInteger(input.installationId)||input.installationId<1||input.installationId===167655696||!Array.isArray(input.subjects)||input.subjects.length!==2)fail();
 const ids=new Set();
 for(const subject of input.subjects){if(!exact(subject,['kind','pullRequest','baseSha','headSha'])||!['seeded','fixed'].includes(subject.kind)||ids.has(subject.kind)||!Number.isSafeInteger(subject.pullRequest)||subject.pullRequest<1||!sha(subject.baseSha)||!sha(subject.headSha)||subject.baseSha===subject.headSha)fail();ids.add(subject.kind);}
 if(input.subjects[0].headSha===input.subjects[1].headSha)fail();
 return input;
}
export function validateCustomerPermissions(permissions){
 const required={contents:'read',pull_requests:'read',metadata:'read',checks:'write'};
 if(!permissions||Object.entries(required).some(([key,value])=>permissions[key]!==value)||Object.entries(permissions).some(([key,value])=>!(key in required)&&value!=='none'))fail();
}
/** Read-only API guard. No branches, PRs, commits or Checks are created here. */
export function validateCustomerInstallationInputs(input){
 if(!exact(input,['repository','serviceSource','appId','installationId'])||input.repository!==CUSTOMER_REPOSITORY||!sha(input.serviceSource)||!Number.isSafeInteger(input.appId)||input.appId<1||input.appId===5179954||!Number.isSafeInteger(input.installationId)||input.installationId<1||input.installationId===167655696)fail();return input;
}
export async function inspectCustomerInstallationScope(input,appClient,installationClient){
 validateCustomerInstallationInputs(input);
 const app=(await appClient.request('GET /app')).data;
 if(app.id!==input.appId)fail();validateCustomerPermissions(app.permissions);
 const installation=(await appClient.request('GET /app/installations/{installation_id}',{installation_id:input.installationId})).data;
 if(installation.id!==input.installationId||installation.app_id!==input.appId||installation.account?.login!=='alimobrem'||installation.repository_selection!=='selected'||installation.suspended_at)fail();validateCustomerPermissions(installation.permissions);
 const repositories=(await installationClient.request('GET /installation/repositories',{per_page:100})).data;
 if(repositories.total_count!==1||repositories.repositories?.length!==1||repositories.repositories[0].full_name!==CUSTOMER_REPOSITORY)fail();
 return {schemaVersion:1,result:'installation-scope-passed',...input,permissions:{contents:'read',pull_requests:'read',metadata:'read',checks:'write'},fixtureHeads:'not-yet-validated',liveScenarioExecution:'unverified'};
}
export async function inspectCustomerScope(input,appClient,installationClient){
 validateCustomerInputs(input);
 await inspectCustomerInstallationScope({repository:input.repository,serviceSource:input.serviceSource,appId:input.appId,installationId:input.installationId},appClient,installationClient);
 for(const subject of input.subjects){const pr=(await installationClient.request('GET /repos/{owner}/{repo}/pulls/{pull_number}',{owner:'alimobrem',repo:'agentci-onboarding-demo',pull_number:subject.pullRequest})).data;
  if(pr.state!=='open'||pr.base?.repo?.full_name!==CUSTOMER_REPOSITORY||pr.head?.repo?.full_name!==CUSTOMER_REPOSITORY||pr.base.sha!==subject.baseSha||pr.head.sha!==subject.headSha)fail();
 }
 return {schemaVersion:1,result:'preflight-passed',repository:CUSTOMER_REPOSITORY,serviceSource:input.serviceSource,appId:input.appId,installationId:input.installationId,permissions:{contents:'read',pull_requests:'read',metadata:'read',checks:'write'},subjects:input.subjects,liveScenarioExecution:'unverified'};
}
/** Keep the private key only when owned cleanup explicitly requires recovery. */
export async function withCustomerKey(secret,parent,run){
 if(typeof secret!=='string'||!secret.includes('-----BEGIN')||secret.length>32768)throw Error('Missing or invalid separate customer App secret');
 const root=await mkdtemp(join(parent,'agentci-customer-private-'));await chmod(root,0o700);
 let recovery=false;
 try{const path=join(root,'app.pem');await writeFile(path,secret,{mode:0o600,flag:'wx'});return await run(path);}catch(error){recovery=error?.customerRecoveryRequired===true;throw error;}finally{if(!recovery)await rm(root,{recursive:true,force:true});}
}
