import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import {pathToFileURL} from 'node:url';
import {ComparisonAccumulator,frameExport} from '../dist/packages/evals/export.js';
import {canonical,digest} from '../dist/packages/review/engine.js';

const expectedVersion = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;
const arguments_ = process.argv.slice(2);
const offline = arguments_.includes('--offline');
const archive = resolve(arguments_.find(argument => !argument.startsWith('--')) ?? `releases/agentci-${expectedVersion}.tgz`);
const root = await mkdtemp(join(tmpdir(), 'agentci-package-'));
try {
  execFileSync('npm', ['install', ...(offline ? ['--offline'] : []), '--omit=dev', '--no-audit', '--no-fund', '--prefix', root, archive], { stdio: 'pipe' });
  const cli = join(root, 'node_modules/.bin/agentci');
  const version = execFileSync(cli, ['--version'], { encoding: 'utf8' }).trim();
  if (version !== expectedVersion) throw new Error('Unexpected packaged version');
  // Exercise installed provider modules and their runtime schema assets, not source imports.
  const installedRoot=join(root,'node_modules/agentci');
  const {validateModelRequest}=await import(pathToFileURL(join(installedRoot,'dist/packages/providers/request.js')).href);
  const {validateModelResponse}=await import(pathToFileURL(join(installedRoot,'dist/packages/providers/response.js')).href);
  const request=validateModelRequest(JSON.parse(await readFile(join(installedRoot,'specs/api/fixtures/model-request.json'),'utf8')));
  validateModelResponse({schemaVersion:'v1alpha1',requestId:request.requestId,attemptId:'installed-fixture',provider:request.provider,model:request.model,status:'completed',text:'installed',structuredOutput:{claim:'installed schema acceptance'},toolCalls:[],usage:{inputTokens:null,outputTokens:null,costUsdMicros:null,costKind:'unknown',pricingRevision:null},providerRequestId:null},request,'installed-fixture');
  if(!(await readFile(join(installedRoot,'deploy/migrations/004_m3_model_budget.sql'),'utf8')).includes('agentci_model_attempts'))throw new Error('Installed provider budget migration missing');
  if(!(await readFile(join(installedRoot,'deploy/migrations/005_m3_reviewer_results.sql'),'utf8')).includes('agentci_reviewer_results'))throw new Error('Installed reviewer result migration missing');
  const {validateReviewerResult}=await import(pathToFileURL(join(installedRoot,'dist/packages/reviewers/result.js')).href);
  const reviewerFixture=JSON.parse(await readFile(join(installedRoot,'specs/api/fixtures/reviewer-result.json'),'utf8'));
  validateReviewerResult(reviewerFixture,reviewerFixture.subject);
  if(!(await readFile(join(installedRoot,'deploy/migrations/006_m3_finding_history.sql'),'utf8')).includes('agentci_finding_events'))throw new Error('Installed finding history migration missing');
  const {FindingHistoryStore}=await import(pathToFileURL(join(installedRoot,'dist/packages/storage/finding-history.js')).href);
  if(typeof FindingHistoryStore!=='function')throw new Error('Installed finding history store missing');
  if(!(await readFile(join(installedRoot,'deploy/migrations/007_m3_reproduction.sql'),'utf8')).includes('agentci_reproduction_receipts'))throw new Error('Installed reproduction migration missing');
  const {FindingReproductionStore}=await import(pathToFileURL(join(installedRoot,'dist/packages/storage/finding-reproduction.js')).href);
  const {compileFindingReproduction,reproductionReceipt}=await import(pathToFileURL(join(installedRoot,'dist/packages/findings/reproduction.js')).href);
  if([FindingReproductionStore,compileFindingReproduction,reproductionReceipt].some(value=>typeof value!=='function'))throw new Error('Installed reproduction modules missing');
  if(!(await readFile(join(installedRoot,'deploy/migrations/008_m3_review_admissions.sql'),'utf8')).includes('agentci_review_admission_outbox'))throw new Error('Installed review admission migration missing');
  const {ReviewAdmissionStore}=await import(pathToFileURL(join(installedRoot,'dist/packages/storage/review-admissions.js')).href);
  if(typeof ReviewAdmissionStore!=='function')throw new Error('Installed review admission store missing');
  const {validateReviewAdmission}=await import(pathToFileURL(join(installedRoot,'dist/packages/reviewers/admission.js')).href);
  validateReviewAdmission(JSON.parse(await readFile(join(installedRoot,'specs/api/fixtures/review-admission.json'),'utf8')));
  if(!(await readFile(join(installedRoot,'deploy/migrations/009_m3_review_dispatch.sql'),'utf8')).includes('review_dispatch_identity'))throw new Error('Installed review dispatch migration missing');
  const {ReviewDispatchStore}=await import(pathToFileURL(join(installedRoot,'dist/packages/storage/review-dispatch.js')).href);
  const {validateReviewerProfile,bindReviewerProfile}=await import(pathToFileURL(join(installedRoot,'dist/packages/reviewers/profile.js')).href);
  if([ReviewDispatchStore,validateReviewerProfile,bindReviewerProfile].some(value=>typeof value!=='function'))throw new Error('Installed review controller modules missing');
  const {validateModelFinding}=await import(pathToFileURL(join(installedRoot,'dist/packages/findings/model.js')).href);
  const findingFixture=JSON.parse(await readFile(join(installedRoot,'specs/api/fixtures/model-finding.json'),'utf8'));
  validateModelFinding(findingFixture,findingFixture.subject);
  const {createSnapshotReviewContext}=await import(pathToFileURL(join(installedRoot,'dist/packages/reviewers/snapshot-context.js')).href);
  const installedContext=await createSnapshotReviewContext(reviewerFixture.subject,async(repository,sha)=>{
    if(repository!==reviewerFixture.subject.repository||sha!==reviewerFixture.subject.headSha)throw new Error('Installed snapshot identity changed');
    return {sha,files:{'fixture.ts':'installed reviewer context'}};
  })([{kind:'source',side:'head',path:'fixture.ts'}]);
  if(installedContext.documents[0]?.content!=='installed reviewer context')throw new Error('Installed snapshot context failed');
  const {createOpenAIProvider}=await import(pathToFileURL(join(installedRoot,'dist/packages/providers/openai.js')).href);
  let installedProviderCalls=0;
  const installedProvider=createOpenAIProvider('synthetic-package-fixture',[{
    model:'installed-fixture',contextTokens:1000,maxOutputTokens:512,
    capabilities:{stream:true,tools:true,structuredOutput:true,developerInstructions:true,extensions:true},
    temperature:false,topP:false,inputUsdMicrosPerMillion:1000000,outputUsdMicrosPerMillion:2000000,pricingRevision:'synthetic-package-prices'
  }],async(url,init)=>{
    if(String(url)!=='https://api.openai.com/v1/responses'||init.redirect!=='error')throw new Error('Installed provider transport boundary changed');
    installedProviderCalls++;
    return new Response(JSON.stringify({id:'installed-response',model:'installed-fixture',status:'completed',output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'{"claim":"installed SDK acceptance"}'}]}],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}),{headers:{'content-type':'application/json'}});
  });
  const installedRequest={...request,provider:'openai',model:'installed-fixture',policy:{...request.policy,deadlineAt:Date.now()+5000}};
  const installedResponse=await installedProvider.invoke(installedRequest,{attemptId:'installed-attempt',signal:new AbortController().signal});
  if(installedProviderCalls!==1||installedResponse.structuredOutput?.claim!=='installed SDK acceptance')throw new Error('Installed OpenAI SDK invocation failed');
  const {createAnthropicProvider}=await import(pathToFileURL(join(installedRoot,'dist/packages/providers/anthropic.js')).href);
  const anthropicProvider=createAnthropicProvider('synthetic-package-fixture',[{
    model:'installed-fixture',contextTokens:1000,maxOutputTokens:512,
    capabilities:{stream:true,tools:true,structuredOutput:true,developerInstructions:false,extensions:false},
    temperature:false,topP:false,inputUsdMicrosPerMillion:1000000,outputUsdMicrosPerMillion:2000000,pricingRevision:'synthetic-package-prices'
  }],async(url,init)=>{
    if(String(url)!=='https://api.anthropic.com/v1/messages'||init.redirect!=='error')throw new Error('Installed Anthropic transport boundary changed');
    return new Response(JSON.stringify({id:'installed-message',type:'message',role:'assistant',model:'installed-fixture',stop_reason:'end_turn',content:[{type:'text',text:'{"claim":"installed Anthropic SDK acceptance"}'}],usage:{input_tokens:1,output_tokens:1,cache_creation_input_tokens:0,cache_read_input_tokens:0}}),{headers:{'content-type':'application/json'}});
  });
  const anthropicResult=await anthropicProvider.invoke({...installedRequest,provider:'anthropic',developer:''},{attemptId:'installed-anthropic',signal:new AbortController().signal});
  if(anthropicResult.structuredOutput?.claim!=='installed Anthropic SDK acceptance')throw new Error('Installed Anthropic SDK invocation failed');
  const {createXAIProvider}=await import(pathToFileURL(join(installedRoot,'dist/packages/providers/xai.js')).href);
  const xaiProvider=createXAIProvider('synthetic-package-fixture',[{
    model:'installed-fixture',contextTokens:1000,maxOutputTokens:512,
    capabilities:{stream:true,tools:true,structuredOutput:true,developerInstructions:true,extensions:true},
    temperature:false,topP:false,inputUsdMicrosPerMillion:1000000,outputUsdMicrosPerMillion:2000000,pricingRevision:'synthetic-package-prices'
  }],async(input)=>{
    if(!(input instanceof Request)||input.url!=='https://api.x.ai/v1/responses'||input.redirect!=='error')throw new Error('Installed xAI transport boundary changed');
    return new Response(JSON.stringify({id:'installed-xai',model:'installed-fixture',status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'{"claim":"installed xAI SDK acceptance"}'}]}],usage:{input_tokens:1,output_tokens:1,total_tokens:2,cost_in_usd_ticks:10000}}),{headers:{'content-type':'application/json'}});
  });
  const xaiResult=await xaiProvider.invoke({...installedRequest,provider:'xai'},{attemptId:'installed-xai',signal:new AbortController().signal});
  if(xaiResult.structuredOutput?.claim!=='installed xAI SDK acceptance'||xaiResult.usage.costUsdMicros!==1)throw new Error('Installed xAI SDK invocation failed');



  if(!execFileSync(cli,['--help'],{encoding:'utf8'}).includes('review --config PRIVATE_JSON'))throw new Error('Installed operator review command missing');
  if(!execFileSync(cli,['--help'],{encoding:'utf8'}).includes('preflight --config PRIVATE_JSON'))throw new Error('Installed preflight command missing');
  try{execFileSync(cli,['preflight','--config',join(root,'missing-preflight.json')],{encoding:'utf8',stdio:'pipe'});throw new Error('Installed preflight accepted missing private config');}catch(error){if(error.status!==2||JSON.parse(error.stderr).error.code!=='invalid-private-preflight-config')throw error;}
  const preflightTemplate=JSON.parse(await readFile(join(root,'node_modules/agentci/deploy/preflight.example.json'),'utf8'));
  if(preflightTemplate.providers.length||preflightTemplate.liveTests!==null)throw new Error('Preflight template must not enable live provider tests');
  const operatorTemplate=JSON.parse(await readFile(join(root,'node_modules/agentci/deploy/review-operator.example.json'),'utf8'));
  if(Object.keys(operatorTemplate).sort().join(',')!=='appId,installationId,privateKeyFile,repository,url,webhookSecretFile')throw new Error('Unexpected packaged operator credential boundary');
  try{execFileSync(cli,['review','--config',join(root,'missing-private-operator.json'),'--pr','1'],{encoding:'utf8',stdio:'pipe'});throw new Error('Installed operator accepted missing private config');}catch(error){if(error.status!==2||JSON.parse(error.stderr).error.code!=='invalid-private-operator-file')throw error;}
  try{execFileSync(cli,['review','--pr','0'],{encoding:'utf8',stdio:'pipe'});throw new Error('Installed operator accepted invalid arguments');}catch(error){if(error.status!==2||JSON.parse(error.stderr).error.code!=='invalid-review-arguments')throw error;}
  const template=await readFile(join(root,'node_modules/agentci/.env.example'),'utf8');
  if(!template.includes('AGENTCI_EVAL_RUNNER_IMAGE=REPLACE_WITH_IMMUTABLE_RUNNER_IMAGE_OR_DIGEST')||!template.includes('AGENTCI_EVAL_REVIEW_TIMEOUT_MS=86400000'))throw new Error('Packaged controller configuration template missing');
  try{await readFile(join(root,'node_modules/agentci/.env'));throw new Error('Private deployment environment entered package');}catch(error){if(error.code!=='ENOENT')throw error;}
  const fresh = join(root, 'fresh-project');
  execFileSync(cli, ['init', '--root', fresh], { stdio: 'pipe' });
  const freshResult = JSON.parse(execFileSync(cli, ['validate', '--root', fresh, '--json'], { encoding: 'utf8' }));
  if (!freshResult.valid || freshResult.requirements !== 1) throw new Error('Installed initializer produced invalid project');
  try { execFileSync(cli, ['init', '--root', fresh], { stdio: 'pipe' }); throw new Error('Initializer overwrote existing project'); } catch (error) { if (error.status !== 2) throw error; }
  execFileSync(process.execPath, ['--input-type=module', '-e', "import {AgentCIClient} from 'agentci/client';new AgentCIClient({url:'http://127.0.0.1:3000',token:'x'.repeat(32)});"], { cwd: root, stdio: 'pipe' });
  const comparison=JSON.parse(await readFile(join(root,'node_modules/agentci/specs/api/fixtures/eval-comparison.json'),'utf8'));
  const comparisonServer=createServer(async(req,res)=>{
    if(req.headers.authorization!=='Bearer '+ 'x'.repeat(32)||![`/v1/eval-comparisons/${comparison.id}`,`/v1/eval-comparisons/${comparison.id}/export`].includes(req.url?.toLowerCase())){res.writeHead(401);res.end('{}');return;}
    if(req.url.endsWith('/export')){
      const {apiVersion,kind,summary,units,...input}=comparison.comparison,header={...input,unitCount:units.length,snapshotDigest:comparison.digest},accumulator=new ComparisonAccumulator(header);
      async function* items(){yield {type:'header',data:header};for(const unit of units){const results=accumulator.push(unit);yield {type:'unit',data:unit};for(const result of results)yield {type:'comparison',data:result};}const final=accumulator.finish();for(const result of final.comparisons)yield {type:'comparison',data:result};yield {type:'summary',data:final.summary};yield {type:'end',data:{summaryDigest:digest(canonical(final.summary))}};}
      res.writeHead(200,{'content-type':'application/x-ndjson'});for await(const frame of frameExport(items()))res.write(JSON.stringify(frame)+'\n');res.end();return;
    }
    res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(comparison));
  });
  comparisonServer.listen(0,'127.0.0.1');await once(comparisonServer,'listening');
  try{
    const code=`import {AgentCIClient} from 'agentci/client';const value=${JSON.stringify(comparison)};const c=value.comparison;const client=new AgentCIClient({url:'http://127.0.0.1:${comparisonServer.address().port}',token:'x'.repeat(32)});const identity={...c.subject,organizationId:c.organizationId.toUpperCase(),reviewId:c.reviewId.toUpperCase(),attemptId:c.attemptId.toUpperCase()};const result=await client.evalComparison(value.id.toUpperCase(),identity);if(result.digest!==value.digest||result.comparison.summary.outcome!=='failed')throw new Error('Installed comparison client failed');let units=0,complete=false;for await(const item of client.evalComparisonExport(value.id.toUpperCase(),identity)){if(item.type==='unit')units++;if(item.type==='summary'){complete=true;if(item.data.outcome!=='failed')throw new Error('Installed export outcome failed');}}if(units!==2||!complete)throw new Error('Installed export client failed');`;
    const child=spawn(process.execPath,['--input-type=module','-e',code],{cwd:root,stdio:['ignore','pipe','pipe']});const [exit]=await once(child,'exit');if(exit!==0)throw new Error('Installed comparison client/schema smoke failed');
  }finally{await new Promise(resolve=>comparisonServer.close(resolve));}
  if (!(await readFile(join(root, 'node_modules/agentci/LICENSE'), 'utf8')).includes('MIT License')) throw new Error('Package license missing');
  const listener = createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
  const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
  const deployment = join(root, 'deployment'); await mkdir(deployment, { mode: 0o700 });
  const setup = spawn(cli, ['setup'], { cwd: deployment, env: { ...process.env, AGENTCI_SETUP_REPOSITORY: 'customer/new-project', AGENTCI_SETUP_ACCOUNT_TYPE: 'organization', AGENTCI_SETUP_APP_NAME: 'AgentCI-customer-test', AGENTCI_SETUP_URL: 'https://customer.example.com', AGENTCI_SETUP_PORT: String(port), AGENTCI_SETUP_TEMPORAL_UI_PORT: String(port === 8233 ? 8234 : 8233) }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const [output] = await once(setup.stdout, 'data', { signal: AbortSignal.timeout(15_000) });
    const setupUrl = new URL(output.toString().trim());
    const response = await fetch(`http://127.0.0.1:${port}${setupUrl.pathname}${setupUrl.search}`);
    const page = await response.text();
    if (response.status !== 200 || !page.includes('https://github.com/organizations/customer/settings/apps/new?state=') || !page.includes('Install only on customer/new-project')) throw new Error('Installed customer setup flow failed');
    const invalidState = await fetch(`http://127.0.0.1:${port}/setup/github/callback?state=invalid&code=${'a'.repeat(20)}`);
    if (invalidState.status !== 403) throw new Error('Invalid setup state accepted');
  } finally { const exited = setup.exitCode !== null || setup.signalCode !== null ? Promise.resolve() : once(setup, 'exit'); setup.kill('SIGTERM'); await exited; }

  await mkdir(join(root, 'project/specs'), { recursive: true });
  await writeFile(join(root, 'project/agentci.yaml'), `apiVersion: agentci.io/v1alpha1
kind: AgentProject
metadata: { name: package-smoke }
spec:
  source: { defaultBranch: main }
  specifications: { include: [specs/*.yaml] }
  implementation: { include: [src/**] }
  evals: { include: [evals/**] }
  policies: { include: [policies/**] }
  prompts: { include: [prompts/**] }
  models: { allowedProviders: [openai], defaultRoute: standard }
  ci: { provider: auto }
  telemetry: { protocol: otlp, contentCapture: metadata-only }
  review: { requiredCheckName: agentci/review }
`);
  await writeFile(join(root, 'project/specs/requirements.yaml'), `id: SMOKE-1
title: Clean install
type: functional
status: active
text: Packaged CLI validates a fresh project.
`);
  const result = JSON.parse(execFileSync(cli, ['validate', '--root', join(root, 'project'), '--json'], { encoding: 'utf8' }));
  if (!result.valid || result.requirements !== 1) throw new Error('Fresh project validation failed');
  await writeFile(join(root, 'project/specs/requirements.yaml'), 'id: BROKEN\n');
  try {
    execFileSync(cli, ['validate', '--root', join(root, 'project')], { stdio: 'pipe' });
    throw new Error('Invalid project unexpectedly passed');
  } catch (error) { if (error.status !== 1) throw error; }
  console.log('Packaged CLI/client passed: production-only install, version, fresh init, overwrite rejection, client entry point, installed provider schemas/migration and OpenAI/Anthropic/xAI SDK invocation, MIT license, installed App setup/state rejection, validation and invalid input.');
} finally { await rm(root, { recursive: true, force: true }); }
