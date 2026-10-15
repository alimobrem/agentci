import {validateDashboardShutdown} from './dashboard-shutdown.mjs';
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const fail=()=>{throw Error('Dashboard native evidence does not match the exact source/runtime contract');};
export async function retainDashboardShutdown(receipts, record, save, expected) {
 const captured=structuredClone(record),identity=structuredClone(expected);receipts.push(captured);
 await save('shutdown.json',receipts);
 return validateDashboardShutdown(captured,identity);
}
export function validateDashboardImage(image,expected){
 if((image?.Config?.Entrypoint!=null&&JSON.stringify(image.Config.Entrypoint)!=='[]')||image?.Config?.StopSignal!=='SIGTERM'||image?.Os!=='linux'||image.Architecture!==expected.arch||!/^sha256:[a-f0-9]{64}$/.test(image.Id)||!['1001','1001:0'].includes(image.Config?.User)||JSON.stringify(image.Config?.Cmd)!==JSON.stringify(['node','apps/dashboard/server.js']))fail();
 const labels=image.Config.Labels??{};
 for(const [key,value] of [['org.opencontainers.image.revision',expected.sourceCommit],['org.agentci.dashboard.lock-sha256',expected.dashboardLockSha256],['org.agentci.root.lock-sha256',expected.rootLockSha256],['org.agentci.dashboard.version',expected.dashboardVersion]])if(labels[key]!==value)fail();
 const env=(image.Config.Env??[]).map(v=>v.split('=')[0]);if(env.some(k=>/^(?:AGENTCI_DASHBOARD_CONFIG|NEXT_PUBLIC_|NODE_OPTIONS$|NODE_PATH$|NEXT_MANUAL_SIG_HANDLE$|GITHUB_|AGENTCI_(?:EVIDENCE|OPERATOR)_TOKEN)/.test(k)))fail();
 return {id:image.Id,os:image.Os,arch:image.Architecture,user:image.Config.User,labels:Object.fromEntries(Object.entries(labels).filter(([k])=>k.startsWith('org.agentci.')||k==='org.opencontainers.image.revision')),runtimeEnvironmentNames:env};
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
 if(record?.Image!==image.id||c?.Labels?.['agentci.image-smoke.owner']!==owner||JSON.stringify(c?.Cmd)!==JSON.stringify(['node','apps/dashboard/server.js'])||(c?.Entrypoint!=null&&JSON.stringify(c.Entrypoint)!=='[]')||c?.Env?.some(v=>/^(?:NEXT_MANUAL_SIG_HANDLE|NODE_OPTIONS|NODE_PATH)=/.test(v))||!['1001','1001:0'].includes(c.User)||h?.NetworkMode!=='none'||h.ReadonlyRootfs!==true||!h.CapDrop?.includes('ALL')||(h.CapAdd!=null&&(!Array.isArray(h.CapAdd)||h.CapAdd.length!==0))||h.Privileged!==false||!h.SecurityOpt?.includes('no-new-privileges')||h.PidsLimit!==128||h.Memory!==512*1024*1024||h.NanoCpus!==1000000000||(record.Mounts??[]).some(m=>m.Type!=='tmpfs'||m.Destination!=='/tmp'))fail();
 return {imageId:record.Image,user:c.User,network:h.NetworkMode,readOnly:h.ReadonlyRootfs,capabilitiesDropped:true,noNewPrivileges:true,pids:h.PidsLimit,memoryBytes:h.Memory,nanoCpus:h.NanoCpus,credentialOrSocketMounts:0};
}
export function dashboardNativeSummary({source,arch,image,runtime,anonymous,shutdown,licenseInventory,rpmPackages,scan,cleanup}){
 for(const record of shutdown)validateDashboardShutdown(record,{...source,imageId:image.id});
 validateDashboardRuntime(runtime,source);for(const mode of ['unconfigured','configured','malformed'])validateDashboardAnonymous(anonymous[mode],mode);
 if(!['amd64','arm64'].includes(arch)||image.arch!==arch||source.sourceCommit!==image.labels['org.opencontainers.image.revision']||!['unconfigured','configured','malformed'].every(m=>anonymous[m])||new Set(shutdown.map(s=>s.mode)).size!==3||shutdown.length!==3||!rpmPackages.length||!Array.isArray(licenseInventory?.packages)||!Array.isArray(licenseInventory.issues)||scan.result!=='passed-policy'||cleanup.result!=='passed'||cleanup.ownedContainers!==0||cleanup.privateFilesRemoved!==true)fail();
 return {schemaVersion:1,result:'native-runtime-and-scan-qualified',...source,arch,image,runtime,anonymous,shutdown,rpmPackages,licenseInventory:{status:licenseInventory.status,packages:licenseInventory.packageCount,notices:licenseInventory.noticeCount,issues:licenseInventory.issues,legalClearance:'not-claimed',noticeCompleteness:licenseInventory.issues.length?'pending-review-items':'source-notices-inventoried'},scan,cleanup,shutdownQualification:{result:'source-bound-idle-sigterm-qualified',activeRequestDrain:'not-exercised'},publication:'not-performed',releaseAcceptance:'pending',liveOIDCAcceptance:'unverified'};
}
