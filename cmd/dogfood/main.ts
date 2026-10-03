import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Pool } from 'pg';
import { Client, Connection } from '@temporalio/client';
import { NativeConnection, Worker } from '@temporalio/worker';
import { installationClient, currentPullRequest, publishCheck } from '../../packages/github/client.ts';
import { artifactUrl, verifyExport } from '../../packages/github/dogfood.ts';
import type { ReviewJob } from '../../packages/github/webhook.ts';
import { Store, type EvidenceRecord } from '../../packages/storage/postgres.ts';
import { createActivities } from '../../apps/worker/activities.ts';
import { VERSION } from '../../packages/version.ts';
const repository = process.env.AGENTCI_REPOSITORY;
if (repository !== 'alimobrem/agentci' || process.env.GITHUB_REPOSITORY !== repository) throw new Error('Dogfood runner is restricted to alimobrem/agentci');
const appId = Number(process.env.GITHUB_APP_ID), installationId = Number(process.env.GITHUB_INSTALLATION_ID);
if (!Number.isSafeInteger(appId) || appId < 1 || !Number.isSafeInteger(installationId) || installationId < 1) throw new Error('Invalid App identity');
const github = installationClient(appId, installationId, await readFile(process.env.GITHUB_PRIVATE_KEY_FILE!, 'utf8'));
const [owner, repo] = repository.split('/') as [string, string];
const output = '.agentci/artifacts/dogfood';
interface Export { job: ReviewJob; record: EvidenceRecord }
if (process.argv[2] === 'publish') {
  // This step only runs after the official upload-artifact action succeeds.
  const url = artifactUrl(process.env.AGENTCI_ARTIFACT_URL!, repository);
  const report = JSON.parse(await readFile(`${output}/reviews.json`, 'utf8')) as { version: string; reviews: Export[] };
  if (report.version !== VERSION) throw new Error('Review producer version mismatch');
  for (const { job, record } of report.reviews) {
    verifyExport(job, record, repository, installationId);
    if (await currentPullRequest(github, job)) await publishCheck(github, appId, job, record.analysis, url);
  }
  console.log(`Published ${report.reviews.length} advisory review candidates; stale heads are skipped.`);
} else if (process.argv[2] === 'prepare') {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000, query_timeout: 10_000 });
  const connection = await Connection.connect({ address: process.env.TEMPORAL_ADDRESS });
  const native = await NativeConnection.connect({ address: process.env.TEMPORAL_ADDRESS });
  const client = new Client({ connection });
  const store = new Store(pool, '00000000-0000-4000-8000-000000000001', repository);
  await pool.query(await readFile('deploy/migrations/001_m1.sql', 'utf8'));
  await store.ready(); await mkdir(output, { recursive: true });
  const reviews: Export[] = [];
  const activities = createActivities(github, store, { appId, installationId, repository, publicUrl: 'https://github.com' });
  const queue = `agentci-hosted-${randomUUID()}`;
  const worker = await Worker.create({ connection: native, taskQueue: queue,
    workflowsPath: fileURLToPath(new URL('../../apps/worker/workflows.js', import.meta.url)),
    activities: { ...activities, publish: async (job: ReviewJob, id: string) => {
      const record = await store.evidence(id); if (!record) throw new Error('Missing evidence');
      verifyExport(job, record, repository, installationId);
      if (!await currentPullRequest(github, job)) return 'superseded';
      reviews.push({ job, record }); return 'published';
    } } });
  const running = worker.run();
  let failed = false;
  try {
    // Always reconcile all open PRs, including base-branch changes and missed events.
    const prs = await github.paginate(github.pulls.list, { owner, repo, state: 'open', per_page: 100 });
    for (const pr of prs) {
      const { data } = await github.pulls.get({ owner, repo, pull_number: pr.number });
      if (data.state !== 'open') continue;
      const job = { repository, installationId, pullRequest: data.number, baseSha: data.base.sha, headSha: data.head.sha };
      try {
        const handle = await client.workflow.start('reviewPullRequest', { args: [job], workflowId: randomUUID(), taskQueue: queue });
        await handle.result();
        await writeFile(`${output}/pr-${pr.number}-history.json`, JSON.stringify(await handle.fetchHistory()) + '\n');
      } catch { failed = true; console.error(`PR ${pr.number}: review failed; no neutral Check will be published for this review.`); }
    }
  } finally {
    await writeFile(`${output}/reviews.json`, JSON.stringify({ version: VERSION, sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), reviews, failed }, null, 2) + '\n');
    worker.shutdown(); await running; await native.close(); await connection.close(); await pool.end();
  }
  if (failed) process.exitCode = 1;
} else throw new Error('Use prepare or publish');
