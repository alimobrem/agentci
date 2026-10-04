// Executable Node agent example. Tokens come from the environment, never argv/output.
import { AgentCIClient, AgentCIError } from '../dist/packages/client/index.js';
const required = key => { if (!process.env[key]) throw new Error(`Missing ${key}`); return process.env[key]; };
const options = { url: required('AGENTCI_API_URL'), token: required('AGENTCI_EVIDENCE_TOKEN') };
const identity = { repository: required('AGENTCI_REPOSITORY'), baseSha: required('AGENTCI_BASE_SHA'), headSha: required('AGENTCI_HEAD_SHA'), pullRequest: Number(required('AGENTCI_PULL_REQUEST')) };
try {
  const client = new AgentCIClient(options); await client.ready();
  const record = await client.evidence(required('AGENTCI_EVIDENCE_ID'), identity);
  // A completed advisory review remains advisory: no deployment approval is inferred.
  console.log(JSON.stringify({ id: record.id, digest: record.digest, identity, risk: record.analysis.risk, advisory: record.analysis.advisory, findings: record.analysis.findings }, null, 2));
  const wrong = new AgentCIClient({ ...options, token: 'invalid-token-for-negative-demo-123456' });
  try { await wrong.evidence(record.id, identity); throw new Error('Unauthorized access unexpectedly succeeded'); }
  catch (error) { if (!(error instanceof AgentCIError) || error.code !== 'unauthorized') throw error; console.log('Unauthorized access: rejected (401)'); }
} catch (error) {
  console.error(error instanceof AgentCIError ? error.message : 'Agent demo failed; check required configuration and expected review identity.');
  process.exitCode = 2;
}
