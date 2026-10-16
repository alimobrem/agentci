import {execFileSync} from 'node:child_process';
import {readFile,readdir,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {IMAGE_ROLES} from '../image-publication.mjs';
import {validateNativeReceipts,verifyAssembledIndex,bindNativeImage,bindNativeScan} from '../native-publication.mjs';

export const DEVELOPMENT_VERSION='0.4.0-m3-dev.4';
export const SERVICE_REPOSITORY='alimobrem/agentci';
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function candidateIdentity(version,sourceCommit){
 if(version!==DEVELOPMENT_VERSION||!/^[a-f0-9]{40}$/.test(sourceCommit??''))throw Error('Invalid development candidate identity');
 return {version,sourceCommit};
}
export function bindDevelopmentImages(identities,acceptances,indexes,expected){
 candidateIdentity(expected.version,expected.sourceCommit);
 if(!Array.isArray(identities)||identities.length!==6||new Set(identities.map(v=>v.role)).size!==6||!Array.isArray(acceptances)||acceptances.length!==6||new Set(acceptances.map(v=>v.role)).size!==6)throw Error('All six unique role identities and native acceptances required');
 return IMAGE_ROLES.map(role=>{
  const identity=identities.find(v=>v.role===role),acceptance=acceptances.find(v=>v.role===role);
  for(const value of [identity,acceptance])for(const key of ['version','sourceCommit','runId','attempt'])if(value?.[key]!==expected[key])throw Error('Development publication identity mismatch');
  if(acceptance.result!=='passed'||JSON.stringify(identity.platforms)!==JSON.stringify(['linux/amd64','linux/arm64'])||!new RegExp('^ghcr\\.io/alimobrem/agentci-'+role+'@sha256:[a-f0-9]{64}$').test(identity.image??''))throw Error('Incomplete development image acceptance');
  const receipts=validateNativeReceipts(acceptance.receipts,{...expected,role});
  const bytes=Buffer.from(indexes[role]??[]),expectedDigest=identity.image.split('@')[1];
  // buildx's --raw output can append one newline to the exact registry bytes.
  if(expectedDigest!=='sha256:'+hash(bytes)&&!(bytes.at(-1)===10&&expectedDigest==='sha256:'+hash(bytes.subarray(0,-1))))throw Error('Index bytes do not bind published digest');
  verifyAssembledIndex(role,JSON.parse(bytes),receipts);
  return {role,image:identity.image,platforms:identity.platforms,receipts};
 });
}
export function validatePackageManifest(value,expected){
 candidateIdentity(expected.version,expected.sourceCommit);
 if(value?.schemaVersion!==1||value.version!==expected.version||value.sourceCommit!==expected.sourceCommit||value.package?.name!==`agentci-${expected.version}.tgz`||!/^[a-f0-9]{64}$/.test(value.package.sha256??'')||!Array.isArray(value.files)||!value.files.length||value.files.length>10000)throw Error('Invalid source-bound package manifest');
 const paths=new Set();
 for(const file of value.files){
  if(typeof file?.path!=='string'||!/^[A-Za-z0-9_.\/-]+$/.test(file.path)||file.path.startsWith('/')||file.path.split('/').some(p=>!p||p==='.'||p==='..')||paths.has(file.path)||!/^[a-f0-9]{64}$/.test(file.sha256??''))throw Error('Unsafe or duplicate package path');
  paths.add(file.path);
 }
 if(!/^\d+$/.test(value.runId??'')||!(/^[1-9]\d*$/.test(value.attempt??'')))throw Error('Missing package publication cohort');
 for(const key of ['runId','attempt'])if(expected[key]!==undefined&&value[key]!==expected[key])throw Error('Package publication cohort mismatch');
 for(const path of ['package.json','package-lock.json','npm-shrinkwrap.json','dist/release-source.json','dist/cmd/agentci/main.js','dist/packages/version.js'])if(!paths.has(path))throw Error('Required installed identity missing');
 return value;
}
export function requireAvailableResponse(status){
 if(status!==404)throw Error(status===200?'Candidate identity already exists':'Candidate availability is inconclusive');
}
export function sanitizedPackageEnvironment(root,path){
 return {PATH:path,HOME:root,npm_config_cache:root+'/cache',npm_config_userconfig:root+'/empty.npmrc',npm_config_globalconfig:root+'/empty-global.npmrc',npm_config_registry:'https://registry.npmjs.org/'};
}

export function publicationCohort(value,expected){
 candidateIdentity(value?.version,value?.sourceCommit);
 if(value.sourceCommit!==expected.sourceCommit||value.version!==expected.version||value.runId!==expected.runId||!(/^[1-9]\d*$/.test(value.attempt??''))||!(/^[1-9]\d*$/.test(expected.attempt??''))||BigInt(value.attempt)>BigInt(expected.attempt))throw Error('Publication cohort differs from verification run');
 return {...expected,attempt:value.attempt};
}
export async function readDevelopmentImages(directory,expected){
 const json=async name=>JSON.parse(await readFile(join(directory,name)));
 const identities=await Promise.all(IMAGE_ROLES.map(role=>json(role+'-identity.json')));
 const acceptances=await Promise.all(IMAGE_ROLES.map(role=>json(role+'-native-acceptance.json')));
 const indexes=Object.fromEntries(await Promise.all(IMAGE_ROLES.map(async role=>[role,await readFile(join(directory,role+'-index.json'))])));
 const images=bindDevelopmentImages(identities,acceptances,indexes,expected);
 for(const image of images)for(const receipt of image.receipts){
  const bytes=async suffix=>readFile(join(directory,`${image.role}-${receipt.arch}-${suffix}.json`));
  const scan=await bytes('scan'),inspect=await bytes('inspect');
  if(hash(scan)!==receipt.scanSha256||hash(inspect)!==receipt.inspectSha256)throw Error('Retained native evidence hash mismatch');
  if(bindNativeImage(JSON.parse(inspect)[0],receipt)!==receipt.configDigest)throw Error('Retained image configuration mismatch');
  const report=JSON.parse(scan);bindNativeScan(report,receipt);
  if(!Array.isArray(report.Results)||!report.Results.length||report.Results.flatMap(r=>r.Vulnerabilities??[]).some(v=>['HIGH','CRITICAL'].includes(v.Severity)&&v.FixedVersion))throw Error('Retained scan does not pass publication policy');
  if(receipt.nativeSha256){const nativeBytes=await bytes('native'),native=JSON.parse(nativeBytes);if(hash(nativeBytes)!==receipt.nativeSha256||native.platform!=='linux/'+receipt.arch||native.image!==receipt.configDigest||!native.temporalNativeArtifacts||!Object.keys(native.files??{}).length)throw Error('Retained native inventory mismatch');}
 }
 return images;
}
export async function validateDevelopmentAssets(directory,expected){
 const manifestBytes=await readFile(join(directory,'package-manifest.json'));
 const manifest=validatePackageManifest(JSON.parse(manifestBytes),{version:expected.version,sourceCommit:expected.sourceCommit,runId:expected.runId}),cohort=publicationCohort(manifest,expected);
 const archive=await readFile(join(directory,manifest.package.name));
 if(hash(archive)!==manifest.package.sha256)throw Error('Retained package archive hash mismatch');
 const published=JSON.parse(await readFile(join(directory,'images.json')));
 publicationCohort(published,cohort);
 if(published.schemaVersion!==1||published.attempt!==cohort.attempt)throw Error('Package and image publication attempts differ');
 const images=await readDevelopmentImages(join(directory,'publication-evidence'),cohort);
 if(JSON.stringify(images)!==JSON.stringify(published.images))throw Error('Published image manifest differs from retained native evidence');
 await validatePublicationArchive(directory,manifest.package.name);
 return {manifest,cohort,images,packageSha256:hash(archive),manifestSha256:hash(manifestBytes)};
}
export function validatePackageReceipt(receipt,arch,assets,verification){
 if(receipt.result!=='passed'||receipt.sourceCommit!==verification.sourceCommit||receipt.version!==verification.version||receipt.platform!=='linux/'+arch||receipt.anonymous!==true||receipt.productionOnly!==true||receipt.lockedRootInstall!==true||receipt.consumerInstall!==true||receipt.packageSha256!==assets.packageSha256||receipt.manifestSha256!==assets.manifestSha256||receipt.publicationRunId!==assets.cohort.runId||receipt.publicationAttempt!==assets.cohort.attempt||receipt.verificationRunId!==verification.runId||!(/^[1-9]\d*$/.test(receipt.verificationAttempt??''))||BigInt(receipt.verificationAttempt)>BigInt(verification.attempt)||receipt.filesVerified!==assets.manifest.files.length)throw Error('Incomplete or mismatched native package acceptance');
}

export function normalizePackOutput(value,version){
 const entries=Array.isArray(value)?value:Object.values(value??{});
 if(entries.length!==1||entries[0]?.name!=='agentci'||entries[0].version!==version||entries[0].filename!==`agentci-${version}.tgz`||!Array.isArray(entries[0].files)||!entries[0].files.length)throw Error('Pack identity mismatch');
 const paths=new Set();
 for(const file of entries[0].files){if(typeof file?.path!=='string'||!/^[A-Za-z0-9_.\/-]+$/.test(file.path)||file.path.startsWith('/')||file.path.split('/').some(p=>!p||p==='.'||p==='..')||paths.has(file.path))throw Error('Unsafe or duplicate pack output path');paths.add(file.path);}
 return entries[0];
}

export async function validatePublicationArchive(directory,packageName){
 const evidenceDirectory=join(directory,'publication-evidence'),archivePath=join(directory,'publication-evidence.tgz');
 const names=(await readdir(evidenceDirectory)).sort();
 if(!names.length||names.length>1000||names.some(name=>!/^[a-zA-Z0-9_.-]+\.json$/.test(name)))throw Error('Invalid retained publication evidence members');
 for(const name of names)if(!(await lstat(join(evidenceDirectory,name))).isFile())throw Error('Publication evidence must be regular files');
 const archive=await readFile(archivePath);if(!archive.length||archive.length>64*1024*1024)throw Error('Publication evidence archive exceeds bound');
 const tar=args=>execFileSync('tar',args,{env:{PATH:process.env.PATH,LC_ALL:'C'},timeout:30000,maxBuffer:32*1024*1024});
 const members=tar(['-tzf',archivePath]).toString().trim().split('\n');
 const wanted=names.map(name=>'publication-evidence/'+name);
 if(members.length!==wanted.length||new Set(members).size!==members.length||JSON.stringify([...members].sort())!==JSON.stringify(wanted))throw Error('Uploaded publication archive members differ from retained evidence');
 const verbose=tar(['-tvzf',archivePath]).toString().trim().split('\n');
 if(verbose.length!==members.length||verbose.some(line=>line[0]!=='-'))throw Error('Uploaded publication archive contains nonregular members');
 for(const name of names)if(!tar(['-xOzf',archivePath,'--','publication-evidence/'+name]).equals(await readFile(join(evidenceDirectory,name))))throw Error('Uploaded publication archive bytes differ from retained evidence');
 const assets=[packageName,'package-manifest.json','images.json','publication-evidence.tgz'];
 const expected=(await Promise.all(assets.map(async name=>`${hash(await readFile(join(directory,name)))}  ${name}\n`))).join('');
 if((await readFile(join(directory,'SHA256SUMS'),'utf8'))!==expected)throw Error('Uploaded checksum file differs from exact asset bytes');
}
