import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Snapshot } from './types.ts';
const exec = promisify(execFile);
/** Resolve refs to immutable commits and read tracked blobs; never checkout or execute PR code. */
export async function gitSnapshot(root: string, ref: string): Promise<Snapshot> {
  if (!ref || ref.startsWith('-') || !/^[A-Za-z0-9_./~^@{}+-]+$/.test(ref)) throw new Error('Unsafe Git ref');
  const run = async (args: string[], maxBuffer = 4 * 1024 * 1024) => (await exec('git', ['--no-replace-objects', '-c', 'core.hooksPath=/dev/null', '-C', root, ...args], { maxBuffer, timeout: 30_000 })).stdout;
  const sha = (await run(['rev-parse', '--verify', `${ref}^{commit}`])).trim();
  const entries = (await run(['ls-tree', '-r', '-z', sha])).split('\0').filter(Boolean);
  if (entries.length > 10_000) throw new Error('Tree exceeds 10000 files');
  const files: Record<string, string> = Object.create(null);
  let total = 0;
  for (const entry of entries) {
    const match = /^(\d+) (\w+) ([a-f0-9]+)\t([\s\S]+)$/.exec(entry);
    if (!match || match[2] !== 'blob' || !['100644', '100755'].includes(match[1]!)) throw new Error('Symlinks and submodules are not supported in reviewed trees');
    const size = Number((await run(['cat-file', '-s', match[3]!])).trim());
    total += size;
    if (size > 2 * 1024 * 1024 || total > 32 * 1024 * 1024) throw new Error('Snapshot exceeds content limits');
    const text = await run(['cat-file', 'blob', match[3]!]);
    if (text.includes('\0')) throw new Error('Binary files are not supported in this review candidate');
    files[match[4]!] = text;
  }
  return { sha, files };
}
