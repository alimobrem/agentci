import {containerEngine} from '../dist/packages/evals/runner.js';
import {execFileSync,spawnSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {Pool} from 'pg';import {Client,Connection} from '@temporalio/client';
import {stringify} from 'yaml';import {parseYaml} from '../dist/packages/project/index.js';
import {Store} from '../dist/packages/storage/postgres.js';import {EvalStore} from '../dist/packages/storage/evals.js';
import {analyze} from '../dist/packages/review/engine.js';
const prefix='agentci-eval-image-'+randomUUID().slice(0,8),directory=await mkdtemp(join(tmpdir(),'agentci-eval-image-'));
const engine=containerEngine(),socket=process.env.AGENTCI_CONTAINER_SOCKET_PATH??(engine==='docker'?'/var/run/docker.sock':`/run/user/${process.getuid()}/podman/podman.sock`);
if(!/^\/[A-Za-z0-9_./-]+$/.test(socket))throw new Error('Invalid operator executor socket');
const serviceNamespace=engine==='podman'?['--userns','keep-id:uid=1001,gid=0','--security-opt','label=disable']:[];
const runtimeScratch=engine==='podman'?['--mount','type=tmpfs,destination=/opt/agentci/podman-runtime,tmpfs-size=16m,tmpfs-mode=1777,tmpcopyup=false']:['--tmpfs','/opt/agentci/podman-runtime:rw,nosuid,nodev,size=16m,mode=1777'];
const container=(...args)=>execFileSync(engine,args,{encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:60000}).trim();
const names=[],ids=[],network=prefix;let pool,connection,sharedProvider,result;
const pause=()=>new Promise(resolve=>setTimeout(resolve,100));
async function wait(probe){for(let i=0;i<150;i++){try{if(await probe())return;}catch{}await pause();}throw new Error('Eval image probe did not become ready');}
const create=(name,...args)=>{names.push(name);return container('create','--name',name,'--label','agentci.purpose=eval-image-smoke','--network',network,...args);};
const immutableImage=reference=>{const id=container('image','inspect',reference,'--format','{{.Id}}');return id.startsWith('sha256:')?id:'sha256:'+id;};
const workerImage=immutableImage(process.argv[2]??'agentci-eval-worker:ci'),runnerImage=immutableImage(process.argv[3]??'agentci-eval-runner:ci');
try{
  const platform=container('image','inspect',workerImage,'--format','{{.Os}}/{{.Architecture}}');
  const check=JSON.parse(container('run','--rm','--network','none','--read-only',...runtimeScratch,'--entrypoint','node',workerImage,'-e',`const fs=require('node:fs'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');assert.equal(process.getuid(),1001);for(const path of ['/usr/local/bin/npm','/usr/local/bin/npx','/usr/bin/microdnf','/usr/bin/rpm','/run/secrets/github-app.pem'])assert.equal(fs.existsSync(path),false,path);assert.match(fs.readFileSync('/etc/os-release','utf8'),/ID="rhel"/);assert.equal(process.env.GITHUB_TOKEN,undefined);assert.equal(process.env.GITHUB_APP_ID,undefined);if(${JSON.stringify(engine)}==='podman'){fs.mkdirSync(process.env.XDG_RUNTIME_DIR,{recursive:true,mode:0o700});assert.equal(fs.statSync(process.env.XDG_RUNTIME_DIR).mode&511,448);assert.equal(fs.statSync(process.env.XDG_RUNTIME_DIR).uid,process.getuid());}const cli=execFileSync(${JSON.stringify(engine)},['--version'],{encoding:'utf8'}).trim();assert.equal(cli,${JSON.stringify(engine==='podman'?'podman version 6.1.3':'Docker version 29.8.2, build 7fc2dff')});console.log(JSON.stringify({uid:process.getuid(),node:process.version,cli,license:require('node:crypto').createHash('sha256').update(fs.readFileSync(${JSON.stringify(engine==='podman'?'/licenses/podman-LICENSE':'/licenses/docker-cli-LICENSE')})).digest('hex')}));`));
  container('network','create',network);
  const postgres=prefix+'-db',temporal=prefix+'-temporal',password=randomUUID()+randomUUID();
  const pgFile=join(directory,'postgres.env');await writeFile(pgFile,`POSTGRES_PASSWORD=${password}\nPOSTGRES_DB=agentci\n`,{mode:0o600});
  create(postgres,'--network-alias','postgres','--env-file',pgFile,'-p','127.0.0.1::5432','postgres:18.6-alpine@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873');container('start',postgres);
  const dbPort=container('port',postgres,'5432/tcp').split(':').at(-1),url=new URL(`postgresql://127.0.0.1:${dbPort}/agentci`);url.username='postgres';url.password=password;
  pool=new Pool({connectionString:url.toString(),connectionTimeoutMillis:1000,query_timeout:10000});await wait(async()=>{await pool.query('SELECT 1');return true;});
  for(const file of ['001_m1.sql','002_m2.sql','002_m2_eval_role.sql'])await pool.query(await readFile(new URL('../deploy/migrations/'+file,import.meta.url),'utf8'));
  const login='eval_image',loginPassword=randomUUID()+randomUUID();await pool.query(`CREATE ROLE ${login} LOGIN PASSWORD '${loginPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS IN ROLE agentci_eval_executor`);
  const organization='00000000-0000-4000-8000-000000000001',repository='example/repo',reviews=new Store(pool,organization,repository),evals=new EvalStore(pool,organization,repository);await reviews.ready();
  create(temporal,'--network-alias','temporal','-p','127.0.0.1::7233','temporalio/temporal:latest@sha256:ad4c82c97bd12b417d1ea942610dbcd511afb250c4d5ed26c694009533df447e','server','start-dev','--ip','0.0.0.0','--headless');container('start',temporal);
  await wait(()=>container('exec',temporal,'temporal','operator','cluster','health','--address','127.0.0.1:7233').includes('SERVING'));
  connection=await Connection.connect({address:'127.0.0.1:'+container('port',temporal,'7233/tcp').split(':').at(-1)});const client=new Client({connection});
  const socketGid=container('run','--rm','--network','none',...serviceNamespace,'-v',`${socket}:/run/agentci/engine.sock`,'--entrypoint','node',workerImage,'-e',`const s=require('node:fs').statSync('/run/agentci/engine.sock');if(!s.isSocket())process.exit(1);console.log(s.gid)`);
  const workerUrl=new URL('postgresql://postgres:5432/agentci');workerUrl.username=login;workerUrl.password=loginPassword;
  const envFile=join(directory,'worker.env');await writeFile(envFile,`AGENTCI_CONTAINER_ENGINE=${engine}\nCONTAINER_HOST=unix:///run/agentci/engine.sock\nDOCKER_HOST=unix:///run/agentci/engine.sock\nAGENTCI_REPOSITORY=${repository}\nAGENTCI_ORGANIZATION_ID=${organization}\nAGENTCI_EVAL_DATABASE_URL=${workerUrl}\nTEMPORAL_ADDRESS=temporal:7233\nAGENTCI_EVAL_RUNNER_IMAGE=${runnerImage}\n`,{mode:0o600});
  const worker=prefix+'-worker';
  if(process.env.AGENTCI_SMOKE_USE_COMPOSE==='1'){
    if(engine!=='podman')throw new Error('Rootless Compose acceptance requires Podman');
    const endpoint=process.env.AGENTCI_SMOKE_ENGINE_ENDPOINT,shared=process.env.AGENTCI_SMOKE_SHARED_DIRECTORY,remoteShared=process.env.AGENTCI_SMOKE_VM_SHARED_DIRECTORY;
    if(!endpoint?.startsWith('unix:///')||!shared?.startsWith('/')||!remoteShared?.startsWith('/'))throw new Error('Explicit private Podman API/shared paths required for Compose acceptance');
    sharedProvider=join(shared,prefix+'-providers.json');await writeFile(sharedProvider,'[]\n',{mode:0o600});
    const override=join(directory,'compose-identity.yaml');await writeFile(override,stringify({services:{'eval-worker':{container_name:worker}}}));
    const composeEnv={...process.env,DOCKER_HOST:endpoint,DOCKER_CONTEXT:'',AGENTCI_CONTAINER_ENGINE:engine,AGENTCI_CONTAINER_SOCKET_PATH:socket,AGENTCI_CONTAINER_SOCKET_GID:socketGid,AGENTCI_EVAL_WORKER_IMAGE:workerImage,AGENTCI_EVAL_RUNNER_IMAGE:runnerImage,AGENTCI_EVAL_ENGINES_IMAGE:'',AGENTCI_REPOSITORY:repository,AGENTCI_ORGANIZATION_ID:organization,AGENTCI_EVAL_DATABASE_URL:workerUrl.toString(),AGENTCI_EVAL_PGUSER:login,AGENTCI_EVAL_PGPASSWORD:loginPassword,AGENTCI_EVAL_TEMPORAL_ADDRESS:'temporal:7233',AGENTCI_EVAL_PROVIDERS_FILE:join(remoteShared,prefix+'-providers.json'),AGENTCI_CONTROLLER_NETWORK:network};
    names.push(worker);
    execFileSync(process.env.AGENTCI_COMPOSE_BINARY??'docker',['-p',prefix,...['deploy/eval-worker.compose.yaml','deploy/podman-rootless.compose.yaml','deploy/local-eval-network.compose.yaml',override].flatMap(file=>['-f',file]),'up','-d','--no-build','--pull','never'],{env:composeEnv,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:60000});
  }else{
    create(worker,'--read-only','--tmpfs','/tmp:rw,nosuid,nodev,size=128m',...runtimeScratch,'--cap-drop','ALL','--security-opt','no-new-privileges','--group-add',socketGid,'--env-file',envFile,...serviceNamespace,'-v',`${socket}:/run/agentci/engine.sock`,workerImage);container('start',worker);
  }
  await wait(()=>{const logs=spawnSync(engine,['logs',worker],{encoding:'utf8'});return (logs.stdout+logs.stderr).includes("state: 'RUNNING'");});
  const config=parseYaml(await readFile(new URL('../agentci.yaml',import.meta.url),'utf8'));config.spec.specifications.include=['specs/**'];
  const sha=()=>createHash('sha1').update(randomUUID()).digest('hex'),base={sha:sha(),files:{'agentci.yaml':stringify(config),'specs/overview.md':'Container acceptance fixture.'}},head={sha:sha(),files:{...base.files,'subject.txt':'changed'}};
  const review=await reviews.save(analyze({repository,base,head}),1);
  const stage=async(script,count=1)=>{
    const suite={apiVersion:'agentci.io/v1alpha1',kind:'EvalSuite',metadata:{id:'container-behavior'},spec:{class:'golden',requirements:['REQ-001'],impact:{categories:['prompt'],include:['prompts/**']},runner:{adapter:'command',command:['node','-e',script],timeoutMs:30000},scenarios:[{id:'safe-response',critical:true}],trials:{count,passRate:1,confidenceMethod:'wilson'}}};
    const id=(await evals.stage(review.id,randomUUID(),base,head,[{suite,side:'base',assertionSide:'base',runner:{runnerImage}}],{suiteChanges:[],coverageGaps:[],selectionGaps:[]})).unitIds[0];ids.push(id);return id;
  };
  const execute=async id=>{const handle=await client.workflow.start('evaluateUnit',{args:[id],taskQueue:'agentci-eval-v1',workflowId:prefix+':'+id,workflowExecutionTimeout:'45 seconds'});if(await handle.result()!==id)throw new Error('Eval workflow identity mismatch');return (await evals.unit(id)).result;};
  const id=await stage(`const fs=require('node:fs'),assert=require('node:assert/strict');assert.equal(process.getuid(),1001);for(const key of ['GITHUB_TOKEN','AGENTCI_EVIDENCE_TOKEN','AGENTCI_EVAL_DATABASE_URL'])assert.equal(process.env[key],undefined);assert.equal(fs.existsSync('/var/run/docker.sock'),false);assert.equal(fs.existsSync('/run/agentci/engine.sock'),false);assert.equal(fs.existsSync('/run/secrets/github-app.pem'),false);assert.throws(()=>fs.writeFileSync('/etc/agentci-smoke','x'));`,2);
  if((await execute(id)).status!=='passed')throw new Error('Isolated child boundary failed');
  const failing=await stage('process.exit(1)');if((await execute(failing)).status!=='failed')throw new Error('Assertion failure must remain behavioral failure');
  container('stop','--time','20',worker);if(container('inspect','--format','{{.State.ExitCode}}',worker)!=='0')throw new Error('Worker shutdown not clean');
  container('start',worker);await wait(()=>container('inspect','--format','{{.State.Running}}',worker)==='true');const restarted=await stage('process.exit(0)');if((await execute(restarted)).status!=='passed')throw new Error('Worker restart failed');
  container('stop','--time','20',worker);if(container('inspect','--format','{{.State.ExitCode}}',worker)!=='0')throw new Error('Restart shutdown not clean');
  for(const unit of ids)if(container('ps','--all','--quiet','--filter',`label=agentci.eval.unit=${unit}`))throw new Error('Leaked owned child container');
  result={result:'passed',deployment:process.env.AGENTCI_SMOKE_USE_COMPOSE==='1'?'rootless-Podman-Compose':'native-CLI',engine,platform,workerImage,runnerImage,...check,checks:['UBI non-root read-only runtime','no package installers/App keys','official pinned '+engine+' CLI execution','separately authenticated restricted database login','real Temporal workflow and isolated child execution','child has no database/App/socket credentials','behavioral failure preserved','worker graceful shutdown/restart','all owned children removed'],github:'no live GitHub publication claimed'};
}finally{
  await connection?.close();await pool?.end();
  // Publication happens only after all cleanup has been independently confirmed.
  let cleanupFailed=false;
  const exists=name=>container('ps','--all','--quiet','--filter',`name=^${name}$`);
  const workerName=prefix+'-worker';
  if(names.includes(workerName))try{if(exists(workerName)&&container('inspect','--format','{{.State.Running}}',workerName)==='true')container('stop','--time','20',workerName);}catch{cleanupFailed=true;}
  for(const unit of ids){try{const owned=container('ps','--all','--quiet','--no-trunc','--filter',`label=agentci.eval.unit=${unit}`);if(owned)container('rm','--force','--volumes',...owned.split('\n'));if(container('ps','--all','--quiet','--filter',`label=agentci.eval.unit=${unit}`))cleanupFailed=true;}catch{cleanupFailed=true;}}
  for(const name of names.reverse()){try{if(exists(name))container('rm','--force','--volumes',name);if(exists(name))cleanupFailed=true;}catch{cleanupFailed=true;}}
  try{if(container('network','ls','--quiet','--filter',`name=^${network}$`))container('network','rm',network);}catch{cleanupFailed=true;}
  if(sharedProvider)await rm(sharedProvider,{force:true});await rm(directory,{recursive:true,force:true});
  if(cleanupFailed)throw new Error('Evaluator acceptance cleanup incomplete; no passing artifact may be published');
}
if(result)console.log(JSON.stringify(result,null,2));
