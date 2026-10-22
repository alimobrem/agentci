import {assembleSourcePackage} from './lib/source-package.mjs';

const arguments_=process.argv.slice(2);
if(arguments_.length>2||(arguments_.length&&arguments_[0]!=='--pack-destination')||(arguments_.length===1))throw Error('Usage: node scripts/pack-candidate.mjs [--pack-destination DIRECTORY]');
try{
 const result=await assembleSourcePackage({destination:arguments_[1]??'releases',expected:{...(process.env.GITHUB_SHA?{sourceCommit:process.env.GITHUB_SHA}:{}),...(process.env.AGENTCI_CANDIDATE_SHA?{candidateCommit:process.env.AGENTCI_CANDIDATE_SHA}:{}),runId:process.env.GITHUB_RUN_ID??'0',attempt:process.env.GITHUB_RUN_ATTEMPT??'1'}});
 console.log(JSON.stringify({result:'passed',manifestPath:result.manifestPath,archivePath:result.archivePath,packageSha256:result.packageSha256,manifestSha256:result.manifestSha256,sourceCommit:result.manifest.sourceCommit,sourceTree:result.manifest.sourceTree,candidateCommit:result.manifest.candidateCommit,releaseComplete:false}));
}catch(error){console.error('Candidate package assembly failed: '+error.message);process.exitCode=1;}
