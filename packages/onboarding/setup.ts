// Development-only GitHub manifest handshake. Credentials never appear in output.
import { createServer } from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdtemp, writeFile, access, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { appPermissions, setupConfig, verifyInstallation } from './config.ts';
export async function startAppSetup(env: NodeJS.ProcessEnv = process.env) {
const config = setupConfig(env);
const { origin, repository, owner, appName, registrationUrl, port } = config;
try { await access('.env'); throw new Error('Existing .env: refusing to overwrite credentials'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
const state = randomBytes(32).toString('hex'), setupToken = randomBytes(32).toString('hex');
await mkdir('.agentci/local', { recursive: true, mode: 0o700 });
const started = Date.now(), credentialDirectory = await mkdtemp(resolve('.agentci/local/app-'));
const permissions = appPermissions;
const manifest = {
  name: appName, url: `https://github.com/${repository}`, public: false,
  description: `Advisory semantic PR review for ${repository}.`,
  hook_attributes: { url: new URL('/v1/webhooks/github', origin).href, active: true },
  redirect_url: new URL('/setup/github/callback', origin).href,
  setup_url: new URL('/setup/github/installed', origin).href,
  default_permissions: permissions, default_events: ['pull_request'],
};
const equal = (a: string | null, b: string) => typeof a === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const html = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
let app: { id: number; slug: string; pem: string; secret: string } | undefined, exchangePending = false, finished = false;
const server = createServer(async (req, res) => {
  res.setHeader('cache-control', 'no-store'); res.setHeader('x-content-type-options', 'nosniff'); res.setHeader('referrer-policy', 'no-referrer');
  const reply = (status: number, text: string) => { res.writeHead(status, { 'content-type': 'text/plain' }); res.end(text); };
  try {
    const url = new URL(req.url ?? '/', origin);
    if (req.method !== 'GET') { reply(503, 'Local deployment setup in progress; retry delivery after startup.'); return; }
    if (Date.now() - started > 30 * 60_000) { reply(410, 'Setup session expired.'); return; }
    if (url.pathname === '/setup' && equal(url.searchParams.get('token'), setupToken)) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'none'; form-action https://github.com; base-uri 'none'; frame-ancestors 'none'" });
      res.end(`<!doctype html><meta charset="utf-8"><title>AgentCI GitHub App setup</title><h1>Create AgentCI</h1><p>Private App owned by ${owner}. Install only on ${repository}. Contents and pull requests: read. Checks: write. Metadata: read.</p><form method="post" action="${registrationUrl}?state=${state}"><input type="hidden" name="manifest" value="${html(JSON.stringify(manifest))}"><button>Create GitHub App</button></form>`); return;
    }
    if (url.pathname === '/setup/github/callback') {
      if (!equal(url.searchParams.get('state'), state) || app || exchangePending) { reply(403, 'Invalid or already-used setup state.'); return; }
      const code = url.searchParams.get('code'); if (!/^[a-zA-Z0-9]{20,200}$/.test(code ?? '')) { reply(400, 'Invalid manifest code.'); return; }
      exchangePending = true;
      try {
        const response = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, { method: 'POST', headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' }, signal: AbortSignal.timeout(15_000) });
        if (!response.ok) { reply(502, 'GitHub manifest conversion failed. No credentials shown.'); return; }
        const value = await response.json();
        if (!Number.isSafeInteger(value.id) || !/^[a-z0-9-]+$/.test(value.slug) || typeof value.pem !== 'string' || typeof value.webhook_secret !== 'string' || value.webhook_secret.length < 32) throw new Error('Invalid App configuration');
        app = { id: value.id, slug: value.slug, pem: value.pem, secret: value.webhook_secret };
        await writeFile(join(credentialDirectory, 'github-app.pem'), app.pem, { mode: 0o600, flag: 'wx' });
        await writeFile(join(credentialDirectory, 'pending-app.json'), JSON.stringify(app), { mode: 0o600, flag: 'wx' });
        res.writeHead(302, { location: `https://github.com/apps/${app.slug}/installations/new` }); res.end();
        console.log(`App created: ${app.slug} (${app.id}). Awaiting selected-repository installation.`); return;
      } finally { exchangePending = false; }
    }
    if (url.pathname === '/setup/github/installed' && app && !finished) {
      const id = Number(url.searchParams.get('installation_id'));
      if (!Number.isSafeInteger(id) || id < 1) { reply(400, 'Invalid installation ID.'); return; }
      const appClient = new Octokit({ authStrategy: createAppAuth, auth: { appId: app.id, privateKey: app.pem } });
      const { data: installation } = await appClient.rest.apps.getInstallation({ installation_id: id });
      const client = new Octokit({ authStrategy: createAppAuth, auth: { appId: app.id, privateKey: app.pem, installationId: id } });
      const { data: repos } = await client.rest.apps.listReposAccessibleToInstallation({ per_page: 100 });
      try { verifyInstallation(config, { account: installation.account && 'login' in installation.account ? { login: installation.account.login } : null, repository_selection: installation.repository_selection, permissions: installation.permissions }, repos); } catch { reply(403, `Install only on ${repository} with the declared permissions, then retry setup.`); return; }
      const values = { AGENTCI_REPOSITORY: repository, AGENTCI_ORGANIZATION_ID: randomUUID(), AGENTCI_PUBLIC_URL: origin.origin, GITHUB_APP_ID: app.id, GITHUB_INSTALLATION_ID: id, GITHUB_PRIVATE_KEY_FILE: join(credentialDirectory, 'github-app.pem'), GITHUB_WEBHOOK_SECRET: app.secret, AGENTCI_EVIDENCE_TOKEN: randomBytes(32).toString('hex'), POSTGRES_PASSWORD: randomBytes(32).toString('hex'), TEMPORAL_NAMESPACE: 'default' };
      await writeFile('.env', Object.entries(values).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600, flag: 'wx' });
      await mkdir('.agentci/artifacts', { recursive: true });
      await writeFile('.agentci/artifacts/github-app.json', JSON.stringify({ appId: app.id, slug: app.slug, installationId: id, repository, permissions: installation.permissions, publicUrl: origin.origin, registeredAt: new Date().toISOString(), envPath: resolve('.env') }, null, 2) + '\n');
      finished = true; reply(200, `AgentCI App installed only on ${repository}. Local credentials saved securely. Start the deployment; keep the HTTPS endpoint reachable.`);
      console.log(`Installation verified: ${repository}, App ${app.id}, installation ${id}. .env saved; credentials omitted.`); return;
    }
    reply(404, 'Not found.');
  } catch { reply(503, 'Setup failed; credentials and provider responses are withheld.'); }
});
server.requestTimeout = 20_000;
await new Promise<void>((resolve, reject) => {
  server.once('error', reject);
  server.listen(port, '127.0.0.1', () => { console.log(new URL(`/setup?token=${setupToken}`, origin).href); resolve(); });
});
process.on('SIGTERM', () => server.close()); process.on('SIGINT', () => server.close());

return server;
}
