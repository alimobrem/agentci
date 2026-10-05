import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {IMAGE_ROLES,platformManifestReference} from './image-publication.mjs';
const sha = value => /^[a-f0-9]{64}$/.test(value);
const digest = value => /^sha256:[a-f0-9]{64}$/.test(value);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function validateNativeReceipts(receipts, expected) {
 if(!IMAGE_ROLES.includes(expected.role)||!/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(expected.version)||!/^[a-f0-9]{40}$/.test(expected.sourceCommit)||!/^\d+$/.test(expected.runId)||!/^\d+$/.test(expected.attempt))throw new Error('Invalid native publication identity');
 if(!Array.isArray(receipts)||receipts.length!==2)throw new Error('Both native platform receipts are required');
 for(const arch of ['amd64','arm64']){
  const matches=receipts.filter(r=>r?.arch===arch);
  if(matches.length!==1)throw new Error('Duplicate or missing native platform receipt');
  const receipt=matches[0];
  for(const field of ['role','version','sourceCommit','runId','attempt'])if(receipt[field]!==expected[field])throw new Error(`Native publication ${field} mismatch`);
  if(receipt.result!=='passed'||!digest(receipt.buildDigest)||!digest(receipt.manifestDigest)||!digest(receipt.configDigest)||!sha(receipt.scanSha256)||!sha(receipt.inspectSha256))throw new Error('Incomplete native platform acceptance');
  if(['worker','eval-worker'].includes(expected.role)&&!sha(receipt.nativeSha256))throw new Error('Missing native dependency inventory');
 }
 return ['amd64','arm64'].map(arch=>receipts.find(r=>r.arch===arch));
}
export function verifyAssembledIndex(role,index,receipts){
 if(index?.manifests?.some(m=>m.platform?.os!=='unknown' && (m.platform?.os!=='linux'||!['amd64','arm64'].includes(m.platform?.architecture))))throw new Error('Unexpected platform in assembled index');
 for(const receipt of receipts)if(platformManifestReference(role,index,receipt.arch)!==`ghcr.io/alimobrem/agentci-${role}@${receipt.manifestDigest}`)throw new Error('Assembled platform digest mismatch');
}
export function bindNativeImage(inspect, expected){
 if(!inspect||inspect.Os!=='linux'||inspect.Architecture!==expected.arch||!digest(inspect.Id)||inspect.Config?.Labels?.['org.opencontainers.image.revision']!==expected.sourceCommit||inspect.Config?.Labels?.['org.opencontainers.image.version']!==expected.version||inspect.Config?.Labels?.['org.opencontainers.image.source']!=='https://github.com/alimobrem/agentci')throw new Error('Native image platform/source/version mismatch');
 return inspect.Id;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const expected={role:process.env.IMAGE_ROLE,version:process.env.CANDIDATE_VERSION,sourceCommit,runId:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT};
 if(sourceCommit!==process.env.GITHUB_SHA||JSON.parse(await readFile('package.json','utf8')).version!==expected.version||!IMAGE_ROLES.includes(expected.role))throw new Error('Publication source/version mismatch');
 const role=expected.role,command=process.argv[2];
 await mkdir('published',{recursive:true});
 if(command==='record'){
  const arch=process.env.PUBLICATION_ARCH;
  if(!['amd64','arm64'].includes(arch)||process.platform!=='linux'||process.arch!==(arch==='amd64'?'x64':'arm64'))throw new Error('Publication requires a matching native runner');
  const index=JSON.parse(await readFile(`published/${role}-${arch}-index.json`,'utf8'));
  const manifest=platformManifestReference(role,index,arch).split('@')[1];
  const inspectBytes=await readFile(`published/${role}-${arch}-inspect.json`),inspect=JSON.parse(inspectBytes)[0];
  const configDigest=bindNativeImage(inspect,{...expected,arch});
  const scanBytes=await readFile(`published/${role}-${arch}-scan.json`);
  execFileSync(process.execPath,['scripts/check-scan.mjs',`published/${role}-${arch}-scan.json`],{stdio:'inherit'});
  let nativeSha256=null;
  if(['worker','eval-worker'].includes(role)){
   const bytes=await readFile(`published/${role}-${arch}-native.json`),native=JSON.parse(bytes);
   if(native.platform!==`linux/${arch}`||native.image!==configDigest||!native.temporalNativeArtifacts||!Object.keys(native.files??{}).length)throw new Error('Native inventory does not bind exercised image');
   nativeSha256=hash(bytes);
  }
  const receipt={...expected,arch,result:'passed',buildDigest:process.env.IMAGE_DIGEST,manifestDigest:manifest,configDigest,scanSha256:hash(scanBytes),inspectSha256:hash(inspectBytes),nativeSha256};
  if(!digest(receipt.buildDigest))throw new Error('Missing immutable build digest');
  await writeFile(`published/${role}-${arch}-receipt.json`,JSON.stringify(receipt,null,2)+'\n');
 }else if(command==='prepare'||command==='verify'){
  const receipts=validateNativeReceipts(await Promise.all(['amd64','arm64'].map(async arch=>JSON.parse(await readFile(`published/${role}-${arch}-receipt.json`,'utf8')))),expected);
  for(const receipt of receipts){
   for(const [suffix,field] of [['scan','scanSha256'],['inspect','inspectSha256'],...(receipt.nativeSha256?[['native','nativeSha256']]:[])])if(hash(await readFile(`published/${role}-${receipt.arch}-${suffix}.json`))!==receipt[field])throw new Error('Native evidence checksum mismatch');
  }
  if(command==='prepare')console.log(receipts.map(r=>`ghcr.io/alimobrem/agentci-${role}@${r.buildDigest}`).join(' '));
  else{
   verifyAssembledIndex(role,JSON.parse(await readFile(`published/${role}-index.json`,'utf8')),receipts);
   await writeFile(`published/${role}-native-acceptance.json`,JSON.stringify({ ...expected, result:'passed',receipts},null,2)+'\n');
  }
 }else throw new Error('Use record, prepare or verify');
}
