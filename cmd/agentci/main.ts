#!/usr/bin/env node
import { validateProject } from '../../packages/project/index.ts';
import { gitSnapshot } from '../../packages/review/git.ts';
import { analyze } from '../../packages/review/engine.ts';
import { VERSION } from '../../packages/version.ts';

const help = `AgentCI v0.1.0-m0 — M0 contracts
Installed usage: agentci validate [--root DIRECTORY] [--json]
Usage: npm run agentci -- validate [--root DIRECTORY] [--json]
       npm run agentci -- --help
       npm run agentci -- --version

validate  Validate agentci.yaml and explicit requirements; parse eval YAML.
diff --base REF --head REF --repository OWNER/REPO [--root DIRECTORY]
  Produce deterministic advisory analysis of tracked immutable Git snapshots.
Future milestones: init, eval, review, evidence, replay, repair.
`;

export async function main(args: string[]): Promise<number> {
  if (!args.length || args[0] === '--help' || args[0] === 'help') { console.log(help); return 0; }
  if (args[0] === '--version') { console.log(VERSION); return 0; }
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
