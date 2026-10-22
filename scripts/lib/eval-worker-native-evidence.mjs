import {createHash} from 'node:crypto';
import {EVAL_CHECKS} from './download-runtime-evidence.mjs';
import {dashboardScanFailure} from './dashboard-scan-failure.mjs';

export const NATIVE_SCAN_IMAGE='aquasec/trivy:0.75.0@sha256:af6acf9a6b85dfe389a1941505c0ce9efef52a4719635e1a962f022a3d855daa';
export const NATIVE_FILES=['source.json','daemon.json','images.json','worker-scan.json','runner-scan.json','native.json','runtime.json','attempt.json','cleanup.json'];
export const NATIVE_SCAN_FAILURE_FILES=['worker-scan-execution-failure.json','runner-scan-execution-failure.json'];
export const EVAL_NATIVE_INPUTS=['Dockerfile','.dockerignore','LICENSE','agentci.yaml','package.json','package-lock.json','npm-shrinkwrap.json','deploy/security/native-components.json','deploy/security/docker-cli-vendor.mod','deploy/licenses/docker-cli-LICENSE','deploy/licenses/docker-cli-NOTICE','scripts/check-scan.mjs','scripts/eval-worker-native-acceptance.mjs','scripts/eval-worker-image-smoke.mjs','scripts/verify-native-provenance.mjs','scripts/lib/eval-worker-native-evidence.mjs','scripts/lib/dashboard-scan-failure.mjs','scripts/lib/eval-worker-private-config.mjs','scripts/lib/image-smoke-state.mjs','scripts/lib/smoke-resources.mjs','scripts/lib/download-runtime-evidence.mjs','.github/workflows/eval-worker-native.yaml'];
export const nativeHash=value=>createHash('sha256').update(value).digest('hex');
const sha=/^[a-f0-9]{40}$/,hash=/^[a-f0-9]{64}$/,image=/^sha256:[a-f0-9]{64}$/;
const fail=()=>{throw Error('Native evaluator evidence does not match the exact source and runtime contract');};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function evalEngineMismatchRejected(record){return Number.isInteger(record?.status)&&record.status!==0&&!record.error&&record.signal===null&&typeof record.stderr==='string'&&record.stderr.includes('Configured container engine client is unavailable');}
/** execFileSync exposes transport error codes directly, unlike spawnSync's result.error. */
export function evalNativeScanFailure(error,{source,role,imageId}){
 validateEvalNativeSource(source);if(!['eval-worker','eval-runner'].includes(role)||!image.test(imageId??''))fail();
 const channel=value=>Buffer.isBuffer(value)?value:Buffer.from(typeof value==='string'?value:'');
 const signals=['SIGHUP','SIGINT','SIGQUIT','SIGILL','SIGTRAP','SIGABRT','SIGIOT','SIGBUS','SIGFPE','SIGKILL','SIGUSR1','SIGSEGV','SIGUSR2','SIGPIPE','SIGALRM','SIGTERM','SIGSTKFLT','SIGCHLD','SIGCONT','SIGSTOP','SIGTSTP','SIGTTIN','SIGTTOU','SIGURG','SIGXCPU','SIGXFSZ','SIGVTALRM','SIGPROF','SIGWINCH','SIGIO','SIGPOLL','SIGPWR','SIGSYS'];
 const observed={status:Number.isInteger(error?.status)&&error.status>=0&&error.status<=255?error.status:null,signal:signals.includes(error?.signal)?error.signal:null,stdout:channel(error?.stdout),stderr:channel(error?.stderr),error:{code:error?.code}};
 const binding=Object.fromEntries(['sourceCommit','sourceTree','candidateCommit','runId','attempt','arch','harnessOwner','rootLockSha256','nativePinsSha256'].map(key=>[key,source[key]]));
 const record={schemaVersion:1,result:'failed-or-unverified',stage:role==='eval-worker'?'worker-scan':'runner-scan',source:binding,sourceInputsSha256:nativeHash(JSON.stringify(source.inputs)),role,imageId,scanner:NATIVE_SCAN_IMAGE,rootCause:'not-established',diagnostics:{...dashboardScanFailure(observed),signal:observed.signal}};
 if(Buffer.byteLength(JSON.stringify(record))>8192)fail();return record;
}
export function validateEvalNativeDaemon(record,source){if(record?.os!=='linux'||record.arch!==source.arch||!same(Object.keys(record).sort(),['arch','os']))fail();return record;}
export function validateEvalNativeSource(value){
 if(value?.schemaVersion!==1||value.artifactKind!=='nonpublishing-native-eval-worker'||!sha.test(value.sourceCommit??'')||!sha.test(value.sourceTree??'')||!sha.test(value.candidateCommit??'')||!/^\d+$/.test(value.runId??'')||!/^\d*[1-9]\d*$/.test(value.attempt??'')||!['amd64','arm64'].includes(value.arch)||value.platform!=='linux/'+value.arch||value.node!=='v26.10.0'||!/^agentci-smoke-[a-f0-9]{16}$/.test(value.harnessOwner??'')||!hash.test(value.rootLockSha256??'')||value.packageLockSha256!==value.rootLockSha256||!hash.test(value.nativePinsSha256??'')||!hash.test(value.dockerfileSha256??'')||!Array.isArray(value.inputs)||!same(value.inputs.map(f=>f.path),EVAL_NATIVE_INPUTS)||value.inputs.some(f=>!hash.test(f.sha256??'')))fail();
 for(const [field,path]of [['rootLockSha256','npm-shrinkwrap.json'],['packageLockSha256','package-lock.json'],['nativePinsSha256','deploy/security/native-components.json'],['dockerfileSha256','Dockerfile']])if(value[field]!==value.inputs.find(f=>f.path===path).sha256)fail();
 if(!['pull_request','push'].includes(value.event)||!Array.isArray(value.checkoutParents)||value.checkoutParents.some(p=>!sha.test(p))||value.event==='push'&&value.candidateCommit!==value.sourceCommit||value.event==='pull_request'&&value.candidateCommit!==value.sourceCommit&&!value.checkoutParents.includes(value.candidateCommit))fail();
 return value;
}
export function evalNativeLabels(source,role){
 return {'org.opencontainers.image.revision':source.sourceCommit,'org.agentci.source-tree':source.sourceTree,'org.agentci.candidate':source.candidateCommit,'org.agentci.root-lock':source.rootLockSha256,'org.agentci.native-pins':source.nativePinsSha256,'org.agentci.native-role':role};
}
export function validateEvalNativeImages(images,source){
 validateEvalNativeSource(source);
 if(!images||!same(Object.keys(images).sort(),['eval-runner','eval-worker']))fail();
 for(const role of ['eval-worker','eval-runner']){
  const v=images[role];if(!image.test(v?.id??'')||v.os!=='linux'||v.arch!==source.arch||!['1001','1001:0'].includes(v.user)||!same(v.command,role==='eval-worker'?['node','dist/apps/eval-worker/main.js']:['node','--version'])||v.entrypoint!==null&&!same(v.entrypoint,[]))fail();
  for(const [key,expected]of Object.entries(evalNativeLabels(source,role)))if(v.labels?.[key]!==expected)fail();
 }
 if(images['eval-worker'].id===images['eval-runner'].id)fail();
 return images;
}
export function validateEvalNativeScan(scan,id,source){
 if(scan?.ArtifactType!=='container_image'||scan.ArtifactName!==id||scan.Metadata?.ImageID!==id||scan.Metadata.ImageConfig?.os!=='linux'||scan.Metadata.ImageConfig?.architecture!==source.arch||!Array.isArray(scan.Results)||!scan.Results.length||scan.Results.some(r=>typeof r.Target!=='string'||r.Vulnerabilities!==undefined&&!Array.isArray(r.Vulnerabilities))||scan.Results.flatMap(r=>r.Vulnerabilities??[]).some(v=>!['UNKNOWN','LOW','MEDIUM','HIGH','CRITICAL'].includes(v.Severity)||['HIGH','CRITICAL'].includes(v.Severity)&&v.FixedVersion))fail();
 return scan;
}
export function validateEvalNativeProvenance(record,id,source,pins){
 const cli=record?.dockerCli;
 if(record?.image!==id||record.engine!=='docker'||record.platform!==source.platform||record.temporalNativeArtifacts!=='matched official npm artifact'||!same(record.files,pins.temporalBridge.files)||record.podmanClient||cli?.Version!==pins.dockerCli.version||cli.GitCommit!==pins.dockerCli.sourceCommit.slice(0,7)||cli.GoVersion!==pins.dockerCli.goVersion||cli.sha256!==pins.dockerCli.binarySha256[source.arch]||cli.vendorManifestSha256!==pins.dockerCli.vendorManifest.sha256||cli.licenseSha256!==pins.dockerCli.licenseSha256||cli.noticeSha256!==pins.dockerCli.notice.sha256)fail();
 return record;
}
export function validateEvalNativeCleanup(record){
 if(record?.schemaVersion!==1||record.result!=='passed'||!/^agentci-smoke-[a-f0-9]{16}$/.test(record.owner??'')||record.ownedContainers!==0||record.ownedNetworks!==0||record.ownedVolumes!==0||record.privateFilesRemoved!==true)fail();return record;
}
export function validateEvalNativeRuntime(record,images,source,pins){
 if(record?.result!=='passed'||record.deployment!=='native-CLI'||record.engine!=='docker'||record.platform!==source.platform||record.workerImage!==images['eval-worker'].id||record.runnerImage!==images['eval-runner'].id||record.uid!==1001||record.node!=='v26.10.0'||record.cli!==`Docker version ${pins.dockerCli.version}, build ${pins.dockerCli.sourceCommit.slice(0,7)}`||record.license!==pins.dockerCli.licenseSha256||!Array.isArray(record.checks)||record.checks.length!==EVAL_CHECKS.length||new Set(record.checks).size!==EVAL_CHECKS.length||EVAL_CHECKS.some(v=>!record.checks.includes(v)))fail();
 validateEvalNativeCleanup(record.cleanup);if(record.cleanup.ownedEvalContainers!==0||record.cleanup.evalUnitsChecked!==3)fail();return record;
}
export function validateEvalNativeRecords(records,pins){
 if(NATIVE_SCAN_FAILURE_FILES.some(file=>Object.hasOwn(records,file)))fail();
 const source=validateEvalNativeSource(records['source.json']),images=validateEvalNativeImages(records['images.json'],source);validateEvalNativeDaemon(records['daemon.json'],source);
 validateEvalNativeScan(records['worker-scan.json'],images['eval-worker'].id,source);validateEvalNativeScan(records['runner-scan.json'],images['eval-runner'].id,source);
 validateEvalNativeProvenance(records['native.json'],images['eval-worker'].id,source,pins);validateEvalNativeRuntime(records['runtime.json'],images,source,pins);
 const attempt=records['attempt.json'];if(attempt?.schemaVersion!==1||attempt.result!=='passed'||!same(attempt.source,source))fail();
 const cleanup=records['cleanup.json'];if(cleanup?.result!=='passed')fail();validateEvalNativeCleanup(cleanup.harness);validateEvalNativeCleanup(cleanup.runtime);if(cleanup.harness.owner!==source.harnessOwner||cleanup.runtime.owner!==records['runtime.json'].cleanup.owner||cleanup.runtime.owner===cleanup.harness.owner||cleanup.runtime.ownedEvalContainers!==0||cleanup.runtime.evalUnitsChecked!==records['runtime.json'].cleanup.evalUnitsChecked)fail();
 return source;
}
export function evalNativeFailure(stage,error){
 const allowed=['prepare','images','worker-scan','runner-scan','native','runtime','source-recheck','cleanup','evidence-validation'];
 return {schemaVersion:1,result:'failed-or-unverified',stage:allowed.includes(stage)?stage:'prepare',exitCode:Number.isInteger(error?.status)?error.status:null,signal:typeof error?.signal==='string'&&/^SIG[A-Z]+$/.test(error.signal)?error.signal:null};
}
