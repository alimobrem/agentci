import {createHash} from 'node:crypto';
import {isAbsolute,resolve} from 'node:path';
import {ABRUPT143_COMMAND,validateNativePublicDrain} from './dashboard-native-drain.mjs';
import {validateDashboardShutdown} from './dashboard-shutdown.mjs';
import {validateNativeAuthenticatedEvidence} from './dashboard-native-authenticated-evidence.mjs';
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const fail=()=>{throw Error('Dashboard native evidence does not match the exact source/runtime contract');};
const digest=value=>createHash('sha256').update(value).digest('hex');
export const DASHBOARD_FIXTURE_CA_PATH='/run/agentci-fixture-ca.pem';
export const DASHBOARD_FIXTURE_HOST='dashboard.fixture.invalid';
const productionCommand=['node','apps/dashboard/server.js'];
// Reject presence, including superficially safe values: none is part of the default qualification.
const trustTransportEnvironment=/^(?:NODE_(?:EXTRA_CA_CERTS|TLS_REJECT_UNAUTHORIZED|USE_SYSTEM_CA|USE_OPENSSL_CA|USE_BUNDLED_CA|USE_ENV_PROXY|REDIRECT_WARNINGS)|SSL_CERT_(?:FILE|DIR)|OPENSSL_(?:CONF|MODULES)|SSLKEYLOGFILE|CURL_CA_BUNDLE|REQUESTS_CA_BUNDLE|(?:HTTP|HTTPS|ALL|NO)_PROXY|GLOBAL_AGENT_.*|npm_config_(?:proxy|https_proxy|noproxy|cafile|strict_ssl))$/i;
function environment(values){
 if(!Array.isArray(values))fail();const map=new Map();
 for(const entry of values){if(typeof entry!=='string'||/[\0\r\n]/.test(entry))fail();const index=entry.indexOf('='),key=entry.slice(0,index);if(index<1||!(/^[A-Za-z_][A-Za-z0-9_]*$/).test(key)||map.has(key))fail();map.set(key,entry.slice(index+1));}
 return map;
}
function unsafeEnvironment(key){return /^(?:NEXT_MANUAL_SIG_HANDLE|NODE_OPTIONS|NODE_PATH)$/.test(key)||trustTransportEnvironment.test(key);}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const empty=value=>value==null||Array.isArray(value)&&value.length===0;
export async function retainDashboardShutdown(receipts, record, save, expected) {
 const captured=structuredClone(record),identity=structuredClone(expected);receipts.push(captured);
 await save('shutdown.json',receipts);
 return validateDashboardShutdown(captured,identity);
}
export function validateDashboardImage(image,expected){
 if((image?.Config?.Entrypoint!=null&&JSON.stringify(image.Config.Entrypoint)!=='[]')||image?.Config?.StopSignal!=='SIGTERM'||image?.Os!=='linux'||image.Architecture!==expected.arch||!/^sha256:[a-f0-9]{64}$/.test(image.Id)||!['1001','1001:0'].includes(image.Config?.User)||JSON.stringify(image.Config?.Cmd)!==JSON.stringify(['node','apps/dashboard/server.js']))fail();
 const labels=image.Config.Labels??{};
 for(const [key,value] of [['org.opencontainers.image.revision',expected.sourceCommit],['org.agentci.dashboard.lock-sha256',expected.dashboardLockSha256],['org.agentci.root.lock-sha256',expected.rootLockSha256],['org.agentci.dashboard.version',expected.dashboardVersion]])if(labels[key]!==value)fail();
 const env=[...environment(image.Config.Env??[]).keys()];if(env.some(k=>unsafeEnvironment(k)||/^(?:AGENTCI_DASHBOARD_CONFIG|NEXT_PUBLIC_|GITHUB_|AGENTCI_(?:EVIDENCE|OPERATOR)_TOKEN)/.test(k)))fail();
 return {id:image.Id,os:image.Os,arch:image.Architecture,user:image.Config.User,labels:Object.fromEntries(Object.entries(labels).filter(([k])=>k.startsWith('org.agentci.')||k==='org.opencontainers.image.revision')),runtimeEnvironmentNames:env,runtimeEnvironmentSha256:digest(JSON.stringify(image.Config.Env??[]))};
}
export function validateDashboardRuntime(record,expected){
 if(record?.uid!==1001||record.pid1Uid!==1001||record.arch!==(expected.arch==='amd64'?'x64':'arm64')||record.node!=='v26.10.0'||record.rootPackage?.name!=='agentci'||record.rootPackage?.version!==expected.rootVersion||record.dashboardPackage?.name!=='@agentci/dashboard'||record.dashboardPackage?.version!==expected.dashboardVersion||!record.sharp?.pngBytes||!hash(record.nodeBinarySha256)||!hash(record.nodeLicenseSha256)||record.privatePaths.length||record.developmentLoaders.length||record.escapingLinks.length||!record.files.length||!record.staticAssets.length)fail();
 return record;
}
export function validateDashboardAnonymous(record,mode){
 const privateRead=mode==='configured'?401:503;
 if(record?.live!==200||record.ready!==(mode==='configured'?200:503)||record.session!==401||record.review!==privateRead||record.history!==privateRead||record.export!==privateRead||record.logout!==403||record.canaryInResponses||record.canaryInStaticAssets||record.privateCacheHeaders!==true||record.upstreamAvailabilityVerified!==false)fail();
 return record;
}
export function validateDashboardContainer(record,image,owner){
 const h=record?.HostConfig,c=record?.Config;
 if(record?.Image!==image.id||c?.Labels?.['agentci.image-smoke.owner']!==owner||JSON.stringify(c?.Cmd)!==JSON.stringify(['node','apps/dashboard/server.js'])||(c?.Entrypoint!=null&&JSON.stringify(c.Entrypoint)!=='[]')||[...environment(c?.Env??[]).keys()].some(unsafeEnvironment)||!['1001','1001:0'].includes(c.User)||h?.NetworkMode!=='none'||!empty(h.ExtraHosts)||h.ReadonlyRootfs!==true||!h.CapDrop?.includes('ALL')||(h.CapAdd!=null&&(!Array.isArray(h.CapAdd)||h.CapAdd.length!==0))||h.Privileged!==false||!h.SecurityOpt?.includes('no-new-privileges')||h.PidsLimit!==128||h.Memory!==512*1024*1024||h.NanoCpus!==1000000000||(record.Mounts??[]).some(m=>m.Type!=='tmpfs'||m.Destination!=='/tmp'))fail();
 return {imageId:record.Image,user:c.User,network:h.NetworkMode,readOnly:h.ReadonlyRootfs,capabilitiesDropped:true,noNewPrivileges:true,pids:h.PidsLimit,memoryBytes:h.Memory,nanoCpus:h.NanoCpus,credentialOrSocketMounts:0};
}
/** These validators describe one explicit synthetic exception, never default production qualification. */
function fixtureIsolation(record,image,owner){
 const h=record?.HostConfig,c=record?.Config;
 if(!/^agentci-smoke-[a-f0-9]{16}$/.test(owner)||!/^sha256:[a-f0-9]{64}$/.test(image?.id)||record?.Image!==image.id||!(/^[a-f0-9]{64}$/).test(record.Id)||c?.Labels?.['agentci.image-smoke.owner']!==owner||c.User!=='1001:0'||c.WorkingDir!=='/app'||c.StopSignal!=='SIGTERM'||c.Tty!==false||h?.ReadonlyRootfs!==true||!same(h.CapDrop,['ALL'])||!empty(h.CapAdd)||h.Privileged!==false||!same(h.SecurityOpt,['no-new-privileges'])||h.PidsLimit!==128||h.Memory!==512*1024*1024||h.NanoCpus!==1000000000||!['',undefined].includes(h.PidMode)||!['','private',undefined].includes(h.IpcMode)||!['',undefined].includes(h.UTSMode)||!['','private',undefined].includes(h.CgroupnsMode)||h.PublishAllPorts===true||h.PortBindings!=null&&(!h.PortBindings||typeof h.PortBindings!=='object'||Array.isArray(h.PortBindings)||Object.keys(h.PortBindings).length)||!empty(h.Binds)||!empty(h.VolumesFrom)||!empty(h.Devices)||!empty(h.DeviceRequests)||!empty(h.Dns)||!empty(h.DnsOptions)||!empty(h.DnsSearch)||!same(h.Tmpfs,{'/tmp':'rw,noexec,nosuid,nodev,size=64m'}))fail();
 if(!Array.isArray(record.Mounts)||(record.Mounts.filter(m=>m.Type==='tmpfs').length>1)||record.Mounts.some(m=>m.Type==='tmpfs'&&(m.Destination!=='/tmp'||m.RW!==true)))fail();
 return {imageId:image.id,containerId:record.Id,user:c.User,readOnly:true,capabilitiesDropped:true,noNewPrivileges:true,pids:h.PidsLimit,memoryBytes:h.Memory,nanoCpus:h.NanoCpus,tmpfs:{destination:'/tmp',bytes:64*1024*1024,noexec:true,nosuid:true,nodev:true},sharedPidOrFilesystem:false,publishedPorts:0};
}
function fixtureBaseEnvironment(image,baseEnvironment){
 const base=environment(baseEnvironment);if(!hash(image.runtimeEnvironmentSha256)||digest(JSON.stringify(baseEnvironment))!==image.runtimeEnvironmentSha256||[...base.keys()].some(key=>unsafeEnvironment(key)||key==='AGENTCI_DASHBOARD_CONFIG'||key.startsWith('NEXT_PUBLIC_')||key.startsWith('GITHUB_')||/^AGENTCI_(?:EVIDENCE|OPERATOR)_TOKEN/.test(key)))fail();return base;
}
function exactEnvironment(actual,expected){const observed=environment(actual);if(observed.size!==expected.size||[...expected].some(([key,value])=>observed.get(key)!==value))fail();return observed;}
function authenticatedContainer(record,image,owner,options,abrupt,absentCa=false){
 const common=fixtureIsolation(record,image,owner),h=record.HostConfig,c=record.Config,ca=options?.ca,expected=fixtureBaseEnvironment(image,options?.baseEnvironment);
 if(!ca||typeof ca.sourcePath!=='string'||!isAbsolute(ca.sourcePath)||resolve(ca.sourcePath)!==ca.sourcePath||!hash(ca.sha256)||!Number.isSafeInteger(ca.bytes)||ca.bytes<1||ca.bytes>8192||!hash(options.configurationSha256)||h.NetworkMode!=='none'||!same(h.ExtraHosts,[DASHBOARD_FIXTURE_HOST+':127.0.0.1'])||c.OpenStdin!==false||(c.Entrypoint!=null&&!same(c.Entrypoint,[]))||!same(c.Cmd,abrupt?ABRUPT143_COMMAND:productionCommand))fail();
 const observed=environment(c.Env),configuration=observed.get('AGENTCI_DASHBOARD_CONFIG');if(typeof configuration!=='string'||!configuration||Buffer.byteLength(configuration)>1024*1024||digest(configuration)!==options.configurationSha256)fail();
 for(const [key,value] of [['HOSTNAME',DASHBOARD_FIXTURE_HOST],['PORT','3000'],['DEBUG','next:start-server'],['AGENTCI_DASHBOARD_CONFIG',configuration]])expected.set(key,value);
 if(!absentCa)expected.set('NODE_EXTRA_CA_CERTS',DASHBOARD_FIXTURE_CA_PATH);
 exactEnvironment(c.Env,expected);
 const binds=record.Mounts.filter(m=>m.Type!=='tmpfs');
 if(absentCa){if(binds.length||!empty(h.Mounts))fail();}
 else{
  if(binds.length!==1||binds[0].Type!=='bind'||binds[0].Source!==ca.sourcePath||binds[0].Destination!==DASHBOARD_FIXTURE_CA_PATH||binds[0].RW!==false||binds[0].Propagation!=='rprivate')fail();
  if(!Array.isArray(h.Mounts)||h.Mounts.length!==1||h.Mounts[0].Type!=='bind'||h.Mounts[0].Source!==ca.sourcePath||h.Mounts[0].Target!==DASHBOARD_FIXTURE_CA_PATH||h.Mounts[0].ReadOnly!==true||h.Mounts[0].BindOptions?.Propagation&&h.Mounts[0].BindOptions.Propagation!=='rprivate')fail();
 }
 return {...common,configuration:abrupt?'unsupported-authenticated-abrupt143-command':'synthetic-authenticated-trust-fixture',productionQualification:false,network:'none',loopbackHostMapping:true,baseEnvironmentSha256:image.runtimeEnvironmentSha256,configurationSha256:options.configurationSha256,caPresent:!absentCa,publicCa:absentCa?null:{destination:DASHBOARD_FIXTURE_CA_PATH,sha256:ca.sha256,bytes:ca.bytes,readOnly:true},...(abrupt?{negativeCommandSha256:digest(JSON.stringify(ABRUPT143_COMMAND))}:{})};
}
export function validateDashboardAuthenticatedContainer(record,image,owner,options){return authenticatedContainer(record,image,owner,options,false);}
export function validateDashboardAuthenticatedAbruptContainer(record,image,owner,options){return authenticatedContainer(record,image,owner,options,true);}
export function validateDashboardAuthenticatedTlsFailureContainer(record,image,owner,options){
 if(!['absent-ca','wrong-ca','wrong-hostname','expired-certificate'].includes(options?.trustCase))fail();
 return {...authenticatedContainer(record,image,owner,options,false,options.trustCase==='absent-ca'),configuration:'synthetic-authenticated-tls-failure-control',trustCase:options.trustCase};
}
export function validateDashboardAuthenticatedHelper(record,image,owner,options){
 const common=fixtureIsolation(record,image,owner);fixtureBaseEnvironment(image,options?.baseEnvironment);
 if(!(/^[a-f0-9]{64}$/).test(options?.appId)||record.Id===options.appId||typeof options.helperSource!=='string'||!options.helperSource||Buffer.byteLength(options.helperSource)>65536||!hash(options.helperSourceSha256)||digest(options.helperSource)!==options.helperSourceSha256||record.Config.OpenStdin!==true||!same(record.Config.Entrypoint,['node'])||!same(record.Config.Cmd,['--input-type=module','-e',options.helperSource])||record.HostConfig.NetworkMode!=='container:'+options.appId||!empty(record.HostConfig.ExtraHosts)||!empty(record.HostConfig.Mounts)||record.Mounts.some(m=>m.Type!=='tmpfs'))fail();
 exactEnvironment(record.Config.Env,fixtureBaseEnvironment(image,options.baseEnvironment));
 return {...common,configuration:'synthetic-authenticated-helper',productionQualification:false,network:'owned-application-namespace-only',applicationContainerId:options.appId,baseEnvironmentSha256:image.runtimeEnvironmentSha256,helperSourceSha256:options.helperSourceSha256,globalCaOrCredentialMounts:0};
}
export function dashboardNativeSummary({source,arch,image,runtime,anonymous,shutdown,publicDrain,authenticated,licenseInventory,rpmPackages,scan,cleanup}){
 const activePublicQualification=validateNativePublicDrain(publicDrain,{...source,imageId:image.id});
 const authenticatedCharacterization=validateNativeAuthenticatedEvidence(authenticated,{...source,imageId:image.id});
 for(const record of shutdown)validateDashboardShutdown(record,{...source,imageId:image.id});
 validateDashboardRuntime(runtime,source);for(const mode of ['unconfigured','configured','malformed'])validateDashboardAnonymous(anonymous[mode],mode);
 if(!['amd64','arm64'].includes(arch)||image.arch!==arch||source.sourceCommit!==image.labels['org.opencontainers.image.revision']||!['unconfigured','configured','malformed'].every(m=>anonymous[m])||new Set(shutdown.map(s=>s.mode)).size!==3||shutdown.length!==3||!rpmPackages.length||!Array.isArray(licenseInventory?.packages)||!Array.isArray(licenseInventory.issues)||scan.result!=='passed-policy'||cleanup.result!=='passed'||cleanup.ownedContainers!==0||cleanup.ownedNetworks!==0||cleanup.ownedVolumes!==0||cleanup.privateFilesRemoved!==true)fail();
 const schema=licenseInventory.schemaVersion;if(schema!==undefined&&![1,2,3].includes(schema))fail();
 for(const field of['licensingReviewItems','associatedNoticeCount','noticeAssociations','licensingReview']){const present=Object.hasOwn(licenseInventory,field);if(schema===3&&!present||present&&(licenseInventory[field]===null||licenseInventory[field]===undefined))fail();}
 const licensingReviewItems=licenseInventory.licensingReviewItems??[],associatedNoticeCount=licenseInventory.associatedNoticeCount??0,noticeAssociations=licenseInventory.noticeAssociations??[];
 if(!Array.isArray(licensingReviewItems)||!Array.isArray(noticeAssociations)||!Number.isSafeInteger(associatedNoticeCount)||associatedNoticeCount<0||Object.hasOwn(licenseInventory,'licensingReview')&&(typeof licenseInventory.licensingReview!=='string'||!licenseInventory.licensingReview.trim()))fail();
 let observedAssociatedNotices=0;for(const association of noticeAssociations){if(!Array.isArray(association?.notices))fail();observedAssociatedNotices+=association.notices.length;}if(observedAssociatedNotices!==associatedNoticeCount)fail();
 return {schemaVersion:1,result:'native-runtime-and-scan-qualified',...source,arch,image,runtime,anonymous,shutdown,publicDrain,rpmPackages,licenseInventory:{status:licenseInventory.status,packages:licenseInventory.packageCount,notices:licenseInventory.noticeCount,directNoticeCount:licenseInventory.noticeCount,associatedNoticeCount,noticeAssociationCount:noticeAssociations.length,issues:licenseInventory.issues,metadataIssueCount:licenseInventory.issues.length,licensingReviewItems,licensingReviewItemCount:licensingReviewItems.length,licensingReview:licenseInventory.licensingReview??'Package metadata inventory only; legal clearance not claimed',legalClearance:'not-claimed',noticeCompleteness:licenseInventory.issues.length||licensingReviewItems.length?'pending-review-items':'source-notices-inventoried'},scan,cleanup,shutdownQualification:{result:'source-bound-idle-sigterm-qualified',activePublicRequest:activePublicQualification,authenticatedCharacterization,authenticatedApiDrain:'unverified'},publication:'not-performed',releaseAcceptance:'pending',liveOIDCAcceptance:'unverified'};
}
