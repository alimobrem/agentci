import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupConfig, verifyInstallation, appPermissions } from '../packages/onboarding/config.ts';
import { initProject } from '../packages/onboarding/init.ts';
import { validateProject } from '../packages/project/index.ts';
const env = { AGENTCI_SETUP_REPOSITORY: 'customer/new-project', AGENTCI_SETUP_URL: 'https://review.example.com' };
test('customer initialization validates and refuses to overwrite populated repositories', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agentci-customer-'));
  try {
    await initProject(root); const result = await validateProject(root); assert.equal(result.valid, true, JSON.stringify(result.errors)); assert.equal(result.requirements, 1);
    const manifest = await readFile(join(root, 'agentci.yaml'), 'utf8');
    await assert.rejects(initProject(root), /empty directory/); assert.equal(await readFile(join(root, 'agentci.yaml'), 'utf8'), manifest);
    assert.match(await readFile(join(root, '.gitignore'), 'utf8'), /\.env/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('App setup uses explicit repository/account configuration and rejects ambiguous origins', () => {
  const personal = setupConfig(env); assert.equal(personal.repository, 'customer/new-project'); assert.equal(personal.registrationUrl, 'https://github.com/settings/apps/new');
  const separate = setupConfig({ ...env, AGENTCI_SETUP_PORT: '3002', AGENTCI_SETUP_TEMPORAL_UI_PORT: '8234' }); assert.equal(separate.port, 3002); assert.equal(separate.temporalUiPort, 8234);
  assert.throws(() => setupConfig({ ...env, AGENTCI_SETUP_PORT: '8233' }), /conflicting/);
  const org = setupConfig({ ...env, AGENTCI_SETUP_ACCOUNT_TYPE: 'organization' }); assert.equal(org.registrationUrl, 'https://github.com/organizations/customer/settings/apps/new');
  for (const override of [{ AGENTCI_SETUP_REPOSITORY: '' }, { AGENTCI_SETUP_REPOSITORY: 'customer/repo\nINJECT=x' }, { AGENTCI_SETUP_URL: 'https://review.example.com?token=secret' }, { AGENTCI_SETUP_URL: 'https://review.example.com#fragment' }, { AGENTCI_SETUP_ACCOUNT_TYPE: 'enterprise' }, { AGENTCI_SETUP_PORT: '0' }]) assert.throws(() => setupConfig({ ...env, ...override }));
});
test('App installation must match one configured repository and all minimal permissions', () => {
  const config = setupConfig(env), installation = { account: { login: 'customer' }, repository_selection: 'selected', permissions: { ...appPermissions } }, repos = { total_count: 1, repositories: [{ full_name: 'customer/new-project' }] };
  verifyInstallation(config, installation, repos);
  assert.throws(() => verifyInstallation(config, { ...installation, repository_selection: 'all' }, repos));
  assert.throws(() => verifyInstallation(config, { ...installation, account: { login: 'other' } }, repos));
  assert.throws(() => verifyInstallation(config, { ...installation, permissions: { ...appPermissions, contents: 'write' } }, repos));
  assert.throws(() => verifyInstallation(config, { ...installation, permissions: { contents: 'read' } }, repos));
  assert.throws(() => verifyInstallation(config, installation, { total_count: 2, repositories: [...repos.repositories, { full_name: 'customer/another' }] }));
  assert.throws(() => verifyInstallation(config, installation, { total_count: 1, repositories: [{ full_name: 'alimobrem/agentci' }] }));
});
