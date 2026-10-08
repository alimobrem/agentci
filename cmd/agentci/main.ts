#!/usr/bin/env node
import { validateProject } from '../../packages/project/index.ts';
import { gitSnapshot } from '../../packages/review/git.ts';
import { analyze } from '../../packages/review/engine.ts';
import { VERSION } from '../../packages/version.ts';

const help = `AgentCI ${VERSION} — semantic review and evidence
Installed usage: agentci validate [--root DIRECTORY] [--json]
Usage: npm run agentci -- validate [--root DIRECTORY] [--json]
       npm run agentci -- --help
       npm run agentci -- --version

validate  Validate agentci.yaml and explicit requirements; parse eval YAML.
diff --base REF --head REF --repository OWNER/REPO [--root DIRECTORY]
  Produce deterministic advisory analysis of tracked immutable Git snapshots.
init --root EMPTY_DIRECTORY  Create a minimal agent project.
setup  Register a repository-scoped App using AGENTCI_SETUP_* environment variables.
review --config PRIVATE_JSON --pr NUMBER [--request-id UUID]
  Queue a fresh current-PR review using existing scoped operator credentials.
  Reuse request-id only for ambiguous submission retries, not cancelled reviews.
preflight --config PRIVATE_JSON  Check configured mounts, readiness and provider prerequisites.
  No model calls or webhook changes; provider authentication remains unverified.
Future CLI commands: eval, replay, repair.
model-review profiles [--config PRIVATE_JSON]
model-review submit|show|cancel --request ADMISSION_JSON [--config PRIVATE_JSON]
  Submit or inspect an exact pinned model-review admission. Cancellation records intent.
  Credentials: private token-file config, or AGENTCI_API_URL and evidence/operator token environment.
  Successful submission/status/cancellation is not a passing review verdict.
model-review export --request ADMISSION_JSON [--config PRIVATE_JSON]
model-review findings --request ADMISSION_JSON [--limit PAGE_SIZE] [--config PRIVATE_JSON]
  Retrieve original-summary finding references, preserving pinned versions.
finding show|history --request ADMISSION_JSON --id SHA256_ID [--config PRIVATE_JSON]
  Read current/historical findings or verified history; see finding --help.
finding reproduction-status|cancel-reproduction --request ADMISSION_JSON --reproduction REFERENCE_JSON [--config PRIVATE_JSON]
  Verify retained reproduction status or request operator cancellation.
`;

export async function main(args: string[]): Promise<number> {
  if (!args.length || args[0] === '--help' || args[0] === 'help') { console.log(help); return 0; }
  if (args[0] === '--version') { console.log(VERSION); return 0; }
  if (args[0] === 'model-review') {
    const {modelReviewCommand} = await import('./model-review.ts');
    return modelReviewCommand(args.slice(1));
  }
  if (args[0] === 'finding') {
    const {findingCommand} = await import('./finding.ts');
    return findingCommand(args.slice(1));
  }
  if (args[0] === 'preflight') {
    if(args.length!==3||args[1]!=='--config'||!args[2]||args[2].startsWith('--')){console.error(JSON.stringify({error:{code:'invalid-preflight-arguments'}}));return 2;}
    const {loadPreflightConfig,runPreflight}=await import('../../packages/onboarding/preflight-command.ts');
    const {PreflightError}=await import('../../packages/onboarding/preflight.ts');
    try{const result=await runPreflight(await loadPreflightConfig(args[2]));console.log(JSON.stringify(result));return result.passed?0:1;}
    catch(error){console.error(JSON.stringify({error:{code:error instanceof PreflightError?error.code:'preflight-unavailable'}}));return 2;}
  }
  if (args[0] === 'review') {
    const options: Record<string,string> = {};
    for(let i=1;i<args.length;i+=2){const name=args[i],value=args[i+1];if(!name||!['--config','--pr','--request-id'].includes(name)||!value||value.startsWith('--')||options[name]){console.error(JSON.stringify({error:{code:'invalid-review-arguments'}}));return 2;}options[name]=value;}
    if(!options['--config']||!options['--pr']||!/^[1-9][0-9]*$/.test(options['--pr'])){console.error(JSON.stringify({error:{code:'invalid-review-arguments'}}));return 2;}
    const {loadReviewOperatorConfig,requestOperatorReview,OperatorReviewError}=await import('../../packages/operator/review.ts');
    try{const config=await loadReviewOperatorConfig(options['--config']);console.log(JSON.stringify(await requestOperatorReview(config,Number(options['--pr']),{requestId:options['--request-id']})));return 0;}
    catch(error){console.error(JSON.stringify({error:error instanceof OperatorReviewError?{code:error.code,...(error.requestId?{requestId:error.requestId}:{})}:{code:'operator-review-unavailable'}}));return 2;}
  }
  if (args[0] === 'init') {
    if (args.length !== 3 || args[1] !== '--root' || !args[2] || args[2].startsWith('--')) { console.error('init requires --root EMPTY_DIRECTORY'); return 2; }
    try { const { initProject } = await import('../../packages/onboarding/init.ts'); await initProject(args[2]); console.log('Initialized agent project. Run agentci validate --root DIRECTORY.'); return 0; } catch (error) { console.error(error instanceof Error ? error.message : 'Initialization failed'); return 2; }
  }
  if (args[0] === 'setup') {
    if (args.length !== 1) { console.error('setup uses AGENTCI_SETUP_* environment variables'); return 2; }
    try { const { startAppSetup } = await import('../../packages/onboarding/setup.ts'); await startAppSetup(); return 0; } catch (error) { console.error(error instanceof Error ? error.message : 'Setup failed'); return 2; }
  }
  if (args[0] === 'diff') {
    const options: Record<string, string> = {};
    for (let i = 1; i < args.length; i += 2) {
      const name = args[i], value = args[i + 1];
      if (!name || !['--base', '--head', '--repository', '--root'].includes(name) || !value || value.startsWith('--') || options[name]) { console.error('Invalid diff arguments'); return 2; }
      options[name] = value;
    }
    if (!options['--base'] || !options['--head'] || !options['--repository']) { console.error('diff requires --base, --head and --repository'); return 2; }
    try {
      const root = options['--root'] ?? process.cwd();
      const base = await gitSnapshot(root, options['--base']);
      const head = await gitSnapshot(root, options['--head']);
      console.log(JSON.stringify(analyze({ repository: options['--repository'], base, head }), null, 2));
      return 0;
    } catch (error) { console.error(`Review infrastructure/input failure: ${error instanceof Error ? error.message : 'unknown'}`); return 2; }
  }
  if (args[0] !== 'validate') {
    console.error(`Command ${args[0]} is not implemented in this build. Run --help.`); return 2;
  }
  let root = process.cwd();
  let json = false;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--json') json = true;
    else if (args[i] === '--root' && args[i + 1] && !args[i + 1]!.startsWith('--')) root = args[++i]!;
    else { console.error(`Invalid argument: ${args[i]}`); return 2; }
  }
  const result = await validateProject(root);
  if (json) console.log(JSON.stringify(result, null, 2));
  else if (result.valid) console.log(`Valid project: ${result.files} data files, ${result.requirements} explicit requirements. M0 validation only.`);
  else for (const error of result.errors) console.error(`${error.file}: ${error.message}`);
  return result.valid ? 0 : 1;
}

main(process.argv.slice(2)).then(code => { process.exitCode = code; }).catch(() => {
  console.error('Validation infrastructure failure'); process.exitCode = 2;
});
