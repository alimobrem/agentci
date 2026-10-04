import {request as httpRequest,type ClientRequest} from 'node:http';
import {request as httpsRequest} from 'node:https';
import {isIP} from 'node:net';
import {randomUUID} from 'node:crypto';
import {canonical,digest} from '../review/engine.ts';
import {suiteRevision,validateEvalSuite,validateHttpEnvelope,type EvalSuite} from './contracts.ts';
import {projectEvalInputs} from './runner.ts';
import type {Snapshot} from '../review/types.ts';

/** Trusted operator configuration, never populated from a repository manifest. */
export interface HttpProviderPolicy {
  id:string; revision:string; endpoint:string; address:string;
  authorization?:string; maxRequestBytes?:number; tlsCa?:string;
  allowInsecureLoopbackForTests?:boolean;
}
export interface HttpTrialResult {
  sourceSha:string; inputDigest:string; suiteRevision:string;
  provider:{id:string;revision:string}; status:'completed'|'timeout'|'cancelled'|'error';
  report?:string; error?:string;
}
export function validateHttpProvider(policy:HttpProviderPolicy):URL {
  if(!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(policy.id)||!/^sha256:[a-f0-9]{64}$/.test(policy.revision)||!isIP(policy.address))throw new Error('Invalid operator HTTP provider identity or pinned address');
  let url:URL;try{url=new URL(policy.endpoint);}catch{throw new Error('Invalid operator HTTP endpoint');}
  const hostname=url.hostname.replace(/^\[|\]$/g,'');
  if(url.username||url.password||url.hash||url.search)throw new Error('Provider credentials and query parameters cannot be embedded in a URL');
  if(isIP(hostname)&&hostname!==policy.address)throw new Error('Literal endpoint must match its pinned address');
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&policy.allowInsecureLoopbackForTests===true&&['127.0.0.1','::1'].includes(hostname)&&hostname===policy.address))throw new Error('Provider requires verified HTTPS; plaintext is limited to explicit loopback tests');
  if(policy.authorization!==undefined&&(typeof policy.authorization!=='string'||!policy.authorization||policy.authorization.length>4096||/[^\x20-\x7e]/.test(policy.authorization)))throw new Error('Invalid separately scoped provider authorization');
  if(policy.tlsCa!==undefined&&(typeof policy.tlsCa!=='string'||Buffer.byteLength(policy.tlsCa)>65536||!policy.tlsCa.includes('-----BEGIN CERTIFICATE-----')||!policy.tlsCa.includes('-----END CERTIFICATE-----')))throw new Error('Invalid operator TLS certificate authority');
  const max=policy.maxRequestBytes??1048576;
  if(!Number.isSafeInteger(max)||max<1024||max>64*1024*1024)throw new Error('Invalid HTTP request limit');
  return url;
}
/** No repository code is executed here. Requests go only to the operator's exact pinned destination. */
export async function runHttpTrial(snapshot:Snapshot,value:EvalSuite,policy:HttpProviderPolicy,options:{model?:string;signal?:AbortSignal;requestId?:string}={}):Promise<HttpTrialResult> {
  const suite=validateEvalSuite(value),url=validateHttpProvider(policy);
  if(options.requestId!==undefined&&!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(options.requestId))throw new Error('Invalid HTTP eval request UUID');
  if(suite.spec.runner.adapter!=='http')throw new Error('HTTP transport requires an HTTP suite');
  if(suite.spec.runner.provider!==policy.id)throw new Error('HTTP suite and operator provider identity mismatch');
  if(suite.spec.models?.length&&!options.model)throw new Error('Model matrix requires an explicit variant');
  if(options.model!==undefined&&!suite.spec.models?.includes(options.model))throw new Error('Unconfigured model variant');
  const projected=projectEvalInputs(snapshot).snapshot;
  const identity={sourceSha:snapshot.sha,inputDigest:digest(canonical(projected.files)),suiteRevision:suiteRevision(suite),provider:{id:policy.id,revision:policy.revision}};
  if(options.signal?.aborted)return {...identity,status:'cancelled',error:'cancelled'};
  const requestId=options.requestId??randomUUID();
  const envelope={apiVersion:'agentci.io/v1alpha1',kind:'HttpEvalRequest',requestId,sourceSha:identity.sourceSha,inputDigest:identity.inputDigest,suiteRevision:identity.suiteRevision,providerRevision:policy.revision,suite,files:projected.files,...(options.model===undefined?{}:{model:options.model})};
  validateHttpEnvelope(envelope,'request');
  const payload=Buffer.from(JSON.stringify(envelope));
  if(payload.length>(policy.maxRequestBytes??1048576))return {...identity,status:'error',error:'request-limit'};
  return new Promise(resolve=>{
    let done=false;
    let req:ClientRequest|undefined;
    const complete=(status:HttpTrialResult['status'],error?:string,report?:string)=>{
      if(done)return;done=true;clearTimeout(timer);options.signal?.removeEventListener('abort',abort);
      resolve({...identity,status,...(error===undefined?{}:{error}),...(report===undefined?{}:{report})});req?.destroy();
    };
    const abort=()=>complete('cancelled','cancelled');
    const timer=setTimeout(()=>complete('timeout','provider-timeout'),suite.spec.runner.timeoutMs);
    const send=url.protocol==='https:'?httpsRequest:httpRequest;
    try{req=send(url,{method:'POST',agent:false,family:isIP(policy.address),
      ...(policy.tlsCa===undefined?{}:{ca:policy.tlsCa}),
      // Pin the socket destination while retaining the URL hostname for verified TLS/SNI.
      lookup:(_hostname,_options,callback)=>callback(null,policy.address,isIP(policy.address)),
      headers:{'content-type':'application/json','accept':'application/json','accept-encoding':'identity','content-length':payload.length,...(policy.authorization===undefined?{}:{authorization:policy.authorization})}},response=>{
      const contentType=response.headers['content-type']?.split(';')[0]?.trim().toLowerCase();
      if(response.statusCode!==200||contentType!=='application/json'||(response.headers['content-encoding']&&response.headers['content-encoding']!=='identity')){complete('error','provider-protocol');response.destroy();return;}
      const chunks:Buffer[]=[];let bytes=0;const limit=suite.spec.runner.maxOutputBytes??1048576;
      response.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>limit){complete('error','response-limit');response.destroy();}else chunks.push(chunk);});
      response.on('error',()=>complete('error','provider-connection'));
      response.on('aborted',()=>complete('error','provider-connection'));
      response.on('end',()=>{
        if(done)return;
        try{
          const row=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
          validateHttpEnvelope(row,'response');
          if(row.requestId!==requestId||row.sourceSha!==identity.sourceSha||row.inputDigest!==identity.inputDigest||row.suiteRevision!==identity.suiteRevision||row.providerRevision!==policy.revision||row.model!==options.model)throw Error('invalid response');
          complete('completed',undefined,JSON.stringify({schemaVersion:'v1alpha1',results:row.results}));
        }catch{complete('error','provider-response');}
      });
    });}catch{complete('error','provider-connection');return;}
    req.on('error',()=>complete('error','provider-connection'));
    options.signal?.addEventListener('abort',abort,{once:true});
    if(options.signal?.aborted){abort();return;}
    req.end(payload);
  });
}
