import { mkdir, readFile, writeFile, access, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
const archives = {
  'darwin-arm64': ['darwin_arm64', 'aba9ced2dee8d27fecca3dc7feb1a7f9a52caefa1eb46f3271ea66b6e0e6953f'],
  'darwin-x64': ['darwin_amd64', '5b44c3bc2255115c9b69e30efc0fecdf498fdb63c5d58e17084fd5f16324c644'],
  'linux-x64': ['linux_amd64', '8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8'],
  'linux-arm64': ['linux_arm64', '325e971b6ba9bfa504672e29be93c24981eeb1c07576d730e9f7c8805afff0c6'],
};
const entry = archives[`${process.platform}-${process.arch}`];
if (!entry) throw new Error('Unsupported actionlint platform');
const directory = resolve('.agentci/local/tools/actionlint-1.7.12');
await mkdir(directory, { recursive: true }); const archive = join(directory, 'release.tgz');
try { await access(archive); } catch {
  const response = await fetch(`https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_${entry[0]}.tar.gz`, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error('actionlint download failed');
  await writeFile(archive, Buffer.from(await response.arrayBuffer()));
}
if (createHash('sha256').update(await readFile(archive)).digest('hex') !== entry[1]) throw new Error('actionlint checksum mismatch');
execFileSync('tar', ['-xzf', archive, '-C', directory, 'actionlint']);
const lint = args => spawnSync(join(directory, 'actionlint'), ['-shellcheck=', '-pyflakes=', ...args], { encoding: 'utf8', timeout: 30_000 });
const result = lint([]);
if (result.status !== 0) throw new Error(result.stdout + result.stderr);
const temp = await mkdtemp(join(tmpdir(), 'agentci-workflow-regression-'));
try {
  const path = join(temp, 'invalid.yaml');
  await writeFile(path, 'on: push\njobs:\n  review:\n    runs-on: ubuntu-latest\n    env:\n      KEY: ${{ runner.temp }}\n    steps:\n      - run: echo hello\n');
  const negative = lint([path]);
  if (negative.status === 0 || !negative.stdout.includes('runner')) throw new Error('Invalid job-level runner context was not rejected');
} finally { await rm(temp, { recursive: true, force: true }); }
console.log('Workflow contexts validated; invalid runner context regression rejected. Shell/Python lint are separate checks.');
