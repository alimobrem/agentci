import {once} from 'node:events';
import {ModelReviewClient} from '../../packages/client/model-review.ts';
import {AgentCIError} from '../../packages/client/index.ts';
import {loadModelReviewClientConfig, loadModelReviewRequest} from './model-review.ts';

export async function findingCommand(args: string[]): Promise<number> {
  if (args.length === 1 && ['--help', '-h'].includes(args[0]!)) {
    console.log(`Usage: agentci finding show --request ADMISSION_JSON --id SHA256_ID [--version N] [--config PRIVATE_JSON]
       agentci finding history --request ADMISSION_JSON --id SHA256_ID [--limit PAGE_SIZE] [--config PRIVATE_JSON]

show     Read the current finding; --version selects an immutable historical event.
history  Stream verified JSON pages through one fixed version watermark.
         Complete history requires successful exit and a final page with nextCursor:null.

Use original admission JSON to pin review identity. Model-review findings returns
original-summary references; current dispositions may differ. --limit is 1..100.
Credentials use private 0600 config/token files or AGENTCI_API_URL and the
AGENTCI_EVIDENCE_TOKEN/AGENTCI_OPERATOR_TOKEN environment. Never pass tokens in argv.
Exit 0 means a verified read, not a confirmed defect or passing review. Errors exit 2.
Reproduction and disposition commands are not available in this slice.`);
    return 0;
  }
  try {
    const [command, ...flags] = args;
    if (!command || !['show', 'history'].includes(command)) throw new AgentCIError('invalid-finding-arguments');
    const options: Record<string, string> = {};
    for (let i = 0; i < flags.length; i += 2) {
      const name = flags[i], value = flags[i + 1];
      const allowed = ['--request', '--id', '--config', command === 'show' ? '--version' : '--limit'];
      if (!name || !allowed.includes(name) || !value || value.startsWith('--') || Object.hasOwn(options, name)) throw new AgentCIError('invalid-finding-arguments');
      options[name] = value;
    }
    if (!options['--request'] || !options['--id'] || !/^sha256:[a-f0-9]{64}$/.test(options['--id'])) throw new AgentCIError('invalid-finding-arguments');
    const numeric = options[command === 'show' ? '--version' : '--limit'];
    if (numeric !== undefined && (!/^[1-9][0-9]*$/.test(numeric) || Number(numeric) > (command === 'show' ? 10000 : 100))) throw new AgentCIError('invalid-finding-arguments');
    const client = new ModelReviewClient(await loadModelReviewClientConfig(options['--config']));
    const request = await loadModelReviewRequest(options['--request']);
    if (command === 'show') console.log(JSON.stringify(await client.finding(request, options['--id'], {version: numeric ? Number(numeric) : undefined})));
    else for await (const page of client.findingHistory(request, options['--id'], {limit: numeric ? Number(numeric) : undefined})) {
      if (!process.stdout.write(JSON.stringify(page) + '\n')) await once(process.stdout, 'drain');
    }
    return 0;
  } catch (error) {
    console.error(JSON.stringify({error: {code: error instanceof AgentCIError ? error.code : 'finding-read-unavailable'}})); return 2;
  }
}
