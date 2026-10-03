// Explicit repeat measurements, not extra verification claims.
import { spawnSync, execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
const rows=[];
for(let i=0;i<3;i++)for(const mode of ['sequential','parallel']){
  const start=performance.now(), result=spawnSync('npm',['run',mode==='sequential'?'check':'check:fast'],{encoding:'utf8'});
  if(result.status!==0){console.error(result.stdout,result.stderr);throw new Error(`Benchmark verification failed: ${mode}`);}
  rows.push({mode,seconds:(performance.now()-start)/1000,exitCode:result.status});
}
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const sequential=median(rows.filter(r=>r.mode==='sequential').map(r=>r.seconds)),parallel=median(rows.filter(r=>r.mode==='parallel').map(r=>r.seconds));
const report={sampledAt:new Date().toISOString(),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),node:process.version,platform:process.platform,arch:process.arch,samples:rows,sequentialMedianSeconds:sequential,parallelMedianSeconds:parallel,reductionPercent:100*(sequential-parallel)/sequential,note:'Three alternating same-machine samples; same current local verification scope. Feedback improvement only, not overall task delivery acceleration. Integration, compatibility, packaging and release checks remain outside both commands.'};
await writeFile('delivery/local-feedback.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
