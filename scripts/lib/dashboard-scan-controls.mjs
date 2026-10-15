import {SMOKE_OWNER_LABEL} from './smoke-resources.mjs';
export const SCANNER_SCRATCH_BYTES=1024*1024*1024;
export const SCANNER_IMAGE='aquasec/trivy:0.75.0@sha256:af6acf9a6b85dfe389a1941505c0ce9efef52a4719635e1a962f022a3d855daa';
/** The existing scanner command, with only its explicit tmpfs capacity corrected. */
export function scannerRunArgs({owner,uid,gid,archive,cache}){
 if(!/^agentci-smoke-[a-f0-9]{16}$/.test(owner)||!Number.isSafeInteger(uid)||uid<=0||!Number.isSafeInteger(gid)||gid<0||![archive,cache].every(p=>typeof p==='string'&&p.startsWith('/')&&!p.endsWith('.sock')&&!/[\0\r\n,:]/.test(p)))throw Error('Invalid owned non-root scanner controls');
 return ['run','--rm','--name',owner+'-trivy','--label',SMOKE_OWNER_LABEL+'='+owner,'--label','agentci.purpose=image-smoke','--user',uid+':'+gid,'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=1024m','--mount','type=bind,src='+archive+',dst=/input/dashboard.tar,readonly','--mount','type=bind,src='+cache+',dst=/cache',SCANNER_IMAGE,'image','--cache-dir','/cache','--input','/input/dashboard.tar','--scanners','vuln','--format','json'];
}
