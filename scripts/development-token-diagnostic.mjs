import {Octokit} from '@octokit/rest';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {parse} from 'yaml';
import {redactedRepositoryCapability} from './lib/development-token-diagnostic.mjs';

const source=process.env.GITHUB_SHA,path='.github/workflows/development-token-diagnostic.yaml';
const record={schemaVersion:1,operation:'GET fixed repository metadata only',result:'failed',sourceCommit:/^[a-f0-9]{40}$/.test(source??'')?source:null,capability:null,httpStatus:null};
try{
 if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REPOSITORY!=='alimobrem/agentci'||process.env.GITHUB_REF!=='refs/heads/main'||process.env.GITHUB_EVENT_NAME!=='push'||process.env.GITHUB_JOB!=='diagnostic'||process.env.GITHUB_WORKFLOW_REF!=='alimobrem/agentci/'+path+'@refs/heads/main'||process.env.GITHUB_WORKFLOW_SHA!==source||!record.sourceCommit||!process.env.GITHUB_TOKEN||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()!==source)throw Error('Trusted diagnostic context required');
 const committed=execFileSync('git',['show',source+':'+path]);
 if(!(await readFile(path)).equals(committed))throw Error('Diagnostic workflow source mismatch');
 const grant=parse(committed.toString('utf8')).jobs?.diagnostic?.permissions;
 if(grant?.contents!=='write'||grant?.packages!=='read'||Object.keys(grant).sort().join(',')!=='contents,packages')throw Error('Exact existing preflight grants required');
 const github=new Octokit({auth:process.env.GITHUB_TOKEN,request:{timeout:30000}});
 const response=await github.rest.repos.get({owner:'alimobrem',repo:'agentci'});
 record.httpStatus=response.status;
 record.capability=redactedRepositoryCapability(response.data);
 record.result='observed';
}catch(error){
 if(Number.isInteger(error?.status)&&error.status>=100&&error.status<=599)record.httpStatus=error.status;
 process.exitCode=1;
}finally{
 await writeFile('development-diagnostic.json',JSON.stringify(record,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify(record));
}
