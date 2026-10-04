import { createServer } from 'node:http';
import { timingSafeEqual, createHash } from 'node:crypto';
import {once} from 'node:events';
import { parsePullRequest, verifySignature, WebhookError, type WebhookConfig } from '../../packages/github/webhook.ts';
import { DeliveryConflict, type Store } from '../../packages/storage/postgres.ts';
import { VERSION } from '../../packages/version.ts';
import type {EvalStore} from '../../packages/storage/evals.ts';
import {validateComparisonRecord} from '../../packages/evals/comparison.ts';
import {frameExport,MAX_EXPORT_FRAME_BYTES,type ExportItem} from '../../packages/evals/export.ts';
export interface ControlConfig extends WebhookConfig { evidenceToken: string }
type Storage = Pick<Store, 'ready' | 'recordDelivery' | 'evidence'>;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function createControlApi(config: ControlConfig, store: Storage, comparisons?:Pick<EvalStore,'comparison'|'ready'|'organizationId'|'repository'>&Partial<Pick<EvalStore,'exportComparison'>>) {
  if (config.secret.length < 32 || config.evidenceToken.length < 32) throw new Error('Service secrets must have at least 32 characters');
  let activeExports=0;
  return createServer(async (req, res) => {
    const reply = (status: number, value: unknown) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(value)); };
    const path = (req.url ?? '').split('?')[0];
    try {
      if (path === '/healthz' && req.method === 'GET') { reply(200, { status: 'ok', version: VERSION }); return; }
      if (path === '/readyz' && req.method === 'GET') { await store.ready(); await comparisons?.ready(); reply(200, { status: 'ready' }); return; }
      if (path === '/v1/webhooks/github') {
        if (req.method !== 'POST') { res.setHeader('allow', 'POST'); reply(405, { error: { code: 'method-not-allowed' } }); return; }
        if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? '')) { reply(415, { error: { code: 'unsupported-media-type' } }); return; }
        const chunks: Buffer[] = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size <= 1024 * 1024) chunks.push(Buffer.from(chunk)); }
        if (size > 1024 * 1024) { reply(413, { error: { code: 'body-too-large' } }); return; }
        const raw = Buffer.concat(chunks), signature = req.headers['x-hub-signature-256'];
        if (typeof signature !== 'string' || !verifySignature(raw, signature, config.secret)) { reply(401, { error: { code: 'invalid-signature' } }); return; }
        const id = req.headers['x-github-delivery'], event = req.headers['x-github-event'];
        if (typeof id !== 'string' || !uuid.test(id) || typeof event !== 'string') { reply(400, { error: { code: 'invalid-delivery-headers' } }); return; }
        const job = parsePullRequest(raw, event, config);
        const hash = createHash('sha256').update(event).update('\0').update(raw).digest('hex');
        const status = await store.recordDelivery(id, hash, job);
        reply(202, { deliveryId: id, status: status === 'duplicate' ? 'duplicate' : job ? 'queued' : 'ignored' }); return;
      }
      const exportMatch=/^\/v1\/eval-comparisons\/([^/]+)\/export$/.exec(path??'');
      if(exportMatch){
        if(req.method!=='GET'){res.setHeader('allow','GET');reply(405,{error:{code:'method-not-allowed'}});return;}
        const actual=Buffer.from(req.headers.authorization??''),expected=Buffer.from(`Bearer ${config.evidenceToken}`);
        if(actual.length!==expected.length||!timingSafeEqual(actual,expected)){reply(401,{error:{code:'unauthorized'}});return;}
        if(!uuid.test(exportMatch[1]!)){reply(400,{error:{code:'invalid-comparison-id'}});return;}
        if(!comparisons?.exportComparison||comparisons.repository!==config.repository)throw new Error('Comparison export unavailable');
        if(activeExports>=2){res.setHeader('retry-after','1');reply(503,{error:{code:'service-unavailable'}});return;}activeExports++;
        const abort=new AbortController(),deadline=setTimeout(()=>abort.abort(),120000);deadline.unref();
        const closed=()=>abort.abort();res.once('close',closed);
        const iterator=comparisons.exportComparison(exportMatch[1]!,abort.signal);
        try{
          const first=await iterator.next();
          if(first.done){reply(404,{error:{code:'not-found'}});return;}
          if(first.value.type!=='header'||first.value.data.id!==exportMatch[1]||first.value.data.subject.repository!==config.repository||first.value.data.organizationId!==comparisons.organizationId)throw new Error('Export scope mismatch');
          async function* items():AsyncGenerator<ExportItem>{yield first.value!;yield* iterator;}
          res.writeHead(200,{'content-type':'application/x-ndjson','cache-control':'no-store','x-content-type-options':'nosniff'});
          for await(const frame of frameExport(items())){
            if(abort.signal.aborted)throw new Error('Export cancelled');
            const line=JSON.stringify(frame)+'\n';if(Buffer.byteLength(line)>MAX_EXPORT_FRAME_BYTES)throw new Error('Export frame exceeds contract');
            if(!res.write(line))await once(res,'drain',{signal:abort.signal});
          }
          res.end();
        }catch(error){if(res.headersSent)res.destroy();else throw error;}
        finally{clearTimeout(deadline);res.removeListener('close',closed);activeExports--;await iterator.return(undefined);}
        return;
      }
      const comparisonMatch=/^\/v1\/eval-comparisons\/([^/]+)$/.exec(path??'');
      if(comparisonMatch){
        if(req.method!=='GET'){res.setHeader('allow','GET');reply(405,{error:{code:'method-not-allowed'}});return;}
        const actual=Buffer.from(req.headers.authorization??''),expected=Buffer.from(`Bearer ${config.evidenceToken}`);
        if(actual.length!==expected.length||!timingSafeEqual(actual,expected)){reply(401,{error:{code:'unauthorized'}});return;}
        if(!uuid.test(comparisonMatch[1]!)){reply(400,{error:{code:'invalid-comparison-id'}});return;}
        if(!comparisons||comparisons.repository!==config.repository)throw new Error('Comparison storage unavailable');
        const record=await comparisons.comparison(comparisonMatch[1]!);
        if(!record){reply(404,{error:{code:'not-found'}});return;}
        const validated=validateComparisonRecord(record);
        if(validated.id!==comparisonMatch[1]||validated.comparison.organizationId!==comparisons.organizationId||validated.comparison.subject.repository!==config.repository)throw new Error('Comparison scope mismatch');
        const body=JSON.stringify(validated);
        if(Buffer.byteLength(body)>4*1024*1024){reply(413,{error:{code:'comparison-too-large'}});return;}
        res.writeHead(200,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(body);return;
      }
      const match = /^\/v1\/evidence\/([^/]+)$/.exec(path ?? '');
      if (match) {
        if (req.method !== 'GET') { res.setHeader('allow', 'GET'); reply(405, { error: { code: 'method-not-allowed' } }); return; }
        const presented = req.headers.authorization ?? '';
        const actual = Buffer.from(presented), expected = Buffer.from(`Bearer ${config.evidenceToken}`);
        if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) { reply(401, { error: { code: 'unauthorized' } }); return; }
        if (!uuid.test(match[1]!)) { reply(400, { error: { code: 'invalid-evidence-id' } }); return; }
        const record = await store.evidence(match[1]!);
        if (!record) { reply(404, { error: { code: 'not-found' } }); return; }
        reply(200, record); return;
      }
      reply(404, { error: { code: 'not-found' } });
    } catch (error) {
      if(res.headersSent){res.destroy();return;}
      if (error instanceof WebhookError) reply(error.status, { error: { code: error.code } });
      else if (error instanceof DeliveryConflict) reply(409, { error: { code: 'delivery-conflict' } });
      else reply(503, { error: { code: 'service-unavailable' } });
    }
  });
}
