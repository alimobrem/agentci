import {runNativePublicDrain,validateNativePublicDrain} from './lib/dashboard-native-drain.mjs';
import {scannerRunArgs,SCANNER_SCRATCH_BYTES} from './lib/dashboard-scan-controls.mjs';
import {dashboardScanFailure} from './lib/dashboard-scan-failure.mjs';
import {dashboardShutdownMarkers} from './lib/dashboard-shutdown.mjs';
import {spawnSync,execFileSync} from 'node:child_process';import {readFile,writeFile,mkdir,mkdtemp,chmod,readdir,lstat,statfs} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {randomBytes,createHash} from 'node:crypto';
import {registerImageSmokeState,cleanupImageSmokeState} from './lib/image-smoke-state.mjs';import {SMOKE_OWNER_LABEL} from './lib/smoke-resources.mjs';
import {retainDashboardShutdown,validateDashboardImage,validateDashboardRuntime,validateDashboardAnonymous,validateDashboardContainer,dashboardNativeSummary} from './lib/dashboard-native-evidence.mjs';import {dashboardShutdownSourceProbe,dashboardInventoryProbe,dashboardAnonymousProbe} from './lib/dashboard-native-probes.mjs';
const output='.agentci/artifacts/dashboard-native-staging',hash=b=>createHash('sha256').update(b).digest('hex'),arch=process.arch==='x64'?'amd64':process.arch;
const git=args=>execFileSync('git',args,{encoding:'utf8',env:{PATH:process.env.PATH}}).trim();
async function sourceIdentity(){if(process.platform!=='linux'||!['amd64','arm64'].includes(arch))throw Error('Native Linux host required');return {sourceCommit:git(['rev-parse','HEAD']),sourceTree:git(['rev-parse','HEAD^{tree}']),candidateCommit:process.env.AGENTCI_DASHBOARD_HEAD||git(['rev-parse','HEAD']),runId:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT,arch,rootVersion:JSON.parse(await readFile('package.json')).version,dashboardVersion:JSON.parse(await readFile('apps/dashboard/package.json')).version,rootLockSha256:hash(await readFile('npm-shrinkwrap.json')),dashboardLockSha256:hash(await readFile('apps/dashboard/package-lock.json'))};}
const save=async(name,value)=>{const bytes=JSON.stringify(value,null,2)+'\n';if(Buffer.byteLength(bytes)>16*1024*1024)throw Error('Evidence file bound exceeded');await mkdir(output,{recursive:true});await writeFile(join(output,name),bytes);};
function engine(args,{timeout=60000,includeStderr=false,separateStreams=false,captureScanFailure=false}={}){const result=spawnSync('docker',args,{encoding:'utf8',env:{PATH:process.env.PATH},timeout,maxBuffer:24*1024*1024,stdio:['ignore','pipe','pipe']});if(result.error||result.status!==0)throw Object.assign(Error('Dashboard owned engine operation failed; raw diagnostics withheld'),{...(captureScanFailure?{scanExecutionFailure:dashboardScanFailure(result)}:{}),nativeFailure:{operation:['info','image','create','start','exec','logs','cp','stop','run'].includes(args[0])?args[0]:'unclassified',exitCode:Number.isSafeInteger(result.status)&&result.status>=0&&result.status<=255?result.status:null,timeout:result.error?.code==='ETIMEDOUT'}});return separateStreams?{stdout:result.stdout,stderr:result.stderr}:(result.stdout+(includeStderr?'\n'+result.stderr:'')).trim();}
if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REPOSITORY!=='alimobrem/agentci')throw Error('Owned repository CI required');
if(process.argv[2]==='source'){
 const source=await sourceIdentity();if(process.argv[3]!==arch)throw Error('Requested native architecture differs from host');await save('source.json',source);
 await writeFile(process.env.GITHUB_OUTPUT,Object.entries({source:source.sourceCommit,tree:source.sourceTree,arch,root_lock:source.rootLockSha256,dashboard_lock:source.dashboardLockSha256,dashboard_version:source.dashboardVersion}).map(([k,v])=>k+'='+v).join('\n')+'\n',{flag:'a'});
}else if(process.argv[2]==='qualify'){
 const imageRef=process.argv[3],source=await sourceIdentity();if(!/^agentci-dashboard:ci-[1-9][0-9]*-[1-9][0-9]*-(amd64|arm64)$/.test(imageRef)||imageRef!==`agentci-dashboard:ci-${source.runId}-${source.attempt}-${arch}`)throw Error('Exact owned image tag required');
 const daemon=JSON.parse(engine(['info','--format','{"os":{{json .OSType}},"arch":{{json .Architecture}}}']));if(daemon.os!=='linux'||({x86_64:'amd64',aarch64:'arm64',amd64:'amd64',arm64:'arm64'})[daemon.arch]!==arch)throw Error('Native daemon/host architecture mismatch');
 const rawImage=JSON.parse(engine(['image','inspect',imageRef]))[0],image=validateDashboardImage(rawImage,source);await save('image.json',image);
 const owner='agentci-smoke-'+randomBytes(8).toString('hex'),directory=await mkdtemp(join(process.env.RUNNER_TEMP??tmpdir(),'agentci-image-smoke-')),state=await registerImageSmokeState(directory,owner),anonymous={},shutdown=[];let publicDrain,runtime,rpmPackages,licenseInventory,scan,stage='prepare',receipt,summary,cancelled=false;
 const cancel=()=>{cancelled=true;};process.on('SIGINT',cancel);process.on('SIGTERM',cancel);const docker=args=>{if(cancelled)throw Error('Native qualification cancelled');return engine(args);};
 const probe=(name,code)=>JSON.parse(docker(['exec',name,'node','--input-type=module','-e',code]));
 try{
  for(const mode of ['unconfigured','configured','malformed']){
   stage='runtime-'+mode;const name=owner+'-'+mode,args=['create','--name',name,'--label',SMOKE_OWNER_LABEL+'='+owner,'--label','agentci.purpose=image-smoke','--env','DEBUG=next:start-server','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','128','--memory','512m','--cpus','1','--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=64m'];
   let sentinel;if(mode!=='unconfigured'){sentinel='runtime-canary-'+randomBytes(32).toString('hex');const config=mode==='configured'?JSON.stringify({issuer:'https://issuer.fixture.invalid',clientId:'native-fixture',clientSecret:sentinel,origin:'https://dashboard.fixture.invalid',grants:{},reviews:{}}):'{invalid:'+sentinel;const file=join(directory,mode+'.env');await writeFile(file,'AGENTCI_DASHBOARD_CONFIG='+config+'\n',{mode:0o600});args.push('--env-file',file);}
   const id=docker([...args,image.id]);if(!/^[a-f0-9]{64}$/.test(id))throw Error('Created container identity missing');docker(['start',name]);
   let ready=false;for(let i=0;i<80;i++){if(cancelled)throw Error('Cancelled');try{if(docker(['exec',name,'node','-e',"fetch('http://127.0.0.1:3000/livez',{signal:AbortSignal.timeout(1500)}).then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"])===''){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}if(!ready)throw Error('Native process liveness unavailable');
   anonymous[mode]=validateDashboardAnonymous(probe(name,dashboardAnonymousProbe),mode);anonymous[mode].container=validateDashboardContainer(JSON.parse(docker(['inspect',name]))[0],image,owner);
   const logs=engine(['logs',name],{includeStderr:true});if(sentinel&&logs.includes(sentinel))throw Error('Runtime fixture config appeared in process logs');anonymous[mode].processLogSha256=hash(Buffer.from(logs));
   if(mode==='configured'){
    stage='final-image-inventory';runtime=validateDashboardRuntime(probe(name,dashboardInventoryProbe),source);await save('runtime-files.json',runtime);
    const rawRpm=docker(['exec',name,'rpm','-qa','--qf','%{NAME}|%{VERSION}|%{RELEASE}|%{ARCH}|%{LICENSE}\n']);rpmPackages=rawRpm.split('\n').filter(Boolean).map(line=>{const [name,version,release,arch,license,...extra]=line.split('|');if(extra.length||![name,version,release,arch,license].every(Boolean))throw Error('RPM inventory incomplete');return {name,version,release,arch,declaredLicense:license};});await save('rpm-inventory.json',rpmPackages);
    docker(['cp',name+':/licenses/dashboard',join(output,'licenses')]);licenseInventory=JSON.parse(await readFile(join(output,'licenses/inventory.json')));if(licenseInventory.rootPackage.version!==source.rootVersion||licenseInventory.dashboardPackage.version!==source.dashboardVersion)throw Error('Final license inventory identity mismatch');
   }
   stage='shutdown-'+mode;const shutdownRuntime=probe(name,dashboardShutdownSourceProbe),began=performance.now();let stopFailure;
   try{engine(['stop','--signal','SIGTERM','--timeout','20',name],{timeout:25000});}catch(error){stopFailure=error;}
   const elapsedMs=Math.ceil(performance.now()-began),stopped=JSON.parse(engine(['inspect','--format','{"exitCode":{{json .State.ExitCode}},"oomKilled":{{json .State.OOMKilled}},"running":{{json .State.Running}}}',name])),channels=engine(['logs',name],{separateStreams:true}),shutdownLogs=dashboardShutdownMarkers(channels,sentinel);
   await save('anonymous.json',anonymous);await retainDashboardShutdown(shutdown,{mode,...stopped,source:{...source,imageId:image.id},runtime:shutdownRuntime,signal:'SIGTERM',stopSucceeded:!stopFailure,timeout:!!stopFailure?.nativeFailure?.timeout,forced:stopped.exitCode===137,elapsedMs,requestDrain:'idle-only',logs:shutdownLogs},save,{...source,imageId:image.id});
  }
  await save('anonymous.json',anonymous);await save('shutdown.json',shutdown);
  // All cases use the actual image/plain production command. Only the explicitly unsupported negative control opts out of Next's signal handler.
  const drainControls={};
  for(const mode of ['forced','abrupt143','drain']){
   stage='active-public-request-'+mode;const name=owner+'-'+mode,sentinel='runtime-canary-'+randomBytes(32).toString('hex'),file=join(directory,mode+'.env');
   await writeFile(file,'AGENTCI_DASHBOARD_CONFIG='+JSON.stringify({issuer:'https://127.0.0.1:4443',clientId:'native-public-error-fixture',clientSecret:sentinel,origin:'https://dashboard.fixture.invalid',grants:{},reviews:{}})+'\n',{mode:0o600});
   const args=['create','--name',name,'--label',SMOKE_OWNER_LABEL+'='+owner,'--label','agentci.purpose=image-smoke','--env','DEBUG=next:start-server','--env-file',file,'--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','128','--memory','512m','--cpus','1','--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=64m'];
   if(mode==='abrupt143')args.push('--env','NEXT_MANUAL_SIG_HANDLE=1');
   const id=docker([...args,image.id]);if(!/^[a-f0-9]{64}$/.test(id))throw Error('Created drain container identity missing');docker(['start',name]);
   let ready=false;for(let i=0;i<80;i++){try{if(docker(['exec',name,'node','-e',"fetch('http://127.0.0.1:3000/livez',{signal:AbortSignal.timeout(1500)}).then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"])===''){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}if(!ready)throw Error('Native active-request liveness unavailable');
   const config=JSON.parse(docker(['inspect',name]))[0];let container;
   if(mode==='abrupt143'){
    let rejected=false;try{validateDashboardContainer(config,image,owner);}catch{rejected=true;}if(!rejected||config.Config.Env.filter(v=>v.startsWith('NEXT_MANUAL_SIG_HANDLE=')).join()!=='NEXT_MANUAL_SIG_HANDLE=1')throw Error('Unsupported control configuration not isolated');
    container={...validateDashboardContainer({...config,Config:{...config.Config,Env:config.Config.Env.filter(v=>!v.startsWith('NEXT_MANUAL_SIG_HANDLE='))}},image,owner),configuration:'unsupported-manual-signal-configuration',productionValidatorAccepted:false};
   }else container=validateDashboardContainer(config,image,owner);
   const observed=await runNativePublicDrain({name,engine,probeRuntime:()=>probe(name,dashboardShutdownSourceProbe),source:{...source,imageId:image.id},sentinel});observed.container=container;
   if(mode==='drain'){publicDrain={...observed,forcedControl:drainControls.forced,abrupt143Control:drainControls.abrupt143};await save('public-drain.json',publicDrain);validateNativePublicDrain(publicDrain,{...source,imageId:image.id});}
   else{drainControls[mode]=observed;await save('public-drain.json',{result:'incomplete-or-unverified',...drainControls});}
  }
  stage='pinned-image-scan';
  const archive=join(directory,'dashboard.tar'),cache=join(directory,'trivy-cache');await mkdir(cache,{mode:0o700});docker(['image','save','--output',archive,image.id]);await chmod(archive,0o644);
  const cacheFs=await statfs(cache);await save('scan-storage.json',{source,imageId:image.id,tmp:{pathClass:'tmp',declaredCapacityBytes:SCANNER_SCRATCH_BYTES,observedAvailableBytes:null,observation:'explicit tmpfs bound; free/used not retained'},cache:{pathClass:'cache',capacityBytes:cacheFs.blocks*cacheFs.bsize,availableBytes:cacheFs.bavail*cacheFs.bsize,usedBytes:(cacheFs.blocks-cacheFs.bfree)*cacheFs.bsize,observation:'statfs of the exact owned bind source before scan'},rawPaths:'withheld'});
  const rawScan=engine(scannerRunArgs({owner,uid:process.getuid(),gid:process.getgid(),archive,cache}),{timeout:300000,captureScanFailure:true});
  const report=JSON.parse(rawScan);if(report.Metadata?.ImageID!==image.id||report.Metadata?.ImageConfig?.architecture!==arch||report.Metadata?.ImageConfig?.os!=='linux')throw Error('Scan image identity mismatch');await writeFile(join(output,'scan.json'),rawScan+'\n');
  const policy=spawnSync(process.execPath,['scripts/check-scan.mjs',join(output,'scan.json')],{env:{PATH:process.env.PATH},encoding:'utf8',timeout:30000});scan={result:policy.status===0?'passed-policy':'blocked-policy',sha256:hash(Buffer.from(rawScan+'\n')),imageId:image.id,scanner:'Trivy0.75.0 pinned digest',policy:'Existing fixable HIGH/CRITICAL policy unchanged; full applicability review remains required.'};await save('scan-policy.json',scan);if(policy.error||policy.status!==0)throw Error('Image scan policy blocked');
 }catch(error){process.exitCode=1;if(stage==='pinned-image-scan'&&error.scanExecutionFailure)await save('scan-execution-failure.json',{...error.scanExecutionFailure,source,imageId:image.id,scanner:'aquasec/trivy:0.75.0@sha256:af6acf9a6b85dfe389a1941505c0ce9efef52a4719635e1a962f022a3d855daa'});await save('failure.json',{schemaVersion:1,...source,stage,result:'failed-or-unverified',...(error.nativeFailure?{engine:error.nativeFailure}:{}),rawDiagnostics:'withheld'});}
 finally{
  try{receipt=await cleanupImageSmokeState(state);}catch{receipt={schemaVersion:1,result:'recovery-required-or-unverified',owner,privateState:'retain for owned recovery'};process.exitCode=1;}await save('cleanup.json',receipt);
 }
 await new Promise(r=>setImmediate(r));if(cancelled)process.exitCode=1;process.off('SIGINT',cancel);process.off('SIGTERM',cancel);
 if(!process.exitCode){summary=dashboardNativeSummary({source,arch,image,runtime,anonymous,shutdown,publicDrain,licenseInventory,rpmPackages,scan,cleanup:receipt});await save('result.json',summary);}

}else throw Error('Use source ARCH or qualify OWNED_IMAGE_TAG');
