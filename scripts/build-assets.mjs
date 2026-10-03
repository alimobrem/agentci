import { cp, chmod } from 'node:fs/promises';
await cp(new URL('../packages/schemas/json', import.meta.url),
  new URL('../dist/packages/schemas/json', import.meta.url), { recursive: true });
await chmod(new URL('../dist/cmd/agentci/main.js', import.meta.url), 0o755);
await cp(new URL('../packages/review/analysis.schema.json', import.meta.url),
  new URL('../dist/packages/review/analysis.schema.json', import.meta.url));
