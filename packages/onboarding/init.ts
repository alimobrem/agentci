import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify } from 'yaml';
/** Initialize only an empty directory; never overwrite customer files. */
export async function initProject(root: string) {
  await mkdir(root, { recursive: true });
  if ((await readdir(root)).length) throw new Error('Initialization requires an empty directory');
  const project = { apiVersion: 'agentci.io/v1alpha1', kind: 'AgentProject', metadata: { name: 'my-agent-project' }, spec: {
    source: { defaultBranch: 'main' }, specifications: { include: ['specs/*.yaml'] }, implementation: { include: ['src/**'] },
    evals: { include: ['evals/**'] }, policies: { include: ['permissions/**'] }, prompts: { include: ['prompts/**'] },
    models: { allowedProviders: ['openai'], defaultRoute: 'standard' }, ci: { provider: 'auto' },
    telemetry: { protocol: 'otlp', contentCapture: 'metadata-only' }, review: { requiredCheckName: 'agentci/review' },
    extensions: { 'agentci.io/review': { permissions: ['permissions/**'], tools: ['tools/**'], modelConfigs: ['models/**'] } },
  } };
  // Exclusive creation fences a concurrent initializer before any nested writes.
  await writeFile(join(root, 'agentci.yaml'), stringify(project), { flag: 'wx' });
  try {
    await mkdir(join(root, 'specs'), { recursive: false });
    await writeFile(join(root, 'specs/requirements.yaml'), stringify({ id: 'REQ-001', title: 'Reviewable agent changes', type: 'functional', status: 'active', text: 'Agent changes must retain review evidence.' }), { flag: 'wx' });
    await writeFile(join(root, '.gitignore'), '.env\n.env.*\n!.env.example\n.agentci/\nnode_modules/\n', { flag: 'wx' });
  } catch (error) {
    // Preserve all files on partial failure; report the error rather than risk deleting customer data.
    throw error;
  }
}
