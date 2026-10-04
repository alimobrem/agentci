export const appPermissions = { contents: 'read', pull_requests: 'read', checks: 'write', metadata: 'read' } as const;
export function setupConfig(env: NodeJS.ProcessEnv) {
  const repository = env.AGENTCI_SETUP_REPOSITORY ?? '';
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Set AGENTCI_SETUP_REPOSITORY to owner/repository');
  const owner = repository.split('/')[0]!;
  const repoName = repository.split('/')[1]!;
  if (['.', '..'].includes(repoName) || repoName.length > 100) throw new Error('Invalid repository name');
  const accountType = env.AGENTCI_SETUP_ACCOUNT_TYPE ?? 'user';
  if (!['user', 'organization'].includes(accountType)) throw new Error('Account type must be user or organization');
  const origin = new URL(env.AGENTCI_SETUP_URL ?? '');
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Set AGENTCI_SETUP_URL to an HTTPS origin');
  const appName = env.AGENTCI_SETUP_APP_NAME ?? `AgentCI-${owner}`;
  if (!/^[A-Za-z0-9-]{3,34}$/.test(appName)) throw new Error('Set a unique App name with 3–34 letters, digits or hyphens');
  const port = Number(env.AGENTCI_SETUP_PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid setup port');
  const registrationUrl = accountType === 'organization' ? `https://github.com/organizations/${owner}/settings/apps/new` : 'https://github.com/settings/apps/new';
  return { repository, owner, origin, appName, port, registrationUrl };
}
export type SetupConfig = ReturnType<typeof setupConfig>;
export function verifyInstallation(config: SetupConfig, installation: { account?: { login?: string } | null; repository_selection?: string; permissions?: Record<string, string> }, repos: { total_count: number; repositories: { full_name: string }[] }) {
  const permissions = installation.permissions ?? {};
  if (installation.account?.login?.toLowerCase() !== config.owner.toLowerCase() || installation.repository_selection !== 'selected' ||
      Object.entries(appPermissions).some(([key, value]) => permissions[key] !== value) ||
      Object.entries(permissions).some(([key, value]) => appPermissions[key as keyof typeof appPermissions] !== value) ||
      repos.total_count !== 1 || repos.repositories.length !== 1 || repos.repositories[0]?.full_name !== config.repository) {
    throw new Error('Install only on the configured repository with the declared permissions');
  }
}
