import {canonical,digest} from '../../packages/review/engine.ts';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import type {Pool} from 'pg';
import type {Octokit} from '@octokit/rest';
import {validateReviewAdmission,InvalidReviewAdmission,type ReviewAdmissionRequest} from '../../packages/reviewers/admission.ts';
import {initializeReviewerAuthority} from '../../packages/reviewers/authority.ts';
import type {ReviewerRuntimeDefinition} from '../../packages/runtime/reviewers.ts';
import {ReviewAdmissionConflict,ReviewAdmissionDenied} from '../../packages/storage/review-admissions.ts';
import {ReviewDispatchStore} from '../../packages/storage/review-dispatch.ts';
import {ModelReviewReads} from '../../packages/storage/model-review-reads.ts';
import {validateModelReviewAccepted,validateModelReviewCancellation,validateModelReviewStatus,validateReviewerProfileList,type ModelReviewAccepted,type ModelReviewCancellation,type ModelReviewStatus,type ReviewerProfileList} from '../../packages/reviewers/transport.ts';
export interface ModelReviewControl {
 scope:{organizationId:string;repository:string};
 profiles():Promise<ReviewerProfileList>;
 status(id:string):Promise<ModelReviewStatus|undefined>;
 admit?:(request:ReviewAdmissionRequest)=>Promise<ModelReviewAccepted>;
 cancel(id:string):Promise<ModelReviewCancellation|undefined>;
}
export async function createModelReviewControl(pool:Pool,config:{organizationId:string;repository:string;installationId:number},definition:ReviewerRuntimeDefinition|null=null,github?:Octokit):Promise<ModelReviewControl>{
 const scope={organizationId:config.organizationId.toLowerCase(),repository:config.repository},reads=new ModelReviewReads(pool,scope),dispatch=new ReviewDispatchStore(pool,scope);
 if(definition&&!github)throw Error('model-review-authority-unavailable');
 const authority=definition?await initializeReviewerAuthority(pool,github!,config,definition):null;
 return {scope,profiles:()=>reads.profiles(authority?.definition.profiles??[]),status:id=>reads.status(id),
  ...(authority?{admit:async(request:ReviewAdmissionRequest)=>{const admitted=await authority.admissions.admit(request);return validateModelReviewAccepted({schemaVersion:'v1alpha1',id:admitted.request.id,requestDigest:admitted.digest});}}:{}),
  cancel:async id=>{if(!await reads.status(id))return undefined;await dispatch.requestCancellation(id);return validateModelReviewCancellation({schemaVersion:'v1alpha1',id,cancelRequested:true});},
 };
}
class TransportFailure extends Error {constructor(public status:number,public code:string){super(code);}}
function credential(value:unknown){return typeof value==='string'&&value.length>=32&&!/[\r\n]/.test(value);}
function matches(actual:string,token:string|undefined){if(!token)return false;const a=Buffer.from(actual),b=Buffer.from(`Bearer ${token}`);return a.length===b.length&&timingSafeEqual(a,b);}
/** New resources only. Legacy endpoints retain their existing authentication. */
export function modelReviewRoutes(config:{evidenceToken:string;operatorToken?:string},control?:ModelReviewControl){
 if(!credential(config.evidenceToken)||(config.operatorToken!==undefined&&(!credential(config.operatorToken)||config.operatorToken===config.evidenceToken)))throw Error('Invalid model review credentials');
 const tokens={...config};
 return async(req:IncomingMessage,res:ServerResponse):Promise<boolean>=>{
  const rawPath=(req.url??'').split('?')[0]??'',profiles=rawPath==='/v1/reviewer-profiles',collection=rawPath==='/v1/model-reviews';
  const match=/^\/v1\/model-reviews\/([^/]+)(\/cancellation)?$/.exec(rawPath);
  if(!profiles&&!collection&&!match)return false;
  const reply=(status:number,value:unknown)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(value));};
  try{
   const mutation=collection||!!match?.[2],presented=req.headers.authorization??'';
   const operator=matches(presented,tokens.operatorToken),reader=matches(presented,tokens.evidenceToken);
   if(!operator&&!reader)throw new TransportFailure(401,'unauthorized');if(mutation&&!operator)throw new TransportFailure(403,'forbidden');
   const method=mutation?'POST':'GET';if(req.method!==method){res.setHeader('allow',method);throw new TransportFailure(405,'method-not-allowed');}
   const parsed=new URL(req.url!,'http://control.invalid');if(parsed.search)throw new TransportFailure(400,'invalid-request');
   const id=match?.[1]?.toLowerCase();if(id&&!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id))throw new TransportFailure(400,'invalid-request');
   let body:unknown;
   if(mutation){
    if(req.headers['content-encoding']!==undefined)throw new TransportFailure(415,'unsupported-content-encoding');
    if(collection&&!/^application\/json(?:;\s*charset=utf-8)?\s*$/i.test(req.headers['content-type']??''))throw new TransportFailure(415,'unsupported-media-type');
    const chunks:Buffer[]=[];let bytes=0;
    for await(const chunk of req.iterator({destroyOnReturn:false})){
     bytes+=chunk.length;if(bytes>4096){req.pause();res.shouldKeepAlive=false;res.setHeader('connection','close');res.once('finish',()=>req.destroy());throw new TransportFailure(413,'body-too-large');}chunks.push(Buffer.from(chunk));
    }
    if(!collection&&bytes)throw new TransportFailure(400,'invalid-request');
    if(collection){try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{throw new TransportFailure(400,'invalid-request');}}
   }
   if(profiles){reply(200,validateReviewerProfileList(control?await control.profiles():{schemaVersion:'v1alpha1',profiles:[]}));return true;}
   if(!control)throw new TransportFailure(503,'service-unavailable');
   if(collection){
    const request=validateReviewAdmission(body);
    if(request.subject.organizationId!==control.scope.organizationId||request.subject.repository!==control.scope.repository)throw new TransportFailure(404,'not-found');
    if(!control.admit||!tokens.operatorToken)throw new TransportFailure(503,'service-unavailable');
    const result=validateModelReviewAccepted(await control.admit(request));if(result.id!==request.id||result.requestDigest!==digest(canonical(request)))throw Error();
    res.setHeader('location',`/v1/model-reviews/${result.id}`);reply(202,result);return true;
   }
   if(match?.[2]){const result=await control.cancel(id!);if(!result)throw new TransportFailure(404,'not-found');const value=validateModelReviewCancellation(result);if(value.id!==id)throw Error();reply(202,value);return true;}
   const result=await control.status(id!);if(!result)throw new TransportFailure(404,'not-found');const value=validateModelReviewStatus(result);if(value.admission.request.id!==id)throw Error();
   if(['queued','dispatched'].includes(value.execution.state))res.setHeader('retry-after','1');reply(200,value);
  }catch(error){
   let status=503,code='service-unavailable';
   if(error instanceof TransportFailure){status=error.status;code=error.code;}
   else if(error instanceof InvalidReviewAdmission){status=400;code='invalid-request';}
   else if(error instanceof ReviewAdmissionDenied){status=403;code='review-denied';}
   else if(error instanceof ReviewAdmissionConflict){status=409;code='idempotency-conflict';}
   if(status===503)res.setHeader('retry-after','1');reply(status,{error:{code}});
  }
  return true;
 };
}
