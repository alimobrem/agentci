import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import {observeGitHubFailures} from './failure-diagnostics.ts';
import type {GitBlobSeed} from './git-object-seed.ts';
import {GitHubRateLimitWait,guardGitHubRateLimits} from './rate-limit.ts';
import { createHash } from 'node:crypto';
import type { Analysis, Snapshot } from '../review/types.ts';
import type { ReviewJob } from './webhook.ts';
export function installationClient(appId: number, installationId: number, privateKey: string): Octokit {
  const client = new Octokit({ authStrategy: createAppAuth, auth: { appId, installationId, privateKey }, request: { timeout: 30_000 } });
  guardGitHubRateLimits(client);
  observeGitHubFailures(client, diagnostic => console.warn(JSON.stringify(diagnostic)));
  return client;
}
const names = (repository: string) => { const [owner, repo] = repository.split('/'); if (!owner || !repo) throw new Error('Invalid repository'); return { owner, repo }; };
export async function currentPullRequest(client: Octokit, job: ReviewJob): Promise<boolean> {
  const { data } = await client.pulls.get({ ...names(job.repository), pull_number: job.pullRequest });
  return data.state === 'open' && data.base.sha === job.baseSha && data.head.sha === job.headSha;
}
export interface SnapshotReadMetrics {commitAttempts:number;treeAttempts:number;memoryHits:number;localHits:number;localMisses:number;remoteBlobAttempts:number;remoteHits:number;requestFailures:number;localCooldownBlocks:number;localReadFailures:number;verificationFailures:number}
interface VerifiedBlobCache { blobs: Map<string,{text:string;bytes:number}>; bytes:number; maxBytes:number; maxEntries:number }
/** Scoped to one authenticated client lifetime; trees/authorization are never cached. */
export function createRemoteSnapshotReader(client:Octokit,limits:{maxBytes?:number;maxEntries?:number;seed?:GitBlobSeed;seedTimeoutMs?:number}={}) {
  const maxBytes=limits.maxBytes??64*1024*1024,maxEntries=limits.maxEntries??10_000;
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>64*1024*1024||!Number.isSafeInteger(maxEntries)||maxEntries<1||maxEntries>10_000)throw new Error('Invalid snapshot cache bounds');
  const seedTimeoutMs=limits.seedTimeoutMs??40000;
  if(!Number.isSafeInteger(seedTimeoutMs)||seedTimeoutMs<1||seedTimeoutMs>40000||limits.seedTimeoutMs!==undefined&&!limits.seed)throw Error('Invalid seed timeout');
  const cache:VerifiedBlobCache={blobs:new Map(),bytes:0,maxBytes,maxEntries};
  const metrics:SnapshotReadMetrics={commitAttempts:0,treeAttempts:0,memoryHits:0,localHits:0,localMisses:0,remoteBlobAttempts:0,remoteHits:0,requestFailures:0,localCooldownBlocks:0,localReadFailures:0,verificationFailures:0};
  return Object.assign((repository:string,sha:string)=>readRemoteSnapshot(client,repository,sha,cache,limits.seed,metrics,seedTimeoutMs),{metrics:()=>({...metrics})});
}
export async function remoteSnapshot(client: Octokit, repository: string, sha: string): Promise<Snapshot> {
  return readRemoteSnapshot(client,repository,sha);
}
async function readRemoteSnapshot(client:Octokit,repository:string,sha:string,cache?:VerifiedBlobCache,seed?:GitBlobSeed,metrics?:SnapshotReadMetrics,seedTimeoutMs=40000):Promise<Snapshot> {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Exact SHA required');
  if(seed&&seed.repository!==repository)throw Error('Seed repository mismatch');
  const request=async<T>(kind:'commitAttempts'|'treeAttempts'|'remoteBlobAttempts',call:()=>Promise<T>):Promise<T>=>{
    if(metrics)metrics[kind]++;try{return await call();}catch(error){if(metrics)metrics[error instanceof GitHubRateLimitWait?'localCooldownBlocks':'requestFailures']++;throw error;}
  };
  const repo = names(repository);
  const { data: commit } = await request('commitAttempts',()=>client.git.getCommit({ ...repo, commit_sha: sha }));
  if (commit.sha !== sha) throw new Error('Commit identity mismatch');
  const { data } = await request('treeAttempts',()=>client.git.getTree({ ...repo, tree_sha: commit.tree.sha, recursive: 'true' }));
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
      if(metrics)metrics.memoryHits++;files[entry.path]=cached.text;continue;
    }
    let bytes:Buffer|undefined,local=false;
    if(seed){let timer:ReturnType<typeof setTimeout>|undefined;
      try{bytes=await Promise.race([Promise.resolve().then(()=>seed.read(entry.sha!,entry.size!)),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Local seed deadline exceeded')),seedTimeoutMs);})]);}
      catch(error){if(metrics)metrics.localReadFailures++;throw error;}finally{clearTimeout(timer);}
    }
    if(bytes!==undefined)local=true;else{
      if(seed&&metrics)metrics.localMisses++;
      const {data:blob}=await request('remoteBlobAttempts',()=>client.git.getBlob({...repo,file_sha:entry.sha!}));
      if(blob.encoding!=='base64'||blob.sha!==entry.sha){if(metrics)metrics.verificationFailures++;throw Error('Unsupported encoding or mismatched blob');}
      bytes=Buffer.from(blob.content.replaceAll('\n',''),'base64');
    }
    let text:string;
    try{
      if(!Buffer.isBuffer(bytes)||bytes.length!==entry.size||bytes.includes(0))throw Error('Binary files or mismatched blobs are not supported in this candidate');
      const blobSha=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
      if(blobSha!==entry.sha)throw Error('Binary files or mismatched blobs are not supported in this candidate');
      text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    }catch(error){if(metrics)metrics.verificationFailures++;throw error;}
    if(metrics)metrics[local?'localHits':'remoteHits']++;
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
