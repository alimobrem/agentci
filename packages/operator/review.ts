import {lstat,readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {createHmac,createPrivateKey,randomUUID} from 'node:crypto';
import type {Octokit} from '@octokit/rest';
import {installationClient} from '../github/client.ts';
import type {ReviewJob} from '../github/webhook.ts';

export class OperatorReviewError extends Error {
  constructor(public code:string,public requestId?:string){super(`AgentCI operator: ${code}`);}
}
export interface ReviewOperatorConfig {
  url:string;repository:string;appId:number;installationId:number;privateKey:string;webhookSecret:string;
}
export interface ReviewRequestReceipt {
  schemaVersion:1;requestId:string;status:'queued'|'duplicate';workflowId:string;subject:ReviewJob;
}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function origin(value:unknown):string {
  try{
    if(typeof value!=='string')throw new Error();const url=new URL(value);
    if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash||url.protocol==='http:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw new Error();
    return url.origin;
  }catch{throw new OperatorReviewError('invalid-operator-origin');}
}
async function privateFile(path:string,maxBytes:number):Promise<string>{
  try{
    const metadata=await lstat(path);
    if(!metadata.isFile()||metadata.isSymbolicLink()||metadata.size>maxBytes||(metadata.mode&0o077))throw new Error();
    const bytes=await readFile(path);if(bytes.length>maxBytes)throw new Error();return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  }catch{throw new OperatorReviewError('invalid-private-operator-file');}
}
/** This config is operator-owned; repository files and the read-only evidence token cannot schedule work. */
export async function loadReviewOperatorConfig(path:string):Promise<ReviewOperatorConfig>{
  let value:any;try{value=JSON.parse(await privateFile(path,16384));}catch(error){if(error instanceof OperatorReviewError)throw error;throw new OperatorReviewError('invalid-operator-config');}
  const keys=['url','repository','appId','installationId','privateKeyFile','webhookSecretFile'];
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==keys.sort().join(',')||typeof value.repository!=='string'||!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value.repository)||![value.appId,value.installationId].every(v=>Number.isSafeInteger(v)&&v>0)||![value.privateKeyFile,value.webhookSecretFile].every(v=>typeof v==='string'&&v.length>0))throw new OperatorReviewError('invalid-operator-config');
  const url=origin(value.url),directory=dirname(resolve(path));
  const privateKey=await privateFile(resolve(directory,value.privateKeyFile),65536),webhookSecret=(await privateFile(resolve(directory,value.webhookSecretFile),1024)).trim();
  try{if(createPrivateKey(privateKey).asymmetricKeyType!=='rsa'||webhookSecret.length<32||webhookSecret.length>512)throw new Error();}catch{throw new OperatorReviewError('invalid-operator-credentials');}
  return {url,repository:value.repository,appId:value.appId,installationId:value.installationId,privateKey,webhookSecret};
}
async function boundedReply(response:Response):Promise<unknown>{
  if(!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??''))throw new Error();
  const reader=response.body?.getReader();if(!reader)throw new Error();let size=0;const chunks:Uint8Array[]=[];
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384)throw new Error();chunks.push(value);}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}
  finally{await reader.cancel();}
}
export async function requestOperatorReview(config:ReviewOperatorConfig,pullRequest:number,options:{requestId?:string;github?:Pick<Octokit,'pulls'>;fetch?:typeof fetch}={}):Promise<ReviewRequestReceipt>{
  const requestId=(options.requestId??randomUUID()).toLowerCase();
  if(!uuid.test(requestId)||!Number.isSafeInteger(pullRequest)||pullRequest<1)throw new OperatorReviewError('invalid-review-arguments');
  const url=origin(config.url);
  if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(config.repository)||![config.appId,config.installationId].every(v=>Number.isSafeInteger(v)&&v>0)||config.webhookSecret.length<32)throw new OperatorReviewError('invalid-operator-config');
  const [owner,repo]=config.repository.split('/');let pr;
  try{const github=options.github??installationClient(config.appId,config.installationId,config.privateKey);pr=(await github.pulls.get({owner:owner!,repo:repo!,pull_number:pullRequest})).data;}
  catch{throw new OperatorReviewError('github-read-unavailable',requestId);}
  if(pr?.state!=='open')throw new OperatorReviewError('pull-request-not-open',requestId);
  if(pr.number!==pullRequest||pr.base?.repo?.full_name!==config.repository||![/^[a-f0-9]{40}$/.test(pr.base?.sha??''),/^[a-f0-9]{40}$/.test(pr.head?.sha??'')].every(Boolean)||pr.base.sha===pr.head.sha)throw new OperatorReviewError('pull-request-identity-mismatch',requestId);
  const subject:ReviewJob={repository:config.repository,installationId:config.installationId,pullRequest,baseSha:pr.base.sha,headSha:pr.head.sha};
  // Stable body enables duplicate receipt for the same UUID/subject after ambiguous transport failure.
  const body=JSON.stringify({action:'synchronize',number:pullRequest,repository:{full_name:config.repository},installation:{id:config.installationId},pull_request:{number:pullRequest,base:{sha:pr.base.sha,repo:{full_name:config.repository}},head:{sha:pr.head.sha}}});
  let response:Response;
  try{response=await (options.fetch??fetch)(url+'/v1/webhooks/github',{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{'content-type':'application/json','x-github-event':'pull_request','x-github-delivery':requestId,'x-hub-signature-256':'sha256='+createHmac('sha256',config.webhookSecret).update(body).digest('hex')},body});}
  catch{throw new OperatorReviewError('submission-unknown',requestId);}
  if(response.status!==202){await response.body?.cancel();throw new OperatorReviewError(({401:'signature-rejected',403:'scope-rejected',409:'request-id-conflict',503:'service-unavailable'} as Record<number,string>)[response.status]??'submission-rejected',requestId);}
  let reply:any;try{reply=await boundedReply(response);}catch{throw new OperatorReviewError('invalid-review-receipt',requestId);}
  if(!reply||typeof reply!=='object'||Object.keys(reply).sort().join(',')!=='deliveryId,status'||reply.deliveryId!==requestId||!['queued','duplicate'].includes(reply.status))throw new OperatorReviewError('invalid-review-receipt',requestId);
  return {schemaVersion:1,requestId,status:reply.status,workflowId:`agentci:${config.repository}:${requestId}`,subject};
}
