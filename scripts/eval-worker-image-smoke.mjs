import {execFileSync,spawnSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {Pool} from 'pg';import {Client,Connection} from '@temporalio/client';
import {stringify} from 'yaml';import {parseYaml} from '../dist/packages/project/index.js';
import {Store} from '../dist/packages/storage/postgres.js';import {EvalStore} from '../dist/packages/storage/evals.js';
import {analyze} from '../dist/packages/review/engine.js';
const prefix='agentci-eval-image-'+randomUUID().slice(0,8),directory=await mkdtemp(join(tmpdir(),'agentci-eval-image-'));
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:60000}).trim();
const names=[],ids=[],network=prefix;let pool,connection;
const pause=()=>new Promise(resolve=>setTimeout(resolve,100));
async function wait(probe){for(let i=0;i<150;i++){try{if(await probe())return;}catch{}await pause();}throw new Error('Eval image probe did not become ready');}
const create=(name,...args)=>{names.push(name);return docker('create','--name',name,'--label','agentci.purpose=eval-image-smoke','--network',network,...args);};
const workerImage=docker('image','inspect',process.argv[2]??'agentci-eval-worker:ci','--format','{{.Id}}'),runnerImage=docker('image','inspect',process.argv[3]??'agentci-eval-runner:ci','--format','{{.Id}}');
try{
  const platform=docker('image','inspect',workerImage,'--format','{{.Os}}/{{.Architecture}}');
  const check=JSON.parse(docker('run','--rm','--network','none','--read-only','--entrypoint','node',workerImage,'-e',`const fs=require('node:fs'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');assert.equal(process.getuid(),1001);for(const path of ['/usr/local/bin/npm','/usr/local/bin/npx','/usr/bin/microdnf','/usr/bin/rpm','/run/secrets/github-app.pem'])assert.equal(fs.existsSync(path),false,path);assert.match(fs.readFileSync('/etc/os-release','utf8'),/ID="rhel"/);assert.equal(process.env.GITHUB_TOKEN,undefined);assert.equal(process.env.GITHUB_APP_ID,undefined);const cli=execFileSync('docker',['--version'],{encoding:'utf8'}).trim();assert.match(cli,/29\.8\.2/);console.log(JSON.stringify({uid:process.getuid(),node:process.version,cli,license:require('node:crypto').createHash('sha256').update(fs.readFileSync('/licenses/docker-cli-LICENSE')).digest('hex')}));`));
  docker('network','create',network);
  const postgres=prefix+'-db',temporal=prefix+'-temporal',password=randomUUID()+randomUUID();
  const pgFile=join(directory,'postgres.env');await writeFile(pgFile,`POSTGRES_PASSWORD=${password}\nPOSTGRES_DB=agentci\n`,{mode:0o600});
  create(postgres,'--network-alias','postgres','--env-file',pgFile,'-p','127.0.0.1::5432','postgres:18.6-alpine@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873');docker('start',postgres);
  const dbPort=docker('port',postgres,'5432/tcp').split(':').at(-1),url=new URL(`postgresql://127.0.0.1:${dbPort}/agentci`);url.username='postgres';url.password=password;
  pool=new Pool({connectionString:url.toString(),connectionTimeoutMillis:1000,query_timeout:10000});await wait(async()=>{await pool.query('SELECT 1');return true;});
  for(const file of ['001_m1.sql','002_m2.sql','002_m2_eval_role.sql'])await pool.query(await readFile(new URL('../deploy/migrations/'+file,import.meta.url),'utf8'));
  const login='eval_image',loginPassword=randomUUID()+randomUUID();await pool.query(`CREATE ROLE ${login} LOGIN PASSWORD '${loginPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS IN ROLE agentci_eval_executor`);
  const organization='00000000-0000-4000-8000-000000000001',repository='example/repo',reviews=new Store(pool,organization,repository),evals=new EvalStore(pool,organization,repository);await reviews.ready();
  create(temporal,'--network-alias','temporal','-p','127.0.0.1::7233','temporalio/temporal:latest@sha256:ad4c82c97bd12b417d1ea942610dbcd511afb250c4d5ed26c694009533df447e','server','start-dev','--ip','0.0.0.0','--headless');docker('start',temporal);
  await wait(()=>docker('exec',temporal,'temporal','operator','cluster','health','--address','127.0.0.1:7233').includes('SERVING'));
  connection=await Connection.connect({address:'127.0.0.1:'+docker('port',temporal,'7233/tcp').split(':').at(-1)});const client=new Client({connection});
  const socketGid=docker('run','--rm','--network','none','-v','/var/run/docker.sock:/var/run/docker.sock','--entrypoint','node',workerImage,'-e',`const s=require('node:fs').statSync('/var/run/docker.sock');if(!s.isSocket())process.exit(1);console.log(s.gid)`);
  const workerUrl=new URL('postgresql://postgres:5432/agentci');workerUrl.username=login;workerUrl.password=loginPassword;
  const envFile=join(directory,'worker.env');await writeFile(envFile,`AGENTCI_CONTAINER_ENGINE=docker\nAGENTCI_REPOSITORY=${repository}\nAGENTCI_ORGANIZATION_ID=${organization}\nAGENTCI_EVAL_DATABASE_URL=${workerUrl}\nTEMPORAL_ADDRESS=temporal:7233\nAGENTCI_EVAL_RUNNER_IMAGE=${runnerImage}\n`,{mode:0o600});
  const worker=prefix+'-worker';create(worker,'--read-only','--tmpfs','/tmp:rw,nosuid,nodev,size=128m','--tmpfs','/opt/agentci/podman-runtime:rw,nosuid,nodev,size=16m,mode=0700,uid=1001,gid=0','--cap-drop','ALL','--security-opt','no-new-privileges','--group-add',socketGid,'--env-file',envFile,'-v','/var/run/docker.sock:/var/run/docker.sock',workerImage);docker('start',worker);
  await wait(()=>{const logs=spawnSync('docker',['logs',worker],{encoding:'utf8'});return (logs.stdout+logs.stderr).includes("state: 'RUNNING'");});
  const config=parseYaml(await readFile(new URL('../agentci.yaml',import.meta.url),'utf8'));config.spec.specifications.include=['specs/**'];
  const sha=()=>createHash('sha1').update(randomUUID()).digest('hex'),base={sha:sha(),files:{'agentci.yaml':stringify(config),'specs/overview.md':'Container acceptance fixture.'}},head={sha:sha(),files:{...base.files,'subject.txt':'changed'}};
  const review=await reviews.save(analyze({repository,base,head}),1);
  const stage=async(script,count=1)=>{
    const suite={apiVersion:'agentci.io/v1alpha1',kind:'EvalSuite',metadata:{id:'container-behavior'},spec:{class:'golden',requirements:['REQ-001'],impact:{categories:['prompt'],include:['prompts/**']},runner:{adapter:'command',command:['node','-e',script],timeoutMs:30000},scenarios:[{id:'safe-response',critical:true}],trials:{count,passRate:1,confidenceMethod:'wilson'}}};
    const id=(await evals.stage(review.id,randomUUID(),base,head,[{suite,side:'base',assertionSide:'base',runner:{runnerImage}}],{suiteChanges:[],coverageGaps:[],selectionGaps:[]})).unitIds[0];ids.push(id);return id;
  };
  const execute=async id=>{const handle=await client.workflow.start('evaluateUnit',{args:[id],taskQueue:'agentci-eval-v1',workflowId:prefix+':'+id,workflowExecutionTimeout:'45 seconds'});if(await handle.result()!==id)throw new Error('Eval workflow identity mismatch');return (await evals.unit(id)).result;};
  const id=await stage(`const fs=require('node:fs'),assert=require('node:assert/strict');assert.equal(process.getuid(),1001);for(const key of ['GITHUB_TOKEN','AGENTCI_EVIDENCE_TOKEN','AGENTCI_EVAL_DATABASE_URL'])assert.equal(process.env[key],undefined);assert.equal(fs.existsSync('/var/run/docker.sock'),false);assert.equal(fs.existsSync('/run/secrets/github-app.pem'),false);assert.throws(()=>fs.writeFileSync('/etc/agentci-smoke','x'));`,2);
  if((await execute(id)).status!=='passed')throw new Error('Isolated child boundary failed');
  const failing=await stage('process.exit(1)');if((await execute(failing)).status!=='failed')throw new Error('Assertion failure must remain behavioral failure');
  docker('stop','--time','20',worker);if(docker('inspect','--format','{{.State.ExitCode}}',worker)!=='0')throw new Error('Worker shutdown not clean');
  docker('start',worker);await wait(()=>docker('inspect','--format','{{.State.Running}}',worker)==='true');const restarted=await stage('process.exit(0)');if((await execute(restarted)).status!=='passed')throw new Error('Worker restart failed');
  docker('stop','--time','20',worker);if(docker('inspect','--format','{{.State.ExitCode}}',worker)!=='0')throw new Error('Restart shutdown not clean');
  for(const unit of ids)if(docker('ps','--all','--quiet','--filter',`label=agentci.eval.unit=${unit}`))throw new Error('Leaked owned child container');
  console.log(JSON.stringify({result:'passed',platform,workerImage,runnerImage,...check,checks:['UBI non-root read-only runtime','no package installers/App keys','official pinned Docker CLI compatibility','separately authenticated restricted database login','real Temporal workflow and isolated child execution','child has no database/App/socket credentials','behavioral failure preserved','worker graceful shutdown/restart','all owned children removed'],github:'no live GitHub publication claimed'},null,2));
}finally{
  await connection?.close();await pool?.end();
  // Stop scheduling before collecting owned children, including on a failed probe.
  const workerName=prefix+'-worker';if(names.includes(workerName)){try{docker('stop','--time','20',workerName);}catch{}}
  for(const unit of ids){try{const owned=docker('ps','--all','--quiet','--filter',`label=agentci.eval.unit=${unit}`);if(owned)docker('rm','--force','--volumes',...owned.split('\n'));}catch{}}
  for(const name of names.reverse()){try{docker('rm','--force','--volumes',name);}catch{}}
  try{docker('network','rm',network);}catch{}await rm(directory,{recursive:true,force:true});
}
