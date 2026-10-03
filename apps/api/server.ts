import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { schemaNames, schemas, validateDocument, type SchemaName } from '../../packages/schemas/index.ts';

const MAX_BODY = 1024 * 1024;
function reply(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function body(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    // Drain oversized requests without retaining their body or destroying the
    // socket before the client receives a 413 response.
    if (size <= MAX_BODY) chunks.push(buffer);
  }
  if (size > MAX_BODY) throw new Error('BODY_TOO_LARGE');
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** Local development skeleton: no persistence, credentials, or production resources. */
export function createApi() {
  return createServer(async (req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    if (req.method === 'GET' && path === '/healthz') {
      reply(res, 200, { status: 'ok', milestone: 'M0', version: '0.1.0-m0' }); return;
    }
    const match = /^\/v1\/schemas\/([a-z-]+)$/.exec(path!);
    const name = match?.[1] as SchemaName;
    if (req.method === 'GET' && match && schemaNames.includes(name)) { reply(res, 200, schemas[name]); return; }
    if (req.method === 'POST' && path === '/v1/validate') {
      if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? '')) {
        reply(res, 415, { error: 'application/json required' }); return;
      }
      try {
        const input: any = await body(req);
        if (!input || !schemaNames.includes(input.schema) || !Object.hasOwn(input, 'document')) {
          reply(res, 400, { error: 'Expected { schema, document } with a supported schema name' }); return;
        }
        const checked = validateDocument(input.schema, input.document);
        reply(res, checked.valid ? 200 : 422, checked);
      } catch (error) {
        reply(res, error instanceof Error && error.message === 'BODY_TOO_LARGE' ? 413 : 400,
          { error: error instanceof Error && error.message === 'BODY_TOO_LARGE' ? 'Body exceeds 1 MiB' : 'Invalid JSON body' });
      }
      return;
    }
    reply(res, 404, { error: 'Route not implemented in M0' });
  });
}
