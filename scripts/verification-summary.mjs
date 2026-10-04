import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const fast=JSON.parse(await readFile('.agentci/artifacts/delivery/fast-latest.json','utf8'));
if(!fast.passed)throw new Error('Fast checks did not pass');
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(fast.sourceCommit!==sha)throw new Error('Fast checks are from another source commit');
const compatibility=JSON.parse(await readFile('.agentci/artifacts/api-compatibility.json','utf8'));
if(compatibility.sourceCommit!==sha||compatibility.exitCode!==0)throw new Error('Missing current API compatibility verification');
const runtime=JSON.parse(await readFile('.agentci/artifacts/image-smoke.json','utf8'));if(runtime.result!=='passed')throw new Error('Container runtime did not pass');
const evalWorkerRuntime=JSON.parse(await readFile('.agentci/artifacts/eval-worker-image-smoke.json','utf8'));if(evalWorkerRuntime.result!=='passed')throw new Error('Eval worker runtime did not pass');
const artifacts=[];
const nativeProvenance={};
for(const role of ['worker','eval-worker']){const path=`.agentci/artifacts/native-provenance-${role}.json`,bytes=await readFile(path),proof=JSON.parse(bytes);if(!proof.temporalNativeArtifacts||!Object.keys(proof.files??{}).length)throw new Error('Missing native artifact provenance');if(role==='eval-worker'&&(!proof.podmanClient||!proof.dockerCli||proof.image!==evalWorkerRuntime.workerImage))throw new Error('Evaluator native provenance does not match exercised image');nativeProvenance[role]=proof;artifacts.push({path,sha256:createHash('sha256').update(bytes).digest('hex')});}
const evalRuntimePath='.agentci/artifacts/eval-worker-image-smoke.json';artifacts.push({path:evalRuntimePath,sha256:createHash('sha256').update(await readFile(evalRuntimePath)).digest('hex')});
for(const directory of ['releases','scan-results'])for(const name of await readdir(directory))if((directory==='releases'&&name.endsWith('.tgz'))||(directory==='scan-results'&&name.endsWith('.json'))){const path=`${directory}/${name}`,bytes=await readFile(path);artifacts.push({path,sha256:createHash('sha256').update(bytes).digest('hex')});}
const report={schemaVersion:1,sourceCommit:sha,candidateCommit:process.env.AGENTCI_CANDIDATE_SHA??sha,runUrl:process.env.GITHUB_RUN_ID?`https://github.com/alimobrem/agentci/actions/runs/${process.env.GITHUB_RUN_ID}`:null,generatedAt:new Date().toISOString(),node:process.version,platform:process.platform,arch:process.arch,fastChecks:fast,apiCompatibility:compatibility,runtime,evalWorkerRuntime,nativeProvenance,artifacts,releaseComplete:false,note:'Verification bundle. Live dogfood, reviewed vulnerability coverage, registry/download verification, release, docs and demo still require gate evidence.'};
await mkdir('.agentci/artifacts',{recursive:true});await writeFile('.agentci/artifacts/verification.json',JSON.stringify(report,null,2)+'\n');console.log(`Verification evidence recorded for ${sha}`);
