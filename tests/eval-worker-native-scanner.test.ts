import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore Native qualification control boundary.
import {evalNativeScannerArgs,NATIVE_SCAN_IMAGE} from '../scripts/lib/eval-worker-native-evidence.mjs';
test('native scanner scratch expansion preserves pinned scanner, owned cleanup and vulnerability-only command',()=>{
 const owner='agentci-smoke-0123456789abcdef',image='sha256:'+'a'.repeat(64);
 for(const stage of ['worker-scan','runner-scan']){
  const args=evalNativeScannerArgs(owner,stage,image);
  assert.deepEqual(args,['run','--rm','--name',owner+'-'+stage,'--label','agentci.image-smoke.owner='+owner,'--read-only','--tmpfs','/tmp:rw,nosuid,nodev,size=4g','-v','/var/run/docker.sock:/var/run/docker.sock',NATIVE_SCAN_IMAGE,'image','--cache-dir','/tmp/trivy-cache','--scanners','vuln','--format','json',image]);
 }
});
test('native scanner refuses foreign ownership, arbitrary stage and unbound image arguments',()=>{
 const owner='agentci-smoke-0123456789abcdef',image='sha256:'+'a'.repeat(64);
 for(const values of [['foreign','worker-scan',image],[owner,'--privileged',image],[owner,'worker-scan','latest'],[owner,'worker-scan',image+'\n--privileged']])assert.throws(()=>evalNativeScannerArgs(...values),/Invalid owned native scanner/);
});
