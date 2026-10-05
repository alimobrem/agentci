import {Pool} from 'pg';
import {NativeConnection, Worker} from '@temporalio/worker';
import {ReviewAdmissionStore} from '../../../packages/storage/review-admissions.ts';
import {ReviewDispatchStore} from '../../../packages/storage/review-dispatch.ts';
import {ReviewSummaryStore} from '../../../packages/storage/review-summaries.ts';
import {createAdmittedReviewExecution} from '../../../apps/worker/reviewer-execution.ts';
import {createAdmittedReviewActivities} from '../../../apps/worker/reviewer-activities.ts';
import type {ModelProvider} from '../../../packages/providers/types.ts';

// Separate OS process: SIGKILL must bypass every SDK and application cleanup path.
const [schema, organizationId, taskQueue, phase] = process.argv.slice(2);
if (!schema || !/^[a-z0-9_]+$/.test(schema) || !organizationId || !taskQueue || !phase) throw Error('Invalid owned fixture');
const pool = new Pool({connectionString: process.env.AGENTCI_TEST_DATABASE_URL, options: `-c search_path=${schema}`});
const scope = {organizationId, repository: 'owner/repo'};
const provider: ModelProvider = {
  id: 'fixture', upstreamIdentity: 'fixture',
  capabilities: () => ({stream: false, tools: false, structuredOutput: true, developerInstructions: false, extensions: false}),
  estimateCost: () => ({upperBoundUsdMicros: 10, pricingRevision: 'fixture', maxInputTokens: 20000, maxOutputTokens: 256}),
  async invoke(request, context) {
    await pool.query('INSERT INTO owned_provider_calls(request_id) VALUES ($1)', [request.requestId]);
    return {schemaVersion: 'v1alpha1', requestId: request.requestId, attemptId: context.attemptId,
      provider: request.provider, model: request.model, status: 'completed', text: '', structuredOutput: {findings: []},
      toolCalls: [], usage: {inputTokens: 1, outputTokens: 1, costUsdMicros: 1, costKind: 'reported', pricingRevision: null}, providerRequestId: null};
  },
  async *stream() { throw Error('Unused'); }
};
const admissions = new ReviewAdmissionStore(pool, scope, {approve: async () => {throw Error('Worker cannot admit');}});
const dispatch = new ReviewDispatchStore(pool, scope), summaries = new ReviewSummaryStore(pool, scope);
const execute = createAdmittedReviewExecution({pool, scope, admissions, registrations: [{provider, execution: 'fixture'}],
  authorize: async () => null, readSnapshot: async (_repository, sha) => ({sha, files: {'src/main.ts': 'owned fixture'}})});
const activities = createAdmittedReviewActivities({dispatch, summaries, execute: async (...args) => {
  const summary = await execute(...args);
  if (phase === 'crash') {
    process.send?.({event: 'summary-committed', digest: summary.digest});
    await new Promise<void>(() => {});
  }
  return summary;
}});
const connection = await NativeConnection.connect({address: process.env.AGENTCI_TEST_TEMPORAL_ADDRESS});
const worker = await Worker.create({connection, taskQueue, activities,
  workflowsPath: new URL('../../../dist/apps/worker/reviewer-workflows.js', import.meta.url).pathname});
process.on('message', message => {if (message === 'shutdown') worker.shutdown();});
const running = worker.run();
process.send?.({event: 'ready'});
try {await running;} finally {await connection.close(); await pool.end(); process.disconnect?.();}
