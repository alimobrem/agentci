import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { createHash } from 'node:crypto';
import type { Analysis, Snapshot } from '../review/types.ts';
import type { ReviewJob } from './webhook.ts';
export function installationClient(appId: number, installationId: number, privateKey: string): Octokit {
  return new Octokit({ authStrategy: createAppAuth, auth: { appId, installationId, privateKey }, request: { timeout: 30_000 } });
}
const names = (repository: string) => { const [owner, repo] = repository.split('/'); if (!owner || !repo) throw new Error('Invalid repository'); return { owner, repo }; };
export async function currentPullRequest(client: Octokit, job: ReviewJob): Promise<boolean> {
  const { data } = await client.pulls.get({ ...names(job.repository), pull_number: job.pullRequest });
  return data.state === 'open' && data.base.sha === job.baseSha && data.head.sha === job.headSha;
}
interface VerifiedBlobCache { blobs: Map<string,{text:string;bytes:number}>; bytes:number; maxBytes:number; maxEntries:number }
/** Scoped to one authenticated client lifetime; trees/authorization are never cached. */
export function createRemoteSnapshotReader(client:Octokit,limits:{maxBytes?:number;maxEntries?:number}={}) {
  const maxBytes=limits.maxBytes??64*1024*1024,maxEntries=limits.maxEntries??10_000;
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>64*1024*1024||!Number.isSafeInteger(maxEntries)||maxEntries<1||maxEntries>10_000)throw new Error('Invalid snapshot cache bounds');
  const cache:VerifiedBlobCache={blobs:new Map(),bytes:0,maxBytes,maxEntries};
  return (repository:string,sha:string)=>readRemoteSnapshot(client,repository,sha,cache);
}
export async function remoteSnapshot(client: Octokit, repository: string, sha: string): Promise<Snapshot> {
  return readRemoteSnapshot(client,repository,sha);
}
async function readRemoteSnapshot(client:Octokit,repository:string,sha:string,cache?:VerifiedBlobCache):Promise<Snapshot> {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Exact SHA required');
  const repo = names(repository);
  const { data: commit } = await client.git.getCommit({ ...repo, commit_sha: sha });
  if (commit.sha !== sha) throw new Error('Commit identity mismatch');
  const { data } = await client.git.getTree({ ...repo, tree_sha: commit.tree.sha, recursive: 'true' });
  if (data.sha !== commit.tree.sha) throw new Error('Tree identity mismatch');
  if (data.truncated || data.tree.length > 10_000) throw new Error('Repository tree exceeds review limits');
  const files: Record<string, string> = Object.create(null);
  let total = 0;
  for (const entry of data.tree) {
    if (entry.type === 'tree') continue;
    if (entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode ?? '') || !entry.path || !entry.sha || entry.size === undefined) throw new Error('Unsupported Git tree entry');
    total += entry.size;
    if (entry.size > 2 * 1024 * 1024 || total > 32 * 1024 * 1024) throw new Error('Repository content exceeds review limits');
    const cacheKey=repository+'\0'+entry.sha,cached=cache?.blobs.get(cacheKey);
    if(cached){
      if(cached.bytes!==entry.size)throw new Error('Mismatched cached blob size');
      cache!.blobs.delete(cacheKey);cache!.blobs.set(cacheKey,cached);
      files[entry.path]=cached.text;continue;
    }
    const { data: blob } = await client.git.getBlob({ ...repo, file_sha: entry.sha });
    if (blob.encoding !== 'base64') throw new Error('Unsupported blob encoding');
    const bytes = Buffer.from(blob.content.replaceAll('\n', ''), 'base64');
    const blobSha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    if (blob.sha !== entry.sha || blobSha !== entry.sha || bytes.length !== entry.size || bytes.includes(0)) throw new Error('Binary files or mismatched blobs are not supported in this candidate');
    const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    files[entry.path]=text;
    if(cache&&bytes.length<=cache.maxBytes){
      // Another activity may have populated the same immutable blob while this fetch awaited.
      const previous=cache.blobs.get(cacheKey);if(previous){cache.bytes-=previous.bytes;cache.blobs.delete(cacheKey);}
      while(cache.blobs.size>=cache.maxEntries||cache.bytes+bytes.length>cache.maxBytes){
        const oldest=cache.blobs.keys().next().value!;cache.bytes-=cache.blobs.get(oldest)!.bytes;cache.blobs.delete(oldest);
      }
      cache.blobs.set(cacheKey,{text,bytes:bytes.length});cache.bytes+=bytes.length;
    }
  }
  return { sha, files };
}
export async function publishCheck(client: Octokit, appId: number, job: ReviewJob, analysis: Analysis, evidenceUrl: string, behavioralCheck?: 'agentci/evals'): Promise<'published'|'superseded'> {
  // Reconcile by external_id on retry instead of creating another check after an ambiguous timeout.
  const externalId = `agentci:${job.pullRequest}:${job.baseSha}:${job.headSha}`;
  const listed = await client.paginate(client.checks.listForRef, { ...names(job.repository), ref: job.headSha, check_name: 'agentci/review', filter: 'all', per_page: 100 });
  const existing = listed.find(run => run.external_id === externalId && run.app?.id === appId);
  const markdown = (value: string) => value.replace(/[\\`*_{}\[\]()<>#!]/g, '\\$&');
  const lines = [
    `Advisory deterministic review. Risk: **${analysis.risk}**.`,
    `Base: ${analysis.baseSha}; head: ${analysis.headSha}.`,
    `Changed files: ${analysis.changes.length}. ${behavioralCheck ? 'Semantic analysis only; behavioral results are reported separately in agentci/evals.' : 'Behavioral evals: not applicable in M1.'}`,
    ...analysis.changes.map(change => `- ${markdown(change.path)}: ${change.categories.join(', ')}`),
    ...analysis.findings.map(finding => `- ${finding.severity} / ${finding.verification}: ${finding.claim}`),
  ].join('\n');
  const summary = `${lines.slice(0, 58_000)}${lines.length > 58_000 ? '\nSummary abbreviated; full analysis is in the evidence record.' : ''}\n[Detailed evidence](${evidenceUrl})`;
  const params = { ...names(job.repository), name: 'agentci/review', head_sha: job.headSha, external_id: externalId,
    status: 'completed' as const, conclusion: 'neutral' as const, details_url: evidenceUrl,
    output: { title: `AgentCI advisory: ${analysis.risk} risk`, summary } };
  if (behavioralCheck && !await currentPullRequest(client, job)) return 'superseded';
  if (existing) await client.checks.update({ ...params, check_run_id: existing.id });
  else await client.checks.create(params);
  return 'published';
}
export async function publishFailure(client: Octokit, appId: number, job: ReviewJob): Promise<void> {
  const externalId = `agentci:${job.pullRequest}:${job.baseSha}:${job.headSha}`;
  const listed = await client.paginate(client.checks.listForRef, { ...names(job.repository), ref: job.headSha, check_name: 'agentci/review', filter: 'all', per_page: 100 });
  const existing = listed.find(run => run.external_id === externalId && run.app?.id === appId);
  const params = { ...names(job.repository), name: 'agentci/review', head_sha: job.headSha, external_id: externalId,
    status: 'completed' as const, conclusion: 'action_required' as const,
    output: { title: 'AgentCI review unavailable', summary: 'Verification infrastructure/input failure after retries. No clean or successful review is claimed. Operator recovery and webhook redelivery are required.' } };
  if (existing) await client.checks.update({ ...params, check_run_id: existing.id });
  else await client.checks.create(params);
}
