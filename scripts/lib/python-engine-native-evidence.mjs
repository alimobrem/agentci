import {createHash} from 'node:crypto';
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {isAbsolute,resolve} from 'node:path';
import {validateCoverage} from '../download-integration-reporter.mjs';
import {NATIVE_SCAN_IMAGE,validateEvalNativeScan} from './eval-worker-native-evidence.mjs';
import {validatePythonEngineProvenance} from './python-engine-provenance.mjs';

export {NATIVE_SCAN_IMAGE};
export const PYTHON_NATIVE_KIND='nonpublishing-native-python-engines';
export const PYTHON_NATIVE_MODE='python-engine-native';
export const PYTHON_NATIVE_REF='refs/heads/codex/m3-python-security-refresh';
export const PYTHON_NATIVE_WORKFLOW='.github/workflows/verify.yaml';
export const PYTHON_NATIVE_INPUTS=[
 'Dockerfile','.dockerignore','LICENSE','package.json','package-lock.json','npm-shrinkwrap.json',
 'deploy/security/native-components.json','deploy/security/python-engine-components.json',
 'deploy/engines/deepeval/requirements.txt','deploy/runner-requirements.txt',
 'deploy/engines/promptfoo/package.json','deploy/engines/promptfoo/package-lock.json',
 'deploy/engines/patches/apply-forge-backport.mjs','deploy/engines/patches/verify-forge-backport.cjs',
 'deploy/engines/patches/forge-backport.json','deploy/engines/patches/forge-nested-digest-fixture.json',
 'deploy/engines/patches/README.md','deploy/engines/licenses/mcp-server-filesystem-LICENSE',
 'packages/evals/runner.ts','packages/evals/bootstrap.ts','packages/evals/adapters.ts','packages/evals/contracts.ts',
 'packages/review/engine.ts','packages/project/index.ts','packages/schemas/index.ts',
 'packages/evals/json/eval-suite.schema.json','packages/evals/json/eval-run.schema.json',
 'packages/evals/json/http-eval-request.schema.json','packages/evals/json/http-eval-response.schema.json',
 'packages/schemas/json/agent-project.schema.json','packages/schemas/json/requirement.schema.json',
 'packages/schemas/json/finding.schema.json','packages/schemas/json/evidence.schema.json',
 'tests/fixtures/evals.ts','tests/integration/eval-engines.test.ts',
 'scripts/python-engine-native-acceptance.mjs','scripts/lib/python-engine-native-evidence.mjs',
 'scripts/lib/python-engine-provenance.mjs','scripts/lib/eval-worker-native-evidence.mjs',
 'scripts/lib/download-runtime-evidence.mjs','scripts/lib/dashboard-scan-failure.mjs',
 'scripts/lib/smoke-resources.mjs','scripts/download-integration-reporter.mjs','scripts/check-scan.mjs',
 'tests/python-engine-provenance.test.ts','tests/python-engine-native.test.ts',
 'tests/python-engine-native-workflow.test.ts',PYTHON_NATIVE_WORKFLOW
];
const primaryFiles=['source.json','daemon.json','image.json','scan.json','scan-execution.json','runtime-tests.json','python-installed-provenance.json','runtime.json','cleanup.json'];
export const PYTHON_NATIVE_FILES=[...primaryFiles,'failure-source.json','failure-scan.json','failure-runtime.json','failure-finalize.json','result.json','artifact-manifest.json'];
export const pythonNativeHash=value=>createHash('sha256').update(value).digest('hex');
const fail=()=>{throw Error('Native optional Python engine evidence mismatch');};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const object=(value,keys)=>{if(!value||typeof value!=='object'||Array.isArray(value)||!same(Object.keys(value).sort(),[...keys].sort()))fail();};
const text=(value,pattern,length)=>typeof value==='string'&&(!length||value.length===length)&&pattern.test(value);
const sha=value=>text(value,/^[a-f0-9]{40}$/,40),hash=value=>text(value,/^[a-f0-9]{64}$/,64),imageId=value=>text(value,/^sha256:[a-f0-9]{64}$/,71);
const owner=value=>text(value,/^agentci-smoke-[a-f0-9]{16}$/,30),uuid=value=>text(value,/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/,36);
const positive=value=>typeof value==='string'&&value.length<=20&&value.trim()===value&&/^[1-9][0-9]*$/.test(value);
const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const signals=['SIGHUP','SIGINT','SIGQUIT','SIGILL','SIGTRAP','SIGABRT','SIGBUS','SIGFPE','SIGKILL','SIGUSR1','SIGSEGV','SIGUSR2','SIGPIPE','SIGALRM','SIGTERM','SIGCHLD','SIGCONT','SIGSTOP','SIGTSTP','SIGTTIN','SIGTTOU','SIGURG','SIGXCPU','SIGXFSZ','SIGVTALRM','SIGPROF','SIGWINCH','SIGIO','SIGPOLL','SIGPWR','SIGSYS'];
const errors=[null,'ETIMEDOUT','ENOBUFS','ENOENT','EACCES','ABORT_ERR','OTHER'];
const suiteRelative='tests/integration/eval-engines.test.ts';
const runtimeAcceptance='native-python-engines-qualified';

export function validatePythonNativeHostedContext(environment,runtime,arch,head){
 if(environment.GITHUB_ACTIONS!=='true'||environment.GITHUB_REPOSITORY!=='alimobrem/agentci'||environment.GITHUB_EVENT_NAME!=='workflow_dispatch'||environment.AGENTCI_PYTHON_NATIVE_MODE!==PYTHON_NATIVE_MODE||environment.AGENTCI_CONTAINER_ENGINE!=='docker'||environment.GITHUB_REF!==PYTHON_NATIVE_REF||environment.GITHUB_WORKFLOW_REF!=='alimobrem/agentci/'+PYTHON_NATIVE_WORKFLOW+'@'+PYTHON_NATIVE_REF||!sha(head)||environment.INPUT_EXPECTED_SOURCE!==head||environment.GITHUB_SHA!==head||environment.GITHUB_WORKFLOW_SHA!==head||!positive(environment.GITHUB_RUN_ID)||!positive(environment.GITHUB_RUN_ATTEMPT)||runtime.platform!=='linux'||runtime.node!=='v26.10.0'||!['amd64','arm64'].includes(arch)||(runtime.arch==='x64'?'amd64':runtime.arch)!==arch)fail();
 return true;
}

export function validatePythonNativeSource(value){
 object(value,['schemaVersion','artifactKind','mode','repository','ref','workflowPath','workflowRef','workflowSha','workflowPermissions','sourceCommit','sourceTree','candidateCommit','expectedSourceCommit','checkoutParents','event','runId','attempt','arch','platform','node','harnessOwner','fixtureUnitId','fixtureLeaseSha256','trackedClean','committedInputBytes','rootLockSha256','packageLockSha256','nativePinsSha256','dockerfileSha256','pythonComponentsSha256','requirementsSha256','inputs']);
 if(value.schemaVersion!==1||value.artifactKind!==PYTHON_NATIVE_KIND||value.mode!==PYTHON_NATIVE_MODE||value.repository!=='alimobrem/agentci'||value.ref!==PYTHON_NATIVE_REF||value.workflowPath!==PYTHON_NATIVE_WORKFLOW||value.workflowRef!=='alimobrem/agentci/'+PYTHON_NATIVE_WORKFLOW+'@'+PYTHON_NATIVE_REF||value.workflowPermissions!=='contents-read-only'||!sha(value.sourceCommit)||!sha(value.sourceTree)||value.candidateCommit!==value.sourceCommit||value.expectedSourceCommit!==value.sourceCommit||value.workflowSha!==value.sourceCommit||value.event!=='workflow_dispatch'||!positive(value.runId)||!positive(value.attempt)||!['amd64','arm64'].includes(value.arch)||value.platform!=='linux/'+value.arch||value.node!=='v26.10.0'||!owner(value.harnessOwner)||!uuid(value.fixtureUnitId)||!hash(value.fixtureLeaseSha256)||value.trackedClean!==true||value.committedInputBytes!==true||!Array.isArray(value.checkoutParents)||value.checkoutParents.length>8||value.checkoutParents.some(parent=>!sha(parent))||!Array.isArray(value.inputs)||value.inputs.length!==PYTHON_NATIVE_INPUTS.length)fail();
 for(let i=0;i<PYTHON_NATIVE_INPUTS.length;i++){const input=value.inputs[i];object(input,['path','sha256']);if(input.path!==PYTHON_NATIVE_INPUTS[i]||!hash(input.sha256))fail();}
 for(const [field,path]of [['rootLockSha256','npm-shrinkwrap.json'],['packageLockSha256','package-lock.json'],['nativePinsSha256','deploy/security/native-components.json'],['dockerfileSha256','Dockerfile'],['pythonComponentsSha256','deploy/security/python-engine-components.json'],['requirementsSha256','deploy/engines/deepeval/requirements.txt']])if(!hash(value[field])||value[field]!==value.inputs.find(input=>input.path===path).sha256)fail();
 if(value.packageLockSha256!==value.rootLockSha256)fail();return value;
}

export function pythonNativeLabels(source){
 validatePythonNativeSource(source);
 return {'org.opencontainers.image.revision':source.sourceCommit,'org.agentci.source-tree':source.sourceTree,'org.agentci.candidate':source.candidateCommit,'org.agentci.root-lock':source.rootLockSha256,'org.agentci.native-pins':source.nativePinsSha256,'org.agentci.native-role':'eval-engines'};
}
export function validatePythonNativeDaemon(value,source){validatePythonNativeSource(source);object(value,['os','arch']);if(value.os!=='linux'||value.arch!==source.arch)fail();return value;}
export function validatePythonNativeImage(value,source){
 object(value,['role','id','os','arch','user','command','entrypoint','labels']);const labels=pythonNativeLabels(source);object(value.labels,Object.keys(labels));
 if(value.role!=='eval-engines'||!imageId(value.id)||value.os!=='linux'||value.arch!==source.arch||!['1001','1001:0'].includes(value.user)||!same(value.command,['node','--version'])||value.entrypoint!==null&&!same(value.entrypoint,[])||Object.entries(labels).some(([key,label])=>value.labels[key]!==label))fail();return value;
}
export function validatePythonNativeScan(scan,image,source){validatePythonNativeImage(image,source);return validateEvalNativeScan(scan,image.id,source);}

const channelKeys=['stdoutBytes','stderrBytes','stdoutSha256','stderrSha256'];
function channels(value){if(!integer(value.stdoutBytes,0,8*1024*1024)||!integer(value.stderrBytes,0,8*1024*1024)||!hash(value.stdoutSha256)||!hash(value.stderrSha256))fail();}
function jsonBytes(bytes,value){if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>8*1024*1024)fail();let decoded;try{decoded=JSON.parse(bytes.toString('utf8'));}catch{fail();}if(!same(decoded,value))fail();return bytes;}
export function validatePythonNativeScanExecution(value,source,image,{scanBytes}={}){
 validatePythonNativeImage(image,source);
 object(value,['schemaVersion','artifactKind','sourceSha256','imageId','result','scanner','exitCode','signal','errorCode','timeoutMs','terminationGraceMs','forced',...channelKeys]);channels(value);
 if(value.schemaVersion!==1||value.artifactKind!=='native-python-engine-scan-execution'||value.sourceSha256!==pythonNativeHash(JSON.stringify(source))||value.imageId!==image.id||value.scanner!==NATIVE_SCAN_IMAGE||!['passed','failed'].includes(value.result)||value.exitCode!==null&&!integer(value.exitCode,0,255)||value.signal!==null&&!signals.includes(value.signal)||!errors.includes(value.errorCode)||value.timeoutMs!==600000||value.terminationGraceMs!==10000||typeof value.forced!=='boolean')fail();
 if(value.result==='passed'&&(value.exitCode!==0||value.signal!==null||value.errorCode!==null||value.forced||!Buffer.isBuffer(scanBytes)||scanBytes.length!==value.stdoutBytes||pythonNativeHash(scanBytes)!==value.stdoutSha256))fail();return value;
}

function validateTestReport(report,source,{suitePath=resolve(suiteRelative)}={}){
 object(report,['schemaVersion','artifactKind','runId','attempt','sourceCommit','tests','suites','inputs','summaries']);
 if(report.schemaVersion!==1||report.artifactKind!=='native-python-engine-test-report'||report.runId!==source.runId||report.attempt!==source.attempt||report.sourceCommit!==source.sourceCommit||report.tests!==1||report.suites!==1||!Array.isArray(report.inputs)||report.inputs.length!==1||!Array.isArray(report.summaries)||report.summaries.length!==2||!isAbsolute(suitePath)||suitePath!==resolve(suitePath))fail();
 const input=report.inputs[0];object(input,['file','sha256']);if(input.file!==suitePath||input.sha256!==source.inputs.find(item=>item.path===suiteRelative).sha256)fail();
 for(const summary of report.summaries){object(summary,['file','success','counts']);object(summary.counts,['tests','passed','failed','skipped','cancelled','todo']);if(summary.file!==null&&summary.file!==suitePath||summary.success!==true||!Object.values(summary.counts).every(value=>integer(value))||summary.counts.tests!==1)fail();}
 const coverage=validateCoverage([suitePath],report.summaries);if(coverage.tests!==1||coverage.suites!==1)fail();return report;
}
export function validatePythonNativeRuntime(value,source,image,{testReport,provenance,components,componentsBytes,requirements,testReportBytes,provenanceBytes,suitePath}={}){
 validatePythonNativeImage(image,source);
 object(value,['schemaVersion','artifactKind','sourceSha256','imageId','result','platform','node','testReportSha256','provenanceSha256',...channelKeys,'exitCode','signal','errorCode','timeoutMs','terminationGraceMs','forced','runtimeAcceptance','aggregateM3Acceptance','releaseComplete']);channels(value);
 if(value.schemaVersion!==1||value.artifactKind!=='native-python-engine-runtime'||value.sourceSha256!==pythonNativeHash(JSON.stringify(source))||value.imageId!==image.id||value.result!=='passed'||value.platform!==source.platform||value.node!=='v26.10.0'||value.exitCode!==0||value.signal!==null||value.errorCode!==null||value.timeoutMs!==120000||value.terminationGraceMs!==10000||value.forced!==false||value.runtimeAcceptance!==runtimeAcceptance||value.aggregateM3Acceptance!==false||value.releaseComplete!==false)fail();
 validateTestReport(testReport,source,{suitePath});validatePythonEngineProvenance(provenance,components,requirements);
 jsonBytes(componentsBytes,components);
 if(provenance.platform!==source.platform||pythonNativeHash(requirements)!==source.requirementsSha256||pythonNativeHash(componentsBytes)!==source.pythonComponentsSha256)fail();
 jsonBytes(testReportBytes,testReport);jsonBytes(provenanceBytes,provenance);
 if(value.testReportSha256!==pythonNativeHash(testReportBytes)||value.provenanceSha256!==pythonNativeHash(provenanceBytes)||value.stdoutBytes!==testReportBytes.length||value.stdoutSha256!==value.testReportSha256)fail();return value;
}
export function validatePythonNativeCleanup(value,source,image){
 validatePythonNativeImage(image,source);
 object(value,['schemaVersion','result','owner','sourceSha256','imageId','fixtureUnitId','fixtureLeaseSha256','fixtureContainers','ownedContainers','ownedNetworks','ownedVolumes','fixedCacheRemoved','privateFilesRemoved']);
 if(value.schemaVersion!==1||value.result!=='passed'||value.owner!==source.harnessOwner||value.sourceSha256!==pythonNativeHash(JSON.stringify(source))||value.imageId!==image.id||value.fixtureUnitId!==source.fixtureUnitId||value.fixtureLeaseSha256!==source.fixtureLeaseSha256||value.fixtureContainers!==0||value.ownedContainers!==0||value.ownedNetworks!==0||value.ownedVolumes!==0||value.fixedCacheRemoved!==true||value.privateFilesRemoved!==true)fail();return value;
}

/** Final result/index are authored only after this complete primary-record check. */
export function validatePythonNativeRecords(records,{components,componentsBytes,requirements,bytes,suitePath}={}){
 object(records,primaryFiles);object(bytes,primaryFiles);
 for(const name of primaryFiles)jsonBytes(bytes[name],records[name]);
 const source=validatePythonNativeSource(records['source.json']),image=validatePythonNativeImage(records['image.json'],source);
 validatePythonNativeDaemon(records['daemon.json'],source);validatePythonNativeScan(records['scan.json'],image,source);
 if(records['scan-execution.json'].result!=='passed')fail();validatePythonNativeScanExecution(records['scan-execution.json'],source,image,{scanBytes:bytes['scan.json']});
 validatePythonNativeRuntime(records['runtime.json'],source,image,{testReport:records['runtime-tests.json'],provenance:records['python-installed-provenance.json'],components,componentsBytes,requirements,testReportBytes:bytes['runtime-tests.json'],provenanceBytes:bytes['python-installed-provenance.json'],suitePath});
 validatePythonNativeCleanup(records['cleanup.json'],source,image);return source;
}
export function pythonNativeFailure(stage,error){
 return {schemaVersion:1,artifactKind:PYTHON_NATIVE_KIND,result:'failed-or-unverified',stage:['source','image','scan','runtime','source-recheck','cleanup','finalize'].includes(stage)?stage:'source',exitCode:integer(error?.status,0,255)?error.status:null,signal:signals.includes(error?.signal)?error.signal:null,runtimeAcceptance:'not-performed',aggregateM3Acceptance:false,releaseComplete:false};
}

/** One existing suite only; public summaries never include test output or errors. */
export default async function* pythonNativeReporter(events,{root=process.cwd(),environment=process.env}={}){
 const file=resolve(root,suiteRelative),info=lstatSync(file);if(!info.isFile()||info.isSymbolicLink()||realpathSync(file)!==file||!sha(environment.INPUT_EXPECTED_SOURCE)||!positive(environment.GITHUB_RUN_ID)||!positive(environment.GITHUB_RUN_ATTEMPT))fail();
 const sha256=pythonNativeHash(readFileSync(file)),summaries=[];
 for await(const event of events)if(event.type==='test:summary'){
  const report=event.data,c=report?.counts;if(!c)fail();
  if(summaries.length>=2||report.success!==true||report.file!==undefined&&report.file!==null&&report.file!==file||!['tests','passed','failed','skipped','cancelled','todo'].every(key=>integer(c[key])))fail();
  summaries.push({file:report.file??null,success:report.success,counts:Object.fromEntries(['tests','passed','failed','skipped','cancelled','todo'].map(key=>[key,c[key]]))});
 }
 const coverage=validateCoverage([file],summaries);if(coverage.tests!==1||coverage.suites!==1||summaries.length!==2||pythonNativeHash(readFileSync(file))!==sha256)fail();
 const after=lstatSync(file);if(!after.isFile()||after.isSymbolicLink()||realpathSync(file)!==file)fail();
 yield JSON.stringify({schemaVersion:1,artifactKind:'native-python-engine-test-report',runId:environment.GITHUB_RUN_ID,attempt:environment.GITHUB_RUN_ATTEMPT,sourceCommit:environment.INPUT_EXPECTED_SOURCE,...coverage,inputs:[{file,sha256}],summaries},null,2)+'\n';
}
