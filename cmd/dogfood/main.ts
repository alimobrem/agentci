import {trustedGitBlobSeed} from '../../packages/github/git-object-seed.ts';
import {hostedReviewCandidates} from '../../packages/github/hosted-selection.ts';
import {containerEngine} from '../../packages/evals/runner.ts';
import {readFile,writeFile,mkdir,open,rm,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';import {randomUUID,createHash} from 'node:crypto';import {execFileSync,spawnSync} from 'node:child_process';
import {Pool} from 'pg';import {Client,Connection} from '@temporalio/client';import {NativeConnection,Worker} from '@temporalio/worker';
import {installationClient,currentPullRequest,publishCheck,createRemoteSnapshotReader} from '../../packages/github/client.ts';import {verifyExport} from '../../packages/github/dogfood.ts';
import {verifyHostedReport,verifyHostedComparison,MAX_HOSTED_EXPORT_BYTES,type HostedProducer,type HostedReport,type HostedReview} from '../../packages/github/hosted-evidence.ts';
import {publishHostedEvalCheck,publishHostedEvalUnavailable} from '../../packages/github/eval-check.ts';
import type {ReviewJob} from '../../packages/github/webhook.ts';import {Store} from '../../packages/storage/postgres.ts';import {EvalStore} from '../../packages/storage/evals.ts';
import {createHostedReviewActivities} from '../../apps/worker/hosted-activities.ts';import {controllerEvalPolicy} from '../../packages/evals/orchestration.ts';import {frameExport} from '../../packages/evals/export.ts';import {VERSION} from '../../packages/version.ts';
const repository=process.env.AGENTCI_REPOSITORY;
if(repository!=='alimobrem/agentci'||process.env.GITHUB_REPOSITORY!==repository)throw new Error('Dogfood runner is restricted to alimobrem/agentci');
const appId=Number(process.env.GITHUB_APP_ID),installationId=Number(process.env.GITHUB_INSTALLATION_ID);
if(!Number.isSafeInteger(appId)||appId<1||!Number.isSafeInteger(installationId)||installationId<1)throw new Error('Invalid App identity');
const producer:HostedProducer={version:VERSION,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),repository,installationId,runId:process.env.GITHUB_RUN_ID??'',runAttempt:process.env.GITHUB_RUN_ATTEMPT??'',runnerImage:process.env.AGENTCI_EVAL_RUNNER_IMAGE??'',evaluatorImage:process.env.AGENTCI_HOSTED_EVALUATOR_IMAGE??''};
const output='.agentci/artifacts/dogfood',organizationId='00000000-0000-4000-8000-000000000001';
const github=installationClient(appId,installationId,await readFile(process.env.GITHUB_PRIVATE_KEY_FILE!,'utf8'));
const [owner,repo]=repository.split('/') as [string,string];
const engine=containerEngine();
const container=(args:string[])=>{try{return execFileSync(engine,args,{encoding:'utf8',timeout:60000,stdio:['pipe','pipe','pipe']}).trim();}catch{throw new Error('Hosted evaluator container operation unavailable');}};
if(process.argv[2]==='publish'){
 const artifact=process.env.AGENTCI_ARTIFACT_URL??'';
 const reportPath=`${output}/reviews.json`;if((await stat(reportPath)).size>16*1024*1024)throw new Error('Hosted report exceeds retention budget');
 const report=verifyHostedReport(JSON.parse(await readFile(reportPath,'utf8')),producer,artifact);
 // Verify the complete retained batch before any remote Check write.
 const verified=[];for(const review of report.reviews)verified.push({review,comparison:review.comparison?await verifyHostedComparison(`${output}/${review.comparison.file}`,review,organizationId,producer.runnerImage):undefined});
 for(const {review,comparison} of verified){
  if(review.status==='superseded'||!await currentPullRequest(github,review.job))continue;
  if(review.record)await publishCheck(github,appId,review.job,review.record.analysis,artifact);
  if(review.status==='completed'){
   if(!comparison?.evidence)throw new Error('Missing verified completed hosted evidence');
   await publishHostedEvalCheck(github,appId,review.job,review.attemptId,comparison.evidence,artifact);
  }else await publishHostedEvalUnavailable(github,appId,review.job,review.attemptId,artifact,comparison?.header);
 }
 console.log(`Processed ${report.reviews.length} retained hosted review candidates; stale heads are skipped.`);
}else if(process.argv[2]==='prepare'){
 const snapshots=createRemoteSnapshotReader(github,{seed:trustedGitBlobSeed(process.cwd(),repository)});
 const policy=controllerEvalPolicy(),pool=new Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,query_timeout:10000});
 let connection:Connection|undefined,native:NativeConnection|undefined,worker:Worker|undefined,running:Promise<void>|undefined,evaluator:string|undefined;
 const evaluatorEnv='.agentci/local/hosted-evaluator.env',report:HostedReport={schemaVersion:'v1alpha1',producer,reviews:[],failed:false};
 try{
  await mkdir(output,{recursive:true});await mkdir('.agentci/local',{recursive:true,mode:0o700});
  for(const file of ['001_m1.sql','002_m2.sql','002_m2_eval_role.sql'])await pool.query(await readFile(`deploy/migrations/${file}`,'utf8'));
  const store=new Store(pool,organizationId,repository),evals=new EvalStore(pool,organizationId,repository);await store.ready();await evals.ready();
  const login='hosted_eval_'+randomUUID().replaceAll('-','').slice(0,16),password=randomUUID()+randomUUID();
  await pool.query(`CREATE ROLE ${login} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS IN ROLE agentci_eval_executor`);
  const evaluatorUrl=new URL(process.env.DATABASE_URL!);evaluatorUrl.username=login;evaluatorUrl.password=password;
  const evaluatorImage=producer.evaluatorImage;controllerEvalPolicy({AGENTCI_EVAL_RUNNER_IMAGE:evaluatorImage});
  const env={AGENTCI_CONTAINER_ENGINE:engine,CONTAINER_HOST:'unix:///run/agentci/engine.sock',DOCKER_HOST:'unix:///run/agentci/engine.sock',AGENTCI_REPOSITORY:repository,AGENTCI_ORGANIZATION_ID:organizationId,AGENTCI_EVAL_DATABASE_URL:evaluatorUrl.href,TEMPORAL_ADDRESS:process.env.TEMPORAL_ADDRESS!,AGENTCI_EVAL_RUNNER_IMAGE:policy.image,...(policy.enginesImage?{AGENTCI_EVAL_ENGINES_IMAGE:policy.enginesImage}:{})};
  if(Object.values(env).some(v=>!v||/[\r\n\0]/.test(v)))throw new Error('Invalid hosted evaluator environment');
  await writeFile(evaluatorEnv,Object.entries(env).map(([k,v])=>`${k}=${v}`).join('\n')+'\n',{mode:0o600});
  const socket=process.env.AGENTCI_CONTAINER_SOCKET_PATH??(engine==='docker'?'/var/run/docker.sock':`/run/user/${process.getuid!()}/podman/podman.sock`);
  if(!/^\/[A-Za-z0-9_./-]+$/.test(socket))throw new Error('Invalid operator evaluator socket path');
  const serviceNamespace=engine==='podman'?['--userns','keep-id:uid=1001,gid=0','--security-opt','label=disable']:[];
  const clientRuntime=engine==='podman'?['--mount','type=tmpfs,destination=/opt/agentci/podman-runtime,tmpfs-size=16m,tmpfs-mode=1777,tmpcopyup=false']:[];
  const socketGid=container(['run','--rm','--network','none','--read-only',...serviceNamespace,...clientRuntime,'-v',`${socket}:/run/agentci/engine.sock`,'--entrypoint','node',evaluatorImage,'-e',"const s=require('node:fs').statSync('/run/agentci/engine.sock');if(!s.isSocket())process.exit(1);console.log(s.gid)"]);
  if(!/^\d+$/.test(socketGid))throw new Error('Invalid evaluator socket group');
  evaluator=`agentci-hosted-evaluator-${randomUUID()}`;
  container(['run','-d','--name',evaluator,'--network','host','--read-only','--tmpfs','/tmp:rw,nosuid,nodev,size=128m','--cap-drop','ALL','--security-opt','no-new-privileges','--group-add',socketGid,'--env-file',evaluatorEnv,...serviceNamespace,...clientRuntime,'-v',`${socket}:/run/agentci/engine.sock`,evaluatorImage]);
  let ready=false;for(let i=0;i<60;i++){const captured=spawnSync(engine,['logs',evaluator],{encoding:'utf8',timeout:10000,maxBuffer:1024*1024}),logs=captured.stdout+captured.stderr;if(captured.status===0&&logs.includes("state: 'RUNNING'")){ready=true;break;}if(container(['inspect','--format','{{.State.Running}}',evaluator])!=='true')break;await new Promise(r=>setTimeout(r,1000));}
  if(!ready)throw new Error('Separate hosted evaluator did not become ready');
  connection=await Connection.connect({address:process.env.TEMPORAL_ADDRESS});native=await NativeConnection.connect({address:process.env.TEMPORAL_ADDRESS});const client=new Client({connection}),queue=`agentci-hosted-${randomUUID()}`;
  worker=await Worker.create({connection:native,taskQueue:queue,workflowsPath:fileURLToPath(new URL('../../apps/worker/workflows.js',import.meta.url)),activities:createHostedReviewActivities(github,store,evals,{repository,installationId},policy,snapshots)});running=worker.run();
  const prs=await hostedReviewCandidates(github,repository,process.env.GITHUB_EVENT_NAME,process.env.AGENTCI_TRIGGER_PULL_REQUEST);
  for(const pr of prs){
   const {data}=await github.pulls.get({owner,repo,pull_number:pr.number});if(data.state!=='open')continue;
   const job:ReviewJob={repository,installationId,pullRequest:data.number,baseSha:data.base.sha,headSha:data.head.sha},attemptId=randomUUID(),review:HostedReview={job,attemptId,status:'unavailable'};report.reviews.push(review);
   try{
    const handle=await client.workflow.start('reviewPullRequestWithEvals',{args:[job,attemptId,{evalTaskQueue:'agentci-eval-v1',timeoutMs:900000}],workflowId:attemptId,taskQueue:queue,workflowExecutionTimeout:'20 minutes'});
    review.status=await handle.result()==='superseded'?'superseded':'completed';
    const history=JSON.stringify(await handle.fetchHistory());if(Buffer.byteLength(history)>16*1024*1024)throw new Error('Hosted history exceeds retention budget');await writeFile(`${output}/pr-${pr.number}-${attemptId}-history.json`,history+'\n');
   }catch{report.failed=true;review.status='unavailable';const interrupted=await evals.recoveryPlan(attemptId);if(interrupted)await evals.cancel(interrupted.id);console.error(`PR ${pr.number}: hosted evaluation unavailable; retained failure will remain action_required.`);}
   const plan=await evals.recoveryPlan(attemptId);
   if(plan){
    review.record=await store.evidence(plan.reviewId);if(!review.record)throw new Error('Missing retained semantic review');verifyExport(job,review.record,repository,installationId);
    const file=`comparison-${plan.id}.ndjson`,handle=await open(`${output}/${file}`,'w',0o600),hash=createHash('sha256');let bytes=0;
    try{for await(const frame of frameExport(evals.exportComparison(plan.id))){const line=JSON.stringify(frame)+'\n';bytes+=Buffer.byteLength(line);if(bytes>MAX_HOSTED_EXPORT_BYTES)throw new Error('Hosted export exceeds retention budget');hash.update(line);await handle.write(line);}}finally{await handle.close();}
    review.comparison={id:plan.id,reviewId:plan.reviewId,file,sha256:'sha256:'+hash.digest('hex'),bytes};
    await verifyHostedComparison(`${output}/${file}`,review,organizationId,producer.runnerImage);
   }else if(review.status==='completed')throw new Error('Completed hosted review lacks comparison');
  }
 }catch{report.failed=true;process.exitCode=1;console.error('Hosted prepare did not complete; no successful hosted review is claimed.');}
 finally{
  console.log(JSON.stringify({event:'hosted-snapshot-reads',...snapshots.metrics()}));
  try{worker?.shutdown();await running;}
  catch{report.failed=true;process.exitCode=1;for(const review of report.reviews)if(review.status==='completed')review.status='unavailable';console.error('Hosted controller shutdown unavailable.');}
  finally{
   try{if(evaluator){try{container(['stop','--time','20',evaluator]);}finally{container(['rm','--force','--volumes',evaluator]);}}}
   catch{report.failed=true;process.exitCode=1;for(const review of report.reviews)if(review.status==='completed')review.status='unavailable';console.error('Hosted evaluator cleanup unavailable.');}
   finally{await rm(evaluatorEnv,{force:true});await native?.close();await connection?.close();await pool.end();await mkdir(output,{recursive:true});const encoded=JSON.stringify(report,null,2)+'\n';if(Buffer.byteLength(encoded)>16*1024*1024)throw new Error('Hosted report exceeds retention budget');await writeFile(`${output}/reviews.json`,encoded);}
  }
 }
 if(report.failed)process.exitCode=1;
}else throw new Error('Use prepare or publish');
