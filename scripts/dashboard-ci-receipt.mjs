import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {dashboardShutdownRuntimeVerified} from './lib/dashboard-shutdown.mjs';
import {dashboardBrowserVerified} from './lib/dashboard-ci-evidence.mjs';
const root=path.resolve(process.env.AGENTCI_UI_CI_DIR??'.agentci/artifacts/dashboard-ci');await mkdir(root,{recursive:true});
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const sourceTree=execFileSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim();
const outcomes=JSON.parse(process.env.UI_STAGE_OUTCOMES??'{}');
const stages=['rootInstall','rootBuild','uiInstall','audit','types','units','build','browserInstall','browser','shutdown'];
const allStagesPassed=stages.every(stage=>outcomes[stage]==='success');
const files={};async function bind(directory){for(const entry of await readdir(directory,{withFileTypes:true})){const p=path.join(directory,entry.name);if(entry.isDirectory())await bind(p);else if(entry.isFile()&&entry.name!=='ci-receipt.json')files[path.relative(root,p)]={sha256:createHash('sha256').update(await readFile(p)).digest('hex')};}}await bind(root);
let browser=null;try{browser=JSON.parse(await readFile(path.join(root,'browser/result.json'),'utf8'));}catch{}
const browserVerified=outcomes.browser==='success'&&dashboardBrowserVerified(browser,{sourceCommit,sourceTree,runId:process.env.GITHUB_RUN_ID??null,runAttempt:process.env.GITHUB_RUN_ATTEMPT??null});
let shutdown=null;try{shutdown=JSON.parse(await readFile(path.join(root,'shutdown/result.json'),'utf8'));}catch{}
const shutdownVerified=outcomes.shutdown==='success'&&dashboardShutdownRuntimeVerified(shutdown,{sourceCommit,sourceTree,rootLockSha256:createHash('sha256').update(await readFile('npm-shrinkwrap.json')).digest('hex'),dashboardLockSha256:createHash('sha256').update(await readFile('apps/dashboard/package-lock.json')).digest('hex'),runId:process.env.GITHUB_RUN_ID??null,runAttempt:process.env.GITHUB_RUN_ATTEMPT??null});
const receipt={schemaVersion:1,sourceCommit,sourceTree,workflowSha:process.env.GITHUB_SHA??null,prHead:process.env.UI_PR_HEAD||null,repository:process.env.GITHUB_REPOSITORY??null,runId:process.env.GITHUB_RUN_ID??null,runAttempt:process.env.GITHUB_RUN_ATTEMPT??null,node:process.version,scope:'Dashboard software and synthetic fixtures only; not live OIDC/customer, image/publication or M3 acceptance',outcomes,allStagesPassed,browserVerified,shutdownVerified,softwareChecksPassed:allStagesPassed&&browserVerified&&shutdownVerified,files,liveOidc:false,liveCustomer:false,releaseComplete:false};
await writeFile(path.join(root,'ci-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
console.log('Dashboard source/attempt/outcome receipt retained; software qualification '+(receipt.softwareChecksPassed?'verified':'unverified')+'.');

if(stages.some(stage=>outcomes[stage]===undefined)&&Object.values(outcomes).every(value=>value==='success')||outcomes.browser==='success'&&!browserVerified||outcomes.shutdown==='success'&&!shutdownVerified)throw Error('Dashboard successful stages lack matching qualified browser or shutdown evidence');
