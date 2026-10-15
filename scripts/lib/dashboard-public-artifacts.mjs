import {mkdir, mkdtemp, readdir, lstat, readFile, writeFile, rename} from 'node:fs/promises';
import {join, dirname} from 'node:path';
import {createHash} from 'node:crypto';

const allowed = new Set(['source.json','image.json','anonymous.json','shutdown.json','runtime-files.json','rpm-inventory.json','scan.json','scan-policy.json','scan-execution-failure.json','failure.json','cleanup.json','result.json']);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export async function publishDashboardArtifacts(staging, destination, {maxBytes=32*1024*1024, maxFiles=10000, recovery}={}) {
  // Uploads see only a completed, bounded publication directory. Staging is never uploaded.
  await mkdir(dirname(destination), {recursive:true});
  const temporary = await mkdtemp(join(dirname(destination), '.dashboard-public-'));
  const files=[]; let total=0;
  try {
    async function copy(path, name) {
      const info=await lstat(path);
      if(info.isSymbolicLink()) throw Error('Rejected link');
      if(info.isDirectory()) {
        if(name!=='licenses'&&!name.startsWith('licenses/')) throw Error('Rejected directory');
        for(const entry of await readdir(path)) await copy(join(path,entry),name+'/'+entry);
      } else {
        if(!info.isFile()||(!allowed.has(name)&&!name.startsWith('licenses/'))||info.size>maxBytes-total||files.length>=maxFiles) throw Error('Rejected artifact');
        const bytes=await readFile(path);
        if(bytes.length!==info.size||bytes.length>maxBytes-total) throw Error('Changed artifact');
        total+=bytes.length;
        await mkdir(dirname(join(temporary,name)),{recursive:true});
        await writeFile(join(temporary,name),bytes);
        files.push({path:name,bytes:bytes.length,sha256:sha(bytes)});
      }
    }
    for(const name of await readdir(staging)) await copy(join(staging,name),name);
    if(recovery) {try{await lstat(recovery);}catch(error){if(error.code!=='ENOENT')throw error;recovery=undefined;}}
    if(recovery) {allowed.add('image-smoke-cleanup.json');await copy(recovery,'image-smoke-cleanup.json');}
    const manifest=Buffer.from(JSON.stringify({schemaVersion:1,bytes:total,files},null,2)+'\n');
    if(total+manifest.length>maxBytes) throw Error('Manifest exceeds total bound');
    await writeFile(join(temporary,'artifact-manifest.json'),manifest);
    await rename(temporary,destination);
    return {result:'published',bytes:total+manifest.length,files:files.length+1};
  } catch {
    // Never publish partial copies, source names, diagnostics, or source bytes on failure.
    const receipt=[Buffer.from('{"schemaVersion":1,"result":"public-evidence-withheld","qualification":"unverified"}\n'),Buffer.from('{}\n'),Buffer.alloc(0)].find(bytes=>bytes.length<=maxBytes);
    await mkdir(destination);await writeFile(join(destination,'publication-failure.json'),receipt);
    return {result:'withheld',bytes:receipt.length,files:1};
  }
}
