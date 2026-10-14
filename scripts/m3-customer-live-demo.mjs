import {writeFileSync,renameSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Connection} from '@temporalio/client';
import {customerSessionOwner} from './lib/customer-session-owner.mjs';
import {ownedCustomerDatabase} from './lib/customer-isolated-database.mjs';
import {terminateCustomerHarness} from './lib/customer-terminal-recovery.mjs';
import {writeCustomerTeardownReady,customerCleanupVerified} from './lib/customer-infrastructure-teardown.mjs';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {execFileSync} from 'node:child_process';import {Octokit} from '@octokit/rest';import {createAppAuth} from '@octokit/auth-app';
import {customerPublicationAssets} from './lib/customer-publication-assets.mjs';
import {withCustomerServiceLifetime} from './lib/customer-runtime-processes.mjs';
import {requireCustomerActivation} from './lib/customer-activation.mjs';
import {preparePublishedPackage} from './published-package-smoke.mjs';import {hash} from './lib/development-artifacts.mjs';import {validateCustomerInputs,inspectCustomerScope,withCustomerKey} from './lib/customer-acceptance-preflight.mjs';import {createCustomerServiceSession} from './lib/customer-service-session.mjs';import {runCustomerFourScenarios} from './lib/customer-four-scenarios.mjs';
const key=process.env.AGENTCI_CUSTOMER_APP_PRIVATE_KEY;delete process.env.AGENTCI_CUSTOMER_APP_PRIVATE_KEY;
let prepared,session,privateRoot,result,cleanup,partial;let sessionAttempted=false;let operationJournal=[],databaseJournal=[],diagnosticJournal,retention=Promise.resolve();
const operationSnapshot=()=>session?.snapshot().flatMap(({label,scope,namespace,operations})=>operations.map(operation=>({label,scope,namespace,...operation})));
const diagnosticsSnapshot=()=>session?{schemaVersion:2,sessions:session.snapshot().map(({label,scope,namespace,diagnostics})=>({label,scope,namespace,diagnostics}))}:diagnosticJournal;
const evidence=(status)=>JSON.stringify({schemaVersion:1,status,customerEndpointAcceptance:'unverified',M3MilestoneAcceptance:'pending',partial,operations:operationSnapshot()??operationJournal,diagnostics:diagnosticsSnapshot(),ownedDatabases:session?.databaseSnapshot()??databaseJournal,cleanup},null,2)+'\n';
const retain=(status,{signal}={})=>{const snapshot=evidence(status);retention=retention.catch(()=>{}).then(()=>writeFile('customer-live-demo.json',snapshot,{signal}));return retention;};
const fatalRecovery=()=>terminateCustomerHarness(session,()=>{cleanup=undefined;const path='customer-live-demo.recovery-'+process.pid+'.tmp';writeFileSync(path,evidence('failed-or-unverified'),{mode:0o600});renameSync(path,'customer-live-demo.json');});
try{
 if(process.argv.length!==3||process.env.GITHUB_REPOSITORY!=='alimobrem/agentci'||process.env.GITHUB_REF!=='refs/heads/main'||!['workflow_dispatch','push'].includes(process.env.GITHUB_EVENT_NAME))throw Error('Trusted manual main required');
 const input=JSON.parse(await readFile(process.argv[2],'utf8'));await requireCustomerActivation('demo',input);const fixtures=validateCustomerInputs(input.fixtures);if(fixtures.serviceSource!==process.env.GITHUB_SHA||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',env:{PATH:process.env.PATH}}).trim()!==fixtures.serviceSource)throw Error('Trusted harness source mismatch');
 const arch=process.arch==='x64'?'amd64':process.arch;
 // Anonymous bytes and both actual production installs are verified before a key file/config exists.
 prepared=await preparePublishedPackage({version:'0.4.0-m3-dev.4',sourceCommit:input.releaseSource,arch,manifestSha256:input.packageManifestSha256,packageSha256:input.packageSha256});
 const {trusted,images,publication}=await customerPublicationAssets(prepared,input);
 const role=kind=>{const image=trusted.images.find(value=>value.role===kind);if(!image||!image.platforms.includes('linux/'+arch))throw Error('Required native artifact missing');return image.image;};
 privateRoot=await mkdtemp(join(process.env.RUNNER_TEMP??tmpdir(),'agentci-customer-runtime-'));
 result=await withCustomerKey(key,privateRoot,async keyPath=>{
  const privateKey=await readFile(keyPath,'utf8'),auth=createAppAuth({appId:fixtures.appId,privateKey}),app=new Octokit({auth:(await auth({type:'app'})).token,request:{timeout:30000}}),installation=new Octokit({authStrategy:createAppAuth,auth:{appId:fixtures.appId,installationId:fixtures.installationId,privateKey},request:{timeout:30000}});
  const scope=await inspectCustomerScope(fixtures,app,installation);
  session=customerSessionOwner();
  const createScopedSession=async(label,namespace='default',databaseUrl=process.env.AGENTCI_CUSTOMER_DATABASE_URL)=>{
   const sessionRoot=await mkdtemp(join(privateRoot,label+'-'));
   sessionAttempted=true;
   const scoped=session.register(label,await createCustomerServiceSession({root:prepared.installedRoot,privateRoot:sessionRoot,keyPath,github:installation,fixtures,databaseUrl,temporalAddress:process.env.AGENTCI_CUSTOMER_TEMPORAL_ADDRESS,runnerImage:role('eval-runner'),evaluatorImage:role('eval-worker'),diagnosticIdentity:{harnessSource:fixtures.serviceSource,runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT,candidate:{releaseSource:input.releaseSource,packageManifestSha256:input.packageManifestSha256,packageSha256:input.packageSha256,imagesManifestSha256:input.imagesManifestSha256,publicationEvidenceSha256:input.publicationEvidenceSha256}},namespace,port:label==='primary'?3000:3001}));
   scoped.onDiagnostic=async(options)=>{diagnosticJournal=diagnosticsSnapshot();await retain('in-progress',options);};
   scoped.onIntent=async()=>{operationJournal=JSON.parse(JSON.stringify(operationSnapshot()));await retain('in-progress');};
   return scoped;
  };
  const primary=await createScopedSession('primary');
  const createStagedSession=async()=>{
   const database=session.registerDatabase(ownedCustomerDatabase(process.env.AGENTCI_CUSTOMER_DATABASE_URL));await retain('in-progress');await database.initialize();
   const namespace='customer-staged-'+randomUUID(),connection=await Connection.connect({address:process.env.AGENTCI_CUSTOMER_TEMPORAL_ADDRESS});
   try{await connection.workflowService.registerNamespace({namespace,workflowExecutionRetentionPeriod:{seconds:86400},description:'Owned ephemeral customer staged cancellation'});}finally{await connection.close();}
   return createScopedSession('staged-cancellation',namespace,database.url);
  };
  const execution=await withCustomerServiceLifetime(session,()=>runCustomerFourScenarios(primary,async progress=>{partial=JSON.parse(JSON.stringify(progress));await retain('in-progress');},{createStagedSession}),async proof=>{operationJournal=JSON.parse(JSON.stringify(operationSnapshot()));cleanup=proof;diagnosticJournal=diagnosticsSnapshot();databaseJournal=session.databaseSnapshot();session=null;},{onUnquiesced:fatalRecovery});return {...execution,scope,artifact:{package:prepared.receipt,imagesManifestSha256:hash(images),publicationEvidenceSha256:hash(publication),sourceCommit:input.releaseSource},operations:operationJournal,diagnostics:diagnosticJournal,ownedDatabases:databaseJournal,cleanup};
 });
 await writeFile('customer-live-demo.json',JSON.stringify({...result,status:'completed-demo-observations'},null,2)+'\n');
}catch{console.error('Customer live demo failed; no customer or milestone acceptance claimed.');process.exitCode=1;await retain('failed-or-unverified');}
finally{
 // Processes, evaluator and owned assertion cleanup are attempted before any package/private path removal.
 if(session){try{await withCustomerServiceLifetime(session,async()=>{},async proof=>{cleanup=proof;operationJournal=JSON.parse(JSON.stringify(operationSnapshot()));diagnosticJournal=diagnosticsSnapshot();databaseJournal=session.databaseSnapshot();session=null;},{onUnquiesced:fatalRecovery});}catch{console.error('Customer owned cleanup remains unverified; retained operation evidence requires recovery.');process.exitCode=1;}}
 if(process.exitCode===1)await retain('failed-or-unverified');
 let teardownReady=!session&&(!sessionAttempted||customerCleanupVerified(cleanup));
 if(process.env.AGENTCI_CUSTOMER_DATABASE_CONFIG_FILE){try{await writeCustomerTeardownReady(process.env.AGENTCI_CUSTOMER_DATABASE_CONFIG_FILE,{sessionAttempted,session,cleanup});}catch{teardownReady=false;console.error('Infrastructure teardown requires recovery; owned dependencies and private database state retained for bounded in-run recovery.');process.exitCode=1;}}
 if(teardownReady){if(privateRoot)await rm(privateRoot,{recursive:true,force:true});await prepared?.cleanup();}
}
