import {once} from 'node:events';
import {open, constants} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {ModelReviewClient, type ModelReviewClientOptions} from '../../packages/client/model-review.ts';
import {AgentCIError} from '../../packages/client/index.ts';
import {validateReviewAdmission} from '../../packages/reviewers/admission.ts';

async function file(path: string, maximum: number, privateOnly: boolean): Promise<string> {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maximum || privateOnly && (stat.mode & 0o077)) throw Error();
    const buffer = Buffer.alloc(maximum + 1); let total = 0;
    while (total <= maximum) {const {bytesRead} = await handle.read(buffer, total, buffer.length - total, null); if (!bytesRead) break; total += bytesRead;}
    if (total > maximum) throw Error();
    return new TextDecoder('utf-8', {fatal: true}).decode(buffer.subarray(0, total));
  } catch {throw new AgentCIError(privateOnly ? 'invalid-private-config' : 'invalid-request-file');}
  finally {await handle?.close();}
}

/** CLI credential files are operator-owned, never repository configuration. */
export async function loadModelReviewClientConfig(path: string | undefined, env: NodeJS.ProcessEnv = process.env): Promise<ModelReviewClientOptions> {
  if (path === undefined) return {url: env.AGENTCI_API_URL ?? '', readToken: env.AGENTCI_EVIDENCE_TOKEN, operatorToken: env.AGENTCI_OPERATOR_TOKEN};
  let value: any;
  try {value = JSON.parse(await file(path, 16384, true));} catch {throw new AgentCIError('invalid-private-config');}
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.url !== 'string' ||
    Object.keys(value).some(key => !['url', 'readTokenFile', 'operatorTokenFile', 'timeoutMs'].includes(key)) ||
    !['readTokenFile', 'operatorTokenFile'].some(key => typeof value[key] === 'string') ||
    ['readTokenFile', 'operatorTokenFile'].some(key => value[key] !== undefined && (typeof value[key] !== 'string' || !value[key])))
    throw new AgentCIError('invalid-private-config');
  const base = dirname(resolve(path));
  const token = async (name: string) => value[name] === undefined ? undefined : (await file(resolve(base, value[name]), 16384, true)).replace(/\r?\n$/, '');
  return {url: value.url, readToken: await token('readTokenFile'), operatorToken: await token('operatorTokenFile'), timeoutMs: value.timeoutMs};
}

export async function loadModelReviewRequest(path: string) {
  try {return validateReviewAdmission(JSON.parse(await file(path, 4096, false)));}
  catch (error) {if (error instanceof AgentCIError) throw error; throw new AgentCIError('invalid-request');}
}

export async function modelReviewCommand(args: string[]): Promise<number> {
  if (args.length === 1 && ['--help', '-h'].includes(args[0]!)) {
    console.log(`Usage: agentci model-review profiles [--config PRIVATE_JSON]
       agentci model-review submit --request ADMISSION_JSON [--config PRIVATE_JSON]
       agentci model-review show --request ADMISSION_JSON [--config PRIVATE_JSON]
       agentci model-review cancel --request ADMISSION_JSON [--config PRIVATE_JSON]
       agentci model-review export --request ADMISSION_JSON [--config PRIVATE_JSON]
       agentci model-review findings --request ADMISSION_JSON [--limit PAGE_SIZE] [--config PRIVATE_JSON]

profiles  List safe configured profile descriptors; this does not prove readiness.
submit    Durably admit the exact request; retry ambiguous outcomes with the same file.
show      Verify status against the original request identity and digest.
cancel    Verify identity, then record cancellation intent; stopping/refunds are not guaranteed.
export    Stream provisional records; only final complete certificate and exit 0 certify a download.
findings  Fetch complete original-summary finding references across bounded pages.

Keep the original admission JSON: submit/show/cancel/findings/export require --request.
Credentials come from private 0600 config/token files, or AGENTCI_API_URL with
AGENTCI_EVIDENCE_TOKEN for reads and AGENTCI_OPERATOR_TOKEN for mutations.
The operator token also permits reads. Tokens must differ; never pass tokens in argv.
Exit 0 means the operation succeeded, not that a review passed; errors exit 2.
Use agentci finding --help for current findings and history. Use finding reproduction-status/cancel-reproduction for retained work. New reservation remains pending.`);
    return 0;
  }
  try {
    const [command, ...flags] = args;
    if (!command || !['submit', 'show', 'cancel', 'profiles', 'findings', 'export'].includes(command)) throw new AgentCIError('invalid-model-review-arguments');
    const options: Record<string, string> = {};
    for (let i = 0; i < flags.length; i += 2) {
      const name = flags[i], value = flags[i + 1];
      if (!name || !['--config', '--request', ...(command === 'findings' ? ['--limit'] : [])].includes(name) || !value || value.startsWith('--') || Object.hasOwn(options, name)) throw new AgentCIError('invalid-model-review-arguments');
      options[name] = value;
    }
    if ((command === 'profiles') === Boolean(options['--request'])) throw new AgentCIError('invalid-model-review-arguments');
    if (options['--limit'] !== undefined && (!/^[1-9][0-9]*$/.test(options['--limit']) || Number(options['--limit']) > 100)) throw new AgentCIError('invalid-model-review-arguments');
    const client = new ModelReviewClient(await loadModelReviewClientConfig(options['--config']));
    if (command === 'profiles') {console.log(JSON.stringify(await client.profiles())); return 0;}
    const request = await loadModelReviewRequest(options['--request']!);
    if (command === 'export') {
      const signal = AbortSignal.timeout(120000);
      try {
        for await (const record of client.modelReviewExport(request, {signal})) {
          signal.throwIfAborted();
          if (!process.stdout.write(JSON.stringify(record) + '\n')) await once(process.stdout, 'drain', {signal});
        }
      } catch (error) {
        if (signal.aborted) {
          // An unread pipe can keep Node alive even after exitCode is set.
          // Drop pending provisional output when the shared deadline expires.
          process.stdout.destroy();
          // Node's special stdout stream may retain an OS write even after
          // destroy(). Bound stderr flushing, then terminate the CLI so a
          // nonreading consumer cannot keep it alive past cancellation.
          await new Promise<never>(() => {
            const finish = () => process.exit(2);
            setTimeout(finish, 100);
            try {process.stderr.write(JSON.stringify({error: {code: 'transport-failure'}}) + '\n', finish);}
            catch {finish();}
          });
        }
        throw error;
      }
      return 0;
    }
    if (command === 'findings') {console.log(JSON.stringify(await client.findings(request, {limit: options['--limit'] ? Number(options['--limit']) : undefined}))); return 0;}
    const result = command === 'submit' ? await client.submit(request) : command === 'show' ? await client.show(request) : await client.cancel(request);
    console.log(JSON.stringify(result)); return 0;
  } catch (error) {
    console.error(JSON.stringify({error: {code: error instanceof AgentCIError ? error.code : 'model-review-unavailable'}}));
    return 2;
  }
}
