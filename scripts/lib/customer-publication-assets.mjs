import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {anonymousDownload} from '../published-package-smoke.mjs';
import {validateDevelopmentAssets,hash} from './development-artifacts.mjs';

export async function customerPublicationAssets(prepared,input,request=fetch){
 const version='0.4.0-m3-dev.4',assets=join(prepared.temporaryRoot,'development-assets');
 // The checksum file is reconstructed from all four owner-pinned public bytes.
 // It is checked by the same archive/native validator used for publication.
 if(hash(prepared.manifestBytes)!==input.packageManifestSha256||hash(prepared.archive)!==input.packageSha256)throw Error('Prepared customer package checksum mismatch');
 const base=`https://github.com/alimobrem/agentci/releases/download/v${version}/`;
 const images=await anonymousDownload(base+'images.json',input.imagesManifestSha256,8*1024*1024,request);
 const publication=await anonymousDownload(base+'publication-evidence.tgz',input.publicationEvidenceSha256,64*1024*1024,request);
 await mkdir(assets);
 const files=[[prepared.manifest.package.name,prepared.archive],['package-manifest.json',prepared.manifestBytes],['images.json',images],['publication-evidence.tgz',publication]];
 for(const [name,bytes] of files)await writeFile(join(assets,name),bytes);
 await writeFile(join(assets,'SHA256SUMS'),files.map(([name,bytes])=>`${hash(bytes)}  ${name}\n`).join(''));
 const archive=join(assets,'publication-evidence.tgz'),env={PATH:process.env.PATH},tar=args=>execFileSync('tar',args,{env,encoding:'utf8',timeout:30000,maxBuffer:32*1024*1024});
 const paths=tar(['-tzf',archive]).trim().split('\n');
 if(new Set(paths).size!==paths.length||paths.some(path=>!/^publication-evidence\/[A-Za-z0-9_.\/-]*$/.test(path)||path.split('/').filter(Boolean).some(part=>part==='.'||part==='..'))||tar(['-tvzf',archive]).trim().split('\n').some(line=>!['-','d'].includes(line[0])))throw Error('Publication evidence archive paths rejected');
 tar(['-xzf',archive,'--no-same-owner','--no-same-permissions','-C',assets]);
 const trusted=await validateDevelopmentAssets(assets,{version,sourceCommit:input.releaseSource,runId:prepared.manifest.runId,attempt:prepared.manifest.attempt});
 return {trusted,images,publication};
}
