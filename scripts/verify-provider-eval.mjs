import {mkdtemp,cp,mkdir,symlink,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const root=await mkdtemp(join(tmpdir(),'agentci-provider-eval-'));
try{
  for(const directory of ['packages','tests','specs'])await cp(resolve(directory),join(root,directory),{recursive:true});
  await mkdir(join(root,'scripts'));
  await cp('scripts/agentci-provider-eval.mjs',join(root,'scripts/agentci-provider-eval.mjs'));
  await cp('package.json',join(root,'package.json'));
  await symlink(resolve('node_modules'),join(root,'node_modules'),'dir');
  const run=async()=>{
    const result=spawnSync(process.execPath,['scripts/agentci-provider-eval.mjs'],{cwd:root,encoding:'utf8',timeout:120000,maxBuffer:1048576});
    if(result.error||result.signal)throw Error('Provider eval harness did not finish');
    return {exitCode:result.status,report:JSON.parse(await readFile(join(root,'agentci-provider-result.json'),'utf8'))};
  };
  const baseline=await run();
  if(baseline.exitCode!==0||baseline.report.results.length!==5||baseline.report.results.some(result=>result.status!=='passed'))throw Error('Provider corpus baseline failed');
  const subject=join(root,'packages/providers/response.ts'),original=await readFile(subject,'utf8');
  const guard='value.requestId!==request.requestId';
  if(original.split(guard).length!==2)throw Error('Identity mutation target changed');
  await writeFile(subject,original.replace(guard,'false'));
  const mutation=await run();
  if(mutation.exitCode!==1||mutation.report.results.find(result=>result.scenario==='response-contract')?.status!=='failed')throw Error('Provider corpus failed to detect weakened identity');
  console.log(JSON.stringify({baseline,mutation,scope:'Local frozen-harness acceptance; network isolation and hosted execution are separate gates.'}));
}finally{await rm(root,{recursive:true,force:true});}
