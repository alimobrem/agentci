import {readFile,writeFile,lstat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {Octokit} from '@octokit/rest';
import {createAppAuth} from '@octokit/auth-app';
import {hash,validatePackageManifest} from './lib/development-artifacts.mjs';
import {verifyPackageFiles} from './published-package-smoke.mjs';
import {validateCustomerInputs,inspectCustomerScope,withCustomerKey} from './lib/customer-acceptance-preflight.mjs';
import {observeCustomerReview,requireCustomerServiceOrigin} from './lib/customer-live-observations.mjs';
// Observation only: never starts/stops services, applies authority or mutates GitHub.
const secret=process.env.AGENTCI_CUSTOMER_APP_PRIVATE_KEY,readToken=process.env.AGENTCI_CUSTOMER_READ_TOKEN;
delete process.env.AGENTCI_CUSTOMER_APP_PRIVATE_KEY;delete process.env.AGENTCI_CUSTOMER_READ_TOKEN;
try{
 if(process.argv.length!==5||process.env.GITHUB_REPOSITORY!=='alimobrem/agentci'||process.env.GITHUB_REF!=='refs/heads/main'||process.env.GITHUB_EVENT_NAME!=='workflow_dispatch')throw Error('Trusted manual observation required');
 const [inputPath,manifestPath,installedRoot]=process.argv.slice(2),input=JSON.parse(await readFile(inputPath,'utf8')),fixtures=validateCustomerInputs(input.fixtures);
 if(fixtures.serviceSource!==process.env.GITHUB_SHA||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',env:{PATH:process.env.PATH}}).trim()!==fixtures.serviceSource)throw Error('Trusted harness source mismatch');
 const manifestBytes=await readFile(manifestPath);if(hash(manifestBytes)!==process.env.PACKAGE_MANIFEST_SHA256)throw Error('Pinned package manifest mismatch');
 const manifest=validatePackageManifest(JSON.parse(manifestBytes),{version:'0.4.0-m3-dev.3',sourceCommit:input.releaseSource});
 const root=resolve(installedRoot);
 for(const file of manifest.files){const parts=file.path.split('/');let current=root;for(const part of parts){current=join(current,part);const info=await lstat(current);if(info.isSymbolicLink())throw Error('Package symlinks rejected');}if(!(await lstat(current)).isFile())throw Error('Package file required');}
 await verifyPackageFiles(root,manifest);
 if(!Array.isArray(input.observations)||input.observations.length!==4||new Set(input.observations.map(o=>o.scenario)).size!==4)throw Error('Four original observations required');
 for(const observation of input.observations){const expected=fixtures.subjects.find(subject=>subject.kind===(observation.scenario==='fixed-result'?'fixed':'seeded'));const actual=observation.admission?.subject;
  if(!expected||actual?.repository!==fixtures.repository||actual.pullRequest!==expected.pullRequest||actual.baseSha!==expected.baseSha||actual.headSha!==expected.headSha)throw Error('Exact approved fixture mismatch');
 }
 const serviceOrigin=requireCustomerServiceOrigin(input.serviceUrl,process.env.AGENTCI_CUSTOMER_SERVICE_ORIGIN);
 const {ModelReviewClient}=await import(pathToFileURL(join(root,'dist/packages/client/model-review.js')).href);
 const client=new ModelReviewClient({url:serviceOrigin,readToken});
 const evidence=await withCustomerKey(secret,process.env.RUNNER_TEMP,async path=>{
  const privateKey=await readFile(path,'utf8'),auth=createAppAuth({appId:fixtures.appId,privateKey});
  const app=new Octokit({auth:(await auth({type:'app'})).token,request:{timeout:30000}});
  const installation=new Octokit({authStrategy:createAppAuth,auth:{appId:fixtures.appId,installationId:fixtures.installationId,privateKey},request:{timeout:30000}});
  const scope=await inspectCustomerScope(fixtures,app,installation),observations=[];
  for(const observation of input.observations)observations.push(await observeCustomerReview(client,installation,{...observation,appId:fixtures.appId}));
  return {schemaVersion:1,mode:'live-read-only-observation',scope,package:{version:manifest.version,sourceCommit:manifest.sourceCommit,manifestSha256:hash(manifestBytes),filesVerified:manifest.files.length},observations,physicalExecutionAndCleanup:'requires-separate-trusted-operator-evidence',customerEndpointAcceptance:'unverified',M3MilestoneAcceptance:'pending'};
 });
 await writeFile('customer-observations.json',JSON.stringify(evidence,null,2)+'\n');
}catch{console.error('Customer observations failed; no acceptance or physical execution claimed.');process.exitCode=1;}
