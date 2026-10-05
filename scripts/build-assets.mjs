import { cp, chmod } from 'node:fs/promises';
await cp(new URL('../packages/schemas/json', import.meta.url),
  new URL('../dist/packages/schemas/json', import.meta.url), { recursive: true });
await chmod(new URL('../dist/cmd/agentci/main.js', import.meta.url), 0o755);
await cp(new URL('../packages/review/analysis.schema.json', import.meta.url),
  new URL('../dist/packages/review/analysis.schema.json', import.meta.url));

await cp(new URL('../packages/evals/json', import.meta.url),
  new URL('../dist/packages/evals/json', import.meta.url), { recursive: true });

await cp(new URL('../packages/providers/json', import.meta.url),
  new URL('../dist/packages/providers/json', import.meta.url), { recursive: true });
