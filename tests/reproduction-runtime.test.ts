import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {canonical,digest} from '../packages/review/engine.ts';
import {loadReproductionRuntime} from '../packages/runtime/reproductions.ts';
const scope={organizationId:randomUUID(),repository:'owner/repo'};
test('reproduction runtime is disabled without explicit config and rejects partial opt-in',async()=>{
 assert.equal(await loadReproductionRuntime(scope,{}),null);
 for(const env of [{AGENTCI_REPRODUCTION_CATALOG_FILE:'relative.json'},{AGENTCI_REPRODUCTION_CONFIG_REVISION:'1'},{AGENTCI_REPRODUCTION_CATALOG_DIGEST:''}])await assert.rejects(loadReproductionRuntime(scope,env),/^Error: invalid-reproduction-runtime$/);
});
test('bounded operator catalog loading pins scope and expected identity without applying authority',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'agentci-reproduction-loader-'));
 try{
  const catalog={schemaVersion:'v1alpha1',...scope,plans:[]},path=join(dir,'catalog.json'),hash=digest(canonical(catalog));await writeFile(path,JSON.stringify(catalog));
  const env={AGENTCI_REPRODUCTION_CATALOG_FILE:path,AGENTCI_REPRODUCTION_CATALOG_DIGEST:hash,AGENTCI_REPRODUCTION_CONFIG_REVISION:'1',AGENTCI_REPRODUCTION_CONFIG_DIGEST:digest('applied-config')};
  const loaded=await loadReproductionRuntime(scope,env);assert.ok(loaded);assert.deepEqual(loaded.expected,{revision:1,digest:env.AGENTCI_REPRODUCTION_CONFIG_DIGEST});assert.equal(loaded.catalog.digest,hash);assert.equal(loaded.evalTaskQueue,'agentci-eval-v1');
  for(const change of [{AGENTCI_REPRODUCTION_CONFIG_REVISION:'01'},{AGENTCI_REPRODUCTION_CONFIG_REVISION:'9007199254740992'},{AGENTCI_REPRODUCTION_CATALOG_DIGEST:digest('different')},{AGENTCI_REPRODUCTION_CONFIG_DIGEST:'not-a-digest'}])await assert.rejects(loadReproductionRuntime(scope,{...env,...change}),/^Error: invalid-reproduction-runtime$/);
  await assert.rejects(loadReproductionRuntime({...scope,repository:'other/repo'},env),/^Error: invalid-reproduction-runtime$/);
  await writeFile(path,Buffer.from([0xff]));await assert.rejects(loadReproductionRuntime(scope,env),/^Error: invalid-reproduction-runtime$/);
  await writeFile(path,Buffer.alloc(32*1024*1024+1,32));await assert.rejects(loadReproductionRuntime(scope,env),/^Error: invalid-reproduction-runtime$/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
