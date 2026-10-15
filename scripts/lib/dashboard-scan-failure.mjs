import {createHash} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
/** Classifications and hashes only. Never emit diagnostics, URLs, paths, headers or tokens. */
export function dashboardScanFailure(result){
 const stdout=Buffer.from(result.stdout??''),stderr=Buffer.from(result.stderr??''),limit=128*1024;
 const text=stderr.subarray(0,limit).toString('utf8');
 const patterns=[
  ['scratch-space-exhausted',/\bENOSPC\b|no space left on device|not enough (?:disk )?space/i],
  ['filesystem-permission-denied',/permission denied|operation not permitted|access is denied/i],
  ['read-only-filesystem',/read.only file system/i],
  ['database-download-failed',/(?:failed|unable|error)[^\n]{0,100}(?:download|fetch|pull)[^\n]{0,100}(?:database|\bdb\b)|(?:database|\bdb\b)[^\n]{0,100}(?:download|fetch|pull)[^\n]{0,100}(?:failed|error)/i],
  ['registry-access-failed',/toomanyrequests|too many requests|\b(?:unauthorized|forbidden)\b|denied: requested access|unexpected status[^\n]{0,60}(?:401|403|429)/i],
  ['network-or-tls-failed',/x509:|certificate[^\n]{0,80}(?:unknown|invalid|expired)|(?:connection|network)[^\n]{0,50}(?:refused|unreachable|timeout)|no such host|tls handshake/i],
  ['archive-input-failed',/(?:archive|tar)[^\n]{0,80}(?:invalid|corrupt|failed|error)|(?:open|read)[^\n]{0,80}dashboard\.tar[^\n]{0,80}(?:denied|no such file)/i],
  ['platform-or-executable-failed',/exec format error|no matching manifest|unsupported platform/i],
  ['scanner-cli-arguments-failed',/unknown (?:flag|command)|flag provided but not defined|invalid argument|accepts? [0-9]+ arg/i]
 ];
 const observedClasses=patterns.filter(([,regex])=>regex.test(text)).map(([name])=>name);
 if(result.error?.code==='ETIMEDOUT')observedClasses.push('execution-timeout');
 if(result.error?.code==='ENOBUFS')observedClasses.push('execution-output-limit');
 const affectedPathClasses=[];for(const [kind,pattern] of [['tmp',/(?:write|open|mkdir|create|copy)[^\n]{0,160}\/tmp(?:\/|:)/i],['cache',/(?:write|open|mkdir|create|copy)[^\n]{0,160}\/cache(?:\/|:)/i]])if(pattern.test(text))affectedPathClasses.push(kind);
 const receipt={affectedPathClasses:affectedPathClasses.length?affectedPathClasses:['unknown'],schemaVersion:1,classification:'scanner-execution-failed',cause:observedClasses.length===1?observedClasses[0]:'multiple-or-unclassified',observedClasses,exitCode:Number.isSafeInteger(result.status)?result.status:null,stdoutBytes:stdout.length,stderrBytes:stderr.length,stdoutSha256:hash(stdout),stderrSha256:hash(stderr),classificationInput:'bounded-stderr-prefix',classificationPrefixBytes:limit,classificationTruncated:stderr.length>limit,rawDiagnostics:'withheld',scanPolicyResult:'not-evaluated'};
 if(Buffer.byteLength(JSON.stringify(receipt))>4096)throw Error('Bounded scan failure receipt exceeded');
 return receipt;
}
