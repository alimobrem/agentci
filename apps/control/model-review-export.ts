import type {ServerResponse} from 'node:http';import {once} from 'node:events';
import type {PreparedModelReviewExport} from '../../packages/storage/model-review-export.ts';
import {MAX_MODEL_EXPORT_BYTES,MAX_MODEL_EXPORT_FRAME_BYTES,ModelReviewExportVerifier,validateModelReviewExportHeader,type ModelReviewExportFrame} from '../../packages/reviewers/export.ts';
/** The caller reserves its service concurrency slot before preparation. The
 * deadline covers snapshot capture and network backpressure, not only DB work. */
export async function streamModelReviewExport(res:ServerResponse,prepare:()=>Promise<PreparedModelReviewExport>,expected:{id:string;organizationId:string;repository:string},timeoutMs=120000){
 const abort=new AbortController(),closed=()=>abort.abort();res.on('close',closed);
 const deadline=setTimeout(()=>{abort.abort();if(!res.headersSent){res.writeHead(503,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff','retry-after':'1'});res.end(JSON.stringify({error:{code:'service-unavailable'}}));}else res.destroy();},timeoutMs);deadline.unref();
 let iterator:AsyncGenerator<ModelReviewExportFrame>|undefined;
 try{
  const captured=await prepare();abort.signal.throwIfAborted();const header=validateModelReviewExportHeader(captured.header),request=header.review.admission.request;
  if(request.id!==expected.id||request.subject.organizationId!==expected.organizationId||request.subject.repository!==expected.repository)throw Error('export-scope-mismatch');
  iterator=captured.frames(abort.signal);const verifier=new ModelReviewExportVerifier(request);let bytes=0,first=true;
  for await(const frame of iterator){
   abort.signal.throwIfAborted();await verifier.push(frame);if(first){if(frame.type!=='header'||frame.data.snapshotDigest!==header.snapshotDigest)throw Error('export-snapshot-mismatch');first=false;}
   const line=JSON.stringify(frame)+'\n';bytes+=Buffer.byteLength(line);if(Buffer.byteLength(line)>MAX_MODEL_EXPORT_FRAME_BYTES||bytes>MAX_MODEL_EXPORT_BYTES)throw Error('export-response-too-large');
   if(!res.headersSent)res.writeHead(200,{'content-type':'application/x-ndjson','cache-control':'no-store','x-content-type-options':'nosniff'});
   if(!res.write(line))await once(res,'drain',{signal:abort.signal});
  }
  verifier.finish();abort.signal.throwIfAborted();res.end();
 }catch(error){if(res.headersSent){res.destroy();return;}throw error;}
 finally{clearTimeout(deadline);res.removeListener('close',closed);abort.abort();await iterator?.return(undefined);}
}
