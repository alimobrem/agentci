import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
test('scan policy blocks fixable high/critical and rejects missing inventory', async () => {
  const directory=await mkdtemp(join(tmpdir(),'agentci-scan-gate-'));
  try {
    for(const [report,status] of [
      [{Results:[{Vulnerabilities:[]} ]},0],
      [{Results:[{Vulnerabilities:[{Severity:'HIGH',FixedVersion:''}]}]},0],
      [{Results:[{Vulnerabilities:[{Severity:'MEDIUM',FixedVersion:'2'}]}]},0],
      [{Results:[{Vulnerabilities:[{Severity:'CRITICAL',FixedVersion:'2'}]}]},1],
      [{Results:[]},1],
    ] as const){const path=join(directory,'scan.json');await writeFile(path,JSON.stringify(report));const result=spawnSync(process.execPath,['scripts/check-scan.mjs',path],{encoding:'utf8'});assert.equal(result.status,status,result.stderr);}
  } finally {await rm(directory,{recursive:true,force:true});}
});
