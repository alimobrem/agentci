import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,chmod,symlink,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {readPrivateText,loadSmokeConfig} from '../packages/providers/smoke-config.ts';
test('private smoke configuration requires explicit authorization and rejects unsafe credential files',async()=>{
 const root=await mkdtemp(join(tmpdir(),'agentci-smoke-config-'));
 try{
  const path=join(root,'config.json'),key=join(root,'key'),database=join(root,'database');
  const config={authorized:true,credentialFile:key,databaseUrlFile:database,budget:{id:'11111111-1111-4111-8111-111111111111',organizationId:'22222222-2222-4222-8222-222222222222',repository:'fixture/repo',limitUsdMicros:1000000}};
  await writeFile(path,JSON.stringify(config),{mode:0o600});assert.deepEqual(await loadSmokeConfig(path),config);
  await writeFile(key,'synthetic-private-key\n',{mode:0o600});assert.equal(await readPrivateText(key),'synthetic-private-key');
  await chmod(key,0o644);await assert.rejects(readPrivateText(key),/invalid-private-smoke-config/);await chmod(key,0o600);
  await symlink(key,join(root,'link'));await assert.rejects(readPrivateText(join(root,'link')),/invalid-private-smoke-config/);
  await writeFile(key,'x'.repeat(65537));await assert.rejects(readPrivateText(key),/invalid-private-smoke-config/);
  for(const change of [{authorized:false},{budget:{...config.budget,limitUsdMicros:0}},{credentialFile:'relative'},{secret:'must-not-be-accepted'}]){
   await writeFile(path,JSON.stringify({...config,...change}));await assert.rejects(loadSmokeConfig(path),/invalid-private-smoke-config/);
  }
 }finally{await rm(root,{recursive:true,force:true});}
});
