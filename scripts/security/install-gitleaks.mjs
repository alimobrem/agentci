import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, chmod, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
export const version = '8.30.1';
export const archiveSha256 = '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb';
export const binarySha256 = '88f91962aa2f93ac6ab281d553b9e125f5197bbbce38f9f2437f7299c32e5509';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export async function installGitleaks(cache) {
  if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('Scanner preparation supports Linux x64 only');
  const directory = resolve(cache); await mkdir(directory, { recursive: true, mode: 0o700 });
  const archive = join(directory, 'gitleaks.tar.gz');
  let bytes;
  try { if ((await stat(archive)).size > 20_000_000) throw new Error('Scanner archive exceeds bound'); bytes = await readFile(archive); } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Scanner cache unavailable');
    const response = await fetch(`https://github.com/gitleaks/gitleaks/releases/download/v${version}/gitleaks_${version}_linux_x64.tar.gz`, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error('Scanner official download failed');
    const chunks = []; let length = 0;
    for await (const chunk of response.body) {
      length += chunk.length; if (length > 20_000_000) throw new Error('Scanner archive exceeds bound'); chunks.push(chunk);
    }
    bytes = Buffer.concat(chunks);
    if (sha256(bytes) !== archiveSha256) throw new Error('Scanner archive integrity failure');
    await writeFile(archive, bytes, { mode: 0o600 });
  }
  if (sha256(bytes) !== archiveSha256) throw new Error('Scanner archive integrity failure');
  execFileSync('tar', ['-xzf', archive, '-C', directory, 'gitleaks'], { timeout: 30_000, stdio: 'ignore', env: { PATH: process.env.PATH, HOME: '/nonexistent', LANG: 'C.UTF-8' } });
  const binary = join(directory, 'gitleaks');
  if (sha256(await readFile(binary)) !== binarySha256) throw new Error('Scanner binary integrity failure');
  await chmod(binary, 0o700); return binary;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await installGitleaks(process.argv[2] ?? '.agentci/local/tools/gitleaks-8.30.1'); console.log('Pinned scanner integrity verified'); }
  catch { console.error('Pinned scanner installation failed'); process.exitCode = 2; }
}
export const upstreamPolicySha256 = 'e163e53b9e7e8a8511e77271e2b323ed057759542a6d988258afe3a1fa329caf';
export async function loadUpstreamPolicy(cache) {
  const file = join(resolve(cache), 'upstream-policy.toml'); let bytes;
  try { if ((await stat(file)).size > 256_000) throw new Error('Policy exceeds bound'); bytes = await readFile(file); }
  catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Policy cache unavailable');
    const response = await fetch(`https://raw.githubusercontent.com/gitleaks/gitleaks/v${version}/config/gitleaks.toml`, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error('Official policy download failed');
    const chunks = []; let size = 0;
    for await (const chunk of response.body) { size += chunk.length; if (size > 256_000) throw new Error('Policy exceeds bound'); chunks.push(chunk); }
    bytes = Buffer.concat(chunks);
    if (sha256(bytes) !== upstreamPolicySha256) throw new Error('Upstream policy integrity failure');
    await writeFile(file, bytes, { mode: 0o600 });
  }
  if (sha256(bytes) !== upstreamPolicySha256) throw new Error('Upstream policy integrity failure');
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
}
