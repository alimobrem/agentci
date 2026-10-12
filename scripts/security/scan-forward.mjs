import { mkdtemp, mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installGitleaks, loadUpstreamPolicy, sha256, version, binarySha256, upstreamPolicySha256 } from './install-gitleaks.mjs';
const env = { PATH: process.env.PATH, HOME: '/nonexistent', LANG: 'C.UTF-8', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0', GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1' };
const decode = bytes => new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
const exactSha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value) && !/^0+$/.test(value);
export async function scanForward({ repo, base, head, cache, output }) {
  await rm(output, { force: true });
  if (!exactSha(base) || !exactSha(head)) throw new Error('Exact commit identities required');
  const deadline = performance.now() + 240_000;
  const remaining = () => { const ms = Math.floor(deadline - performance.now()); if (ms <= 0) throw new Error('Coverage deadline exceeded'); return ms; };
  const git = args => execFileSync('git', ['-C', resolve(repo), ...args], { env, timeout: Math.min(60_000, remaining()), maxBuffer: 128_000_000 });
  if (decode(git(['rev-parse', '--is-shallow-repository'])).trim() !== 'false') throw new Error('Shallow coverage unsupported');
  for (const commit of [base, head]) if (decode(git(['cat-file', '-t', commit])).trim() !== 'commit') throw new Error('Missing commit coverage');
  if (decode(git(['rev-parse', 'HEAD'])).trim() !== head) throw new Error('Subject HEAD mismatch');
  const trees = new Map(); let entries = 0;
  const tree = commit => {
    if (trees.has(commit)) return trees.get(commit);
    const result = new Map();
    for (const entry of decode(git(['ls-tree', '-rz', '--full-tree', commit])).split('\0').filter(Boolean)) {
      const m = /^(\d+) (blob|commit) ([a-f0-9]{40})\t(.+)$/.exec(entry);
      if (!m) throw new Error('Unsupported tree coverage');
      const [, mode, type, blob, path] = m;
      if (path.startsWith('/') || path.split('/').some(p => !p || p === '.' || p === '..' || p === '.git' || p.includes('\uFEFF')) || result.has(path)) throw new Error('Unsupported path identity');
      if (++entries > 5_000_000) throw new Error('Tree coverage bound exceeded');
      result.set(path, { mode, type, blob });
    }
    trees.set(commit, result); return result;
  };
  const same = (a,b) => a && a.type === b.type && a.mode === b.mode && a.blob === b.blob;
  const graphText = decode(git(['rev-list', '--parents', '--topo-order', '--reverse', head, `^${base}`])).trim();
  const graph = graphText ? graphText.split('\n').map(line => line.split(' ')) : [];
  if (graph.length > 10_000 || graph.flat().some(c => !exactSha(c))) throw new Error('Commit range coverage bound exceeded');
  const selected = new Map(); let refs = 0;
  const introduce = (commit, path, entry) => {
    if (entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode)) throw new Error('Introduced symlink or submodule unsupported');
    if (!selected.has(entry.blob)) selected.set(entry.blob, new Map());
    const key = `${commit}\0${path}`; const paths = selected.get(entry.blob);
    if (!paths.has(key)) { if (++refs > 100_000) throw new Error('Changed reference bound exceeded'); paths.set(key, { commit, path }); }
  };
  for (const [commit, ...parents] of graph) {
    const parentTrees = parents.map(tree);
    for (const [path, entry] of tree(commit)) if (!parents.length || parentTrees.some(parent => !same(parent.get(path), entry))) introduce(commit, path, entry);
  }
  const baseTree = tree(base);
  for (const [path, entry] of tree(head)) if (!same(baseTree.get(path), entry)) introduce(head, path, entry);
  const temp = await mkdtemp(join(tmpdir(), 'agentci-forward-'));
  try {
    const binary = await installGitleaks(cache); const upstream = await loadUpstreamPolicy(cache);
    const globalPaths = /\npaths = \[\n[\s\S]*?\n\]/; if (!globalPaths.test(upstream)) throw new Error('Policy structure changed');
    const policy = upstream.replace(globalPaths, '\npaths = []') + '\n' + await readFile(new URL('./gitleaks.toml', import.meta.url), 'utf8');
    const trustedPolicy = join(temp, 'policy.toml'); await writeFile(trustedPolicy, policy, { mode: 0o600 });
    const snapshot = join(temp, 'blobs'); await mkdir(snapshot, { mode: 0o700 }); let total = 0;
    for (const [blob] of selected) {
      const bytes = git(['cat-file', 'blob', blob]); total += bytes.length;
      if (bytes.length > 20_000_000 || total > 256_000_000) throw new Error('Blob coverage bound exceeded');
      await writeFile(join(snapshot, blob), bytes, { flag: 'wx', mode: 0o600 });
    }
    const ignore = join(temp, '.gitleaksignore'); await writeFile(ignore, '', { mode: 0o600 });
    const rawReport = join(temp, 'raw.json');
    const child = spawnSync(binary, ['dir', '.', '--config', trustedPolicy, '--gitleaks-ignore-path', ignore, '--ignore-gitleaks-allow', '--redact=100', '--no-banner', '--no-color', '--exit-code', '23', '--timeout', '120', '--report-format', 'json', '--report-path', rawReport], { cwd: snapshot, env, timeout: Math.min(130_000, remaining()), maxBuffer: 8_000_000, encoding: 'utf8' });
    if (child.error || ![0,23].includes(child.status) || (await stat(rawReport)).size > 16_000_000) throw new Error('Incomplete scanner coverage');
    const raw = JSON.parse(await readFile(rawReport, 'utf8')); if (!Array.isArray(raw)) throw new Error('Invalid report');
    const findings = []; let emitted = 0;
    for (const f of raw) {
      const blob = typeof f.File === 'string' ? f.File.replace(/^\.\//, '') : null; const introductions = selected.get(blob);
      if (!introductions || typeof f.RuleID !== 'string' || !Number.isInteger(f.StartLine)) throw new Error('Unbound scanner finding');
      if ((emitted += introductions.size) > 100_000) throw new Error('Finding expansion bound exceeded');
      for (const {commit, path} of introductions.values()) findings.push({ fingerprint: sha256(JSON.stringify([f.RuleID,path,f.StartLine,commit,blob])), rule: f.RuleID, path, line: f.StartLine, commit, blob, disposition: 'unresolved' });
    }
    findings.sort((a,b) => a.fingerprint.localeCompare(b.fingerprint));
    const policyRoot = fileURLToPath(new URL('../../', import.meta.url));
    const policyCommit = decode(execFileSync('git', ['-C', policyRoot, 'rev-parse', 'HEAD'], { env, timeout: Math.min(60_000, remaining()) })).trim();
    if (!exactSha(policyCommit)) throw new Error('Trusted policy source identity unavailable');
    const harnessSha256 = sha256(await readFile(fileURLToPath(import.meta.url)));
    const report = { policyCommit, harnessSha256, schema: 'agentci-sensitive-forward-v1', baseCommit: base, headCommit: head, headTree: decode(git(['rev-parse', `${head}^{tree}`])).trim(), scannerVersion: version, binarySha256, upstreamPolicySha256, policySha256: sha256(policy), introducedCommitCount: graph.length, selectedBlobCount: selected.size, introducedReferenceCount: refs, findings, status: findings.length ? 'new-change-findings' : 'no-new-change-findings', scope: 'Introduced commits HEAD ^ BASE, parent-relative changed regular file blobs, and changed HEAD blobs vs BASE. No historical-clean assertion; deleted pre-base data and unchanged historical findings are outside this gate.' };
    await mkdir(dirname(resolve(output)), { recursive: true, mode: 0o700 }); await writeFile(output, JSON.stringify(report, null, 2)+'\n', { mode: 0o600 }); return report;
  } finally { await rm(temp, { recursive: true, force: true }); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2); const value = name => { const i=args.indexOf(name); return i<0 ? undefined : args[i+1]; };
  try { const r = await scanForward({ repo:value('--repo')??'.', base:value('--base'), head:value('--head'), cache:value('--cache')??'.agentci/local/tools/gitleaks-8.30.1', output:value('--output')??'.agentci/local/sensitive-forward/report.json' }); console.log(JSON.stringify({status:r.status,introducedCommitCount:r.introducedCommitCount,selectedBlobCount:r.selectedBlobCount,findingCount:r.findings.length})); if(r.findings.length)process.exitCode=1; }
  catch { console.error('Forward sensitive-data coverage failed'); process.exitCode=2; }
}
