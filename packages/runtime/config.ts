import { readFile } from 'node:fs/promises';
export async function runtimeConfig(readPrivateKey = true) {
  const required = (key: string) => { const value = process.env[key]; if (!value) throw new Error(`Missing ${key}`); return value; };
  const numeric = (key: string) => { const value = Number(required(key)); if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid ${key}`); return value; };
  const repository = required('AGENTCI_REPOSITORY');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Invalid AGENTCI_REPOSITORY');
  const organizationId = required('AGENTCI_ORGANIZATION_ID');
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(organizationId)) throw new Error('Invalid organization UUID');
  const publicUrl = new URL(required('AGENTCI_PUBLIC_URL'));
  if (!['https:', 'http:'].includes(publicUrl.protocol) || publicUrl.username || publicUrl.password || publicUrl.search || publicUrl.hash || publicUrl.pathname !== '/') throw new Error('Public URL must be an origin');
  if (publicUrl.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(publicUrl.hostname)) throw new Error('Public service requires HTTPS');
  const appId = numeric('GITHUB_APP_ID'), installationId = numeric('GITHUB_INSTALLATION_ID');
  return { repository, organizationId, publicUrl: publicUrl.origin, appId, installationId,
    secret: required('GITHUB_WEBHOOK_SECRET'), evidenceToken: required('AGENTCI_EVIDENCE_TOKEN'),
    privateKey: readPrivateKey ? await readFile(required('GITHUB_PRIVATE_KEY_FILE'), 'utf8') : '',
    databaseUrl: required('DATABASE_URL'), temporalAddress: required('TEMPORAL_ADDRESS'),
    namespace: process.env.TEMPORAL_NAMESPACE ?? 'default', taskQueue: 'agentci-review-v1' };
}
