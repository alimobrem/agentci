import { createApi } from './server.ts';

const port = Number(process.env.AGENTCI_PORT ?? 3000);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid AGENTCI_PORT');
const server = createApi();
server.requestTimeout = 10_000;
server.headersTimeout = 10_000;
server.listen(port, '127.0.0.1', () => console.log(`AgentCI M0 API listening on http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close());
