import {spawnSync} from 'node:child_process';
import {writeFile,readFile} from 'node:fs/promises';
// Frozen baseline harness. Subject modules come from the reviewed commit; dependencies from the pinned runner.
const scenarios=[['finding-lifecycle','findings',5],['finding-reproduction','finding-reproduction',3]];
const results=[];
for(const [scenario,file,minTests] of scenarios){
  const assertions=await readFile(`tests/${file}.test.ts`,'utf8'),names=[...assertions.matchAll(/^test\('([^']+)'/gm)].map(match=>match[1]);
  const result=spawnSync(process.execPath,['--import','tsx','--test','--test-reporter=tap',`tests/${file}.test.ts`],{encoding:'utf8',timeout:20000,maxBuffer:256*1024});
  const count=name=>{const matches=[...result.stdout?.matchAll(new RegExp(`^# ${name} (\\d+)\\s*$`,'gm'))??[]];return matches.length===1?Number(matches[0][1]):undefined;};
  const tests=count('tests'),passed=count('pass'),failed=count('fail');
  const complete=names.length>=minTests&&names.every(name=>result.stdout?.includes(`# Subtest: ${name}`))&&!result.error&&result.status!==null&&tests!==undefined&&tests>=minTests&&passed!==undefined&&failed!==undefined&&passed+failed===tests&&['skipped','cancelled','todo'].every(name=>count(name)===0);
  results.push({scenario,status:complete?(result.status===0&&failed===0?'passed':'failed'):'error'});
}
await writeFile('agentci-finding-result.json',JSON.stringify({schemaVersion:'v1alpha1',results})+'\n');
process.exitCode=results.some(r=>r.status!=='passed')?1:0;
