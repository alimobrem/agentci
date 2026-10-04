import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,mkdir,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFileSync} from 'node:child_process';
test('forge security backport refuses upgrades and altered source without writing a patch',async()=>{
  const root=await mkdtemp(join(tmpdir(),'agentci-forge-guard-'));
  try{
    await mkdir(join(root,'lib'));const file=join(root,'lib/rsa.js'),original='unexpected published source';await writeFile(file,original);
    for(const version of ['1.4.1','1.4.0']){
      await writeFile(join(root,'package.json'),JSON.stringify({name:'node-forge',version}));
      assert.throws(()=>execFileSync(process.execPath,['deploy/engines/patches/apply-forge-backport.mjs',root],{stdio:'pipe'}));
      assert.equal(await readFile(file,'utf8'),original,'failed backport cannot change installed crypto code');
    }
  }finally{await rm(root,{recursive:true,force:true});}
});
