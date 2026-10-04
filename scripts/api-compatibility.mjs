import { mkdir, readFile, writeFile, access, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
const archives = {
  'darwin-arm64': ['darwin_all','2a479337c15afdcbf0b1e89c0b4d0cf0176472dbc11483358fed1f831d1e46c5'],
  'darwin-x64': ['darwin_all','2a479337c15afdcbf0b1e89c0b4d0cf0176472dbc11483358fed1f831d1e46c5'],
  'linux-x64': ['linux_amd64','43a4e328e2d13ba1552d760aa68d2485c75c5621f309f6ff64ae895188345247'],
  'linux-arm64': ['linux_arm64','4ae3c362d6074d919aada2dea82d0ee84366591600384455d0bdc658ddf8f7ae'],
};
const entry = archives[`${process.platform}-${process.arch}`]; if (!entry) throw new Error('Unsupported oasdiff platform');
const directory = resolve('.agentci/local/tools/oasdiff-1.33.0'); await mkdir(directory,{recursive:true});
const archive = join(directory,'release.tgz');
try { await access(archive); } catch {
  const response = await fetch(`https://github.com/oasdiff/oasdiff/releases/download/v1.33.0/oasdiff_1.33.0_${entry[0]}.tar.gz`,{signal:AbortSignal.timeout(60_000)});
  if(!response.ok)throw new Error('oasdiff download failed'); await writeFile(archive,Buffer.from(await response.arrayBuffer()));
}
if(createHash('sha256').update(await readFile(archive)).digest('hex')!==entry[1])throw new Error('oasdiff archive checksum mismatch');
execFileSync('tar',['-xzf',archive,'-C',directory,'oasdiff']);
const base='specs/api/baselines/m1-0.2.1-openapi.json', current='specs/api/openapi.json';
const compare = file => spawnSync(join(directory,'oasdiff'),['breaking',base,file,'--allow-external-refs=false','--format','json','--fail-on','WARN'],{encoding:'utf8',timeout:30_000});
const result = compare(current);
if(result.status!==0){console.error(result.stdout,result.stderr);process.exitCode=1;}
else if(process.argv.includes('--self-test')){
  const temp=await mkdtemp(join(tmpdir(),'agentci-api-compat-'));
  try{const broken=JSON.parse(await readFile(current,'utf8'));delete broken.paths['/v1/evidence/{id}'];const path=join(temp,'broken.json');await writeFile(path,JSON.stringify(broken));const negative=compare(path);if(negative.status!==1||!JSON.parse(negative.stdout).length)throw new Error('Breaking endpoint removal did not fail the gate');}
  finally{await rm(temp,{recursive:true,force:true});}
}
const report={tool:'oasdiff',version:'1.33.0',sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),baseline:base,baselineSha256:createHash('sha256').update(await readFile(base)).digest('hex'),currentSha256:createHash('sha256').update(await readFile(current)).digest('hex'),exitCode:result.status,selfTest:process.argv.includes('--self-test')?'endpoint-removal rejected':null,changes:result.stdout};
await mkdir('.agentci/artifacts',{recursive:true});await writeFile('.agentci/artifacts/api-compatibility.json',JSON.stringify(report,null,2)+'\n');
if(!process.exitCode)console.log('API compatibility passed against immutable released M1 0.2.1-m1.');
