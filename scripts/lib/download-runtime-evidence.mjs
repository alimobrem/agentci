import {createHash} from 'node:crypto';
export const RUNTIME_FILES=['downloaded-image-smoke.json','downloaded-eval-worker-smoke.json','downloaded-worker-native.json','downloaded-eval-worker-native.json','downloaded-forge-backport.json'];
export const IMAGE_CHECKS=['non-root API/worker startup','M2 schema readiness','signature rejection','evidence authentication','comparison authentication/UUID/scoped lookup','compiled comparison API/client reads actual queued database evidence','compiled snapshot export/client completion','signed closed delivery','non-root persistent Temporal database startup/restart','graceful shutdown'];
export const EVAL_CHECKS=['UBI non-root read-only runtime','only selected engine client; no package installers/App keys','mismatched engine rejected before database/Temporal connection','official pinned docker CLI execution','separately authenticated restricted database login','real Temporal workflow and isolated child execution','child has no database/App/socket credentials','behavioral failure preserved','worker graceful shutdown/restart','all owned children removed'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const requireProof=condition=>{if(!condition)throw Error('Incomplete or mismatched downloaded runtime evidence');};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const checks=(actual,expected)=>Array.isArray(actual)&&actual.length===expected.length&&new Set(actual).size===expected.length&&expected.every(value=>actual.includes(value));
export function validateRuntimeEvidence(records,identities,expected,pins){
 const arch=expected.platform.split('/')[1],nodeArch=arch==='amd64'?'x64':arch;
 const image=role=>identities.images.find(value=>value.role===role);
 for(const name of RUNTIME_FILES){const record=records[name],a=record?.acceptance;requireProof(a?.schemaVersion===1&&a.file===name);
  for(const key of ['sourceCommit','version','runId','attempt','acceptanceCommit','platform'])requireProof(a[key]===expected[key]);
  const {acceptance,...body}=record;requireProof(a.recordSha256===hash(JSON.stringify(body))&&a.identitiesSha256===expected.identitiesSha256);
 }
 const runtime=records[RUNTIME_FILES[0]];
 requireProof(runtime.result==='passed'&&runtime.version==='downloaded'&&runtime.platform===nodeArch&&checks(runtime.checks,IMAGE_CHECKS));
 for(const role of ['api','worker'])requireProof(runtime.images?.[role]===image(role).localImageId);
 const evaluator=records[RUNTIME_FILES[1]];
 requireProof(evaluator.result==='passed'&&evaluator.deployment==='native-CLI'&&evaluator.engine==='docker'&&evaluator.platform===expected.platform&&evaluator.workerImage===image('eval-worker').localImageId&&evaluator.runnerImage===image('eval-runner').localImageId&&evaluator.uid===1001&&evaluator.node==='v26.10.0'&&evaluator.cli===`Docker version ${pins.native.dockerCli.version}, build ${pins.native.dockerCli.sourceCommit.slice(0,7)}`&&evaluator.license===pins.dockerLicenseSha256&&checks(evaluator.checks,EVAL_CHECKS));
 for(const [name,role] of [[RUNTIME_FILES[2],'worker'],[RUNTIME_FILES[3],'eval-worker']]){
  const native=records[name];requireProof(native.image===image(role).image&&native.platform===expected.platform&&native.engine==='docker'&&native.temporalNativeArtifacts==='matched official npm artifact'&&same(native.files,pins.native.temporalBridge.files));
  if(role==='eval-worker'){const cli=native.dockerCli;requireProof(cli?.Version===pins.native.dockerCli.version&&cli.GitCommit===pins.native.dockerCli.sourceCommit.slice(0,7)&&cli.GoVersion===pins.native.dockerCli.goVersion&&cli.sha256===pins.native.dockerCli.binarySha256[arch]&&cli.vendorManifestSha256===pins.native.dockerCli.vendorManifest.sha256&&!native.podmanClient);}
 }
 const forge=records[RUNTIME_FILES[4]],observed=forge.observed;
 requireProof(forge.image===image('eval-engines').localImageId&&forge.releaseImage===image('eval-engines').image&&forge.sourceCommit===expected.sourceCommit&&forge.version===expected.version&&forge.platform===expected.platform&&observed?.arch===nodeArch&&observed.rsaSha256===pins.forge.afterSha256&&same(observed.metadata,pins.forge)&&observed.verifierSha256===pins.verifierSha256&&observed.fixtureSha256===pins.fixtureSha256);
 for(const key of ['malformedRegressionRejected','validSignaturesAccepted','wrongMessagesRejected','scannerFindingRetained'])requireProof(forge[key]===true);
 return records;
}
