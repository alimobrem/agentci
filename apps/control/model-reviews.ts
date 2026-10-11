import {createFindingDispositions,FindingDispositionFailure} from './finding-dispositions.ts';
import {validateFindingDispositionRequest,InvalidFindingDisposition,type FindingDispositionRequest} from '../../packages/findings/disposition-transport.ts';
import {validateFindingHistoryRecord} from '../../packages/findings/history.ts';
import {createReproductionAdmissions} from './reproduction-admissions.ts';
import type {ReproductionRuntime} from '../../packages/runtime/reproductions.ts';
import {ReproductionReservationConflict} from '../../packages/storage/reproduction-reservations.ts';
import {ReproductionAuthorityConflict,ReproductionPermissionDenied} from '../../packages/storage/reproduction-authority.ts';
import {ReproductionReads} from '../../packages/storage/reproduction-reads.ts';
import {validateFindingReproductionRequest,validateFindingReproductionAccepted,type FindingReproductionRequest,type FindingReproductionAccepted,validateFindingReproductionStatus,validateFindingReproductionCancellation,type FindingReproductionStatus,type FindingReproductionCancellation} from '../../packages/findings/reproduction-transport.ts';
import {ModelReviewExports,type PreparedModelReviewExport} from '../../packages/storage/model-review-export.ts';
import {streamModelReviewExport} from './model-review-export.ts';
import {FindingReads,type FindingPageOptions} from '../../packages/storage/finding-reads.ts';
import {FindingReadFailure} from '../../packages/storage/finding-cursor.ts';
import type {ModelReviewFindings,ModelFindingHistory} from '../../packages/reviewers/finding-transport.ts';
import type {FindingHistoryRecord} from '../../packages/findings/history.ts';
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
 exportReview?:(id:string)=>Promise<PreparedModelReviewExport>;
 findings?:(id:string,options:FindingPageOptions)=>Promise<ModelReviewFindings>;
 finding?:(reviewId:string,id:string,version?:number)=>Promise<FindingHistoryRecord>;
 history?:(reviewId:string,id:string,options:FindingPageOptions)=>Promise<ModelFindingHistory>;
 disposition?:(id:string,value:FindingDispositionRequest)=>Promise<FindingHistoryRecord>;
 reserveReproduction?:(id:string,value:FindingReproductionRequest)=>Promise<FindingReproductionAccepted>;
 reproductionStatus?:(id:string,reviewId:string)=>Promise<FindingReproductionStatus|undefined>;
 cancelReproduction?:(id:string)=>Promise<FindingReproductionCancellation|undefined>;
 status(id:string):Promise<ModelReviewStatus|undefined>;
 admit?:(request:ReviewAdmissionRequest)=>Promise<ModelReviewAccepted>;
 cancel(id:string):Promise<ModelReviewCancellation|undefined>;
}
export async function createModelReviewControl(pool:Pool,config:{organizationId:string;repository:string;installationId:number;cursorKey?:string;evidenceToken?:string;operatorToken?:string},definition:ReviewerRuntimeDefinition|null=null,github?:Octokit,reproductionRuntime:ReproductionRuntime|null=null):Promise<ModelReviewControl>{
 if(config.cursorKey!==undefined&&(config.cursorKey===config.evidenceToken||config.cursorKey===config.operatorToken))throw Error('Cursor key must be independent');
 const scope={organizationId:config.organizationId.toLowerCase(),repository:config.repository},reads=new ModelReviewReads(pool,scope),dispatch=new ReviewDispatchStore(pool,scope);
 const reproductions=new ReproductionReads(pool,scope);
 const findingReads=config.cursorKey?new FindingReads(pool,scope,config.cursorKey):null;
 if(definition&&!github)throw Error('model-review-authority-unavailable');
 if(reproductionRuntime&&!github)throw Error('reproduction-admission-unavailable');
 const reserveReproduction=reproductionRuntime?await createReproductionAdmissions(pool,github!,config,reproductionRuntime):undefined;
 const authority=definition?await initializeReviewerAuthority(pool,github!,config,definition):null;
 return {scope,...(config.operatorToken?{disposition:createFindingDispositions(pool,scope)}:{}),...(reserveReproduction?{reserveReproduction}:{}),reproductionStatus:(id,reviewId)=>reproductions.status(id,reviewId),cancelReproduction:id=>reproductions.cancel(id),exportReview:id=>new ModelReviewExports(pool,scope).prepare(id),...(findingReads?{findings:(id:string,options:FindingPageOptions)=>findingReads.findings(id,options),finding:(reviewId:string,id:string,version?:number)=>findingReads.finding(reviewId,id,version),history:(reviewId:string,id:string,options:FindingPageOptions)=>findingReads.history(reviewId,id,options)}:{}),profiles:()=>reads.profiles(authority?.definition.profiles??[]),status:id=>reads.status(id),
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
 const tokens={...config};let activeExports=0;
 return async(req:IncomingMessage,res:ServerResponse):Promise<boolean>=>{
  const rawPath=(req.url??'').split('?')[0]??'',profiles=rawPath==='/v1/reviewer-profiles',collection=rawPath==='/v1/model-reviews';
  const match=/^\/v1\/model-reviews\/([^/]+)(\/cancellation|\/findings|\/export)?$/.exec(rawPath);
  const findingMatch=/^\/v1\/findings\/([^/]+)(\/history|\/reproductions|\/dispositions)?$/.exec(rawPath);
  const reproductionMatch=/^\/v1\/finding-reproductions\/([^/]+)(\/cancellation)?$/.exec(rawPath);
  if(!profiles&&!collection&&!match&&!findingMatch&&!reproductionMatch)return false;
  const reply=(status:number,value:unknown)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(value));};
  try{
   const reservation=findingMatch?.[2]==='/reproductions',disposition=findingMatch?.[2]==='/dispositions',jsonMutation=collection||reservation||disposition;
   const mutation=jsonMutation||match?.[2]==='/cancellation'||reproductionMatch?.[2]==='/cancellation',presented=req.headers.authorization??'';
   const operator=matches(presented,tokens.operatorToken),reader=matches(presented,tokens.evidenceToken);
   if(!operator&&!reader)throw new TransportFailure(401,'unauthorized');if(mutation&&!operator)throw new TransportFailure(403,'forbidden');
   const method=mutation?'POST':'GET';if(req.method!==method){res.setHeader('allow',method);throw new TransportFailure(405,'method-not-allowed');}
   const parsed=new URL(req.url!,'http://control.invalid');
   const readingFindings=match?.[2]==='/findings',allowed=reproductionMatch?(reproductionMatch[2]?[]:['reviewId']):readingFindings?['limit','cursor']:findingMatch?(reservation||disposition?[]:findingMatch[2]?['reviewId','limit','cursor']:['reviewId','version']):[];
   for(const key of parsed.searchParams.keys())if(!allowed.includes(key)||parsed.searchParams.getAll(key).length!==1)throw new TransportFailure(400,'invalid-request');
   const integer=(key:string)=>{const v=parsed.searchParams.get(key);if(v===null)return undefined;if(!/^[1-9][0-9]{0,4}$/.test(v))throw new TransportFailure(400,'invalid-request');return Number(v);};
   const page={limit:integer('limit'),cursor:parsed.searchParams.get('cursor')??undefined};if(page.limit!==undefined&&page.limit>100||page.cursor!==undefined&&!/^[A-Za-z0-9_-]{1,2048}$/.test(page.cursor))throw new TransportFailure(400,page.cursor!==undefined?'invalid-cursor':'invalid-request');

   const id=(match?.[1]??reproductionMatch?.[1])?.toLowerCase();if(id&&!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id))throw new TransportFailure(400,'invalid-request');
   let body:unknown;
   if(mutation){
    if(req.headers['content-encoding']!==undefined)throw new TransportFailure(415,'unsupported-content-encoding');
    if(jsonMutation&&!/^application\/json(?:;\s*charset=utf-8)?\s*$/i.test(req.headers['content-type']??''))throw new TransportFailure(415,'unsupported-media-type');
    const chunks:Buffer[]=[];let bytes=0;
    for await(const chunk of req.iterator({destroyOnReturn:false})){
     bytes+=chunk.length;if(bytes>(disposition?8192:4096)){req.pause();res.shouldKeepAlive=false;res.setHeader('connection','close');res.once('finish',()=>req.destroy());throw new TransportFailure(413,'body-too-large');}chunks.push(Buffer.from(chunk));
    }
    if(!jsonMutation&&bytes)throw new TransportFailure(400,'invalid-request');
    if(jsonMutation){try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{throw new TransportFailure(400,'invalid-request');}}
   }
   if(profiles){reply(200,validateReviewerProfileList(control?await control.profiles():{schemaVersion:'v1alpha1',profiles:[]}));return true;}
   if(!control)throw new TransportFailure(503,'service-unavailable');
   if(reproductionMatch){
    if(reproductionMatch[2]){
     if(!control.cancelReproduction)throw new TransportFailure(503,'service-unavailable');
     const result=await control.cancelReproduction(id!);if(!result)throw new TransportFailure(404,'not-found');
     reply(202,validateFindingReproductionCancellation(result,id!));return true;
    }
    const reviewId=parsed.searchParams.get('reviewId')?.toLowerCase();
    if(!reviewId||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(reviewId))throw new TransportFailure(400,'invalid-request');
    if(!control.reproductionStatus)throw new TransportFailure(503,'service-unavailable');
    const result=await control.reproductionStatus(id!,reviewId);if(!result)throw new TransportFailure(404,'not-found');
    const value=validateFindingReproductionStatus(result,{id:id!,reviewId,subject:result.subject});
    if(value.subject.organizationId!==control.scope.organizationId||value.subject.repository!==control.scope.repository)throw Error();
    if(value.dispatch.state!=='settled')res.setHeader('retry-after','1');reply(200,value);return true;
   }
   if(match?.[2]==='/export'){
    if(!control.exportReview||activeExports>=2)throw new TransportFailure(503,'service-unavailable');activeExports++;
    try{await streamModelReviewExport(res,()=>control.exportReview!(id!),{id:id!,...control.scope});}finally{activeExports--;}return true;
   }
   if(readingFindings){if(!control.findings)throw new TransportFailure(503,'service-unavailable');reply(200,await control.findings(id!,page));return true;}
   if(disposition){
    let findingId:string;try{findingId=decodeURIComponent(findingMatch![1]!);if(!/^sha256:[a-f0-9]{64}$/.test(findingId))throw Error();}catch{throw new TransportFailure(400,'invalid-request');}
    const value=validateFindingDispositionRequest(body);if(value.subject.organizationId!==control.scope.organizationId||value.subject.repository!==control.scope.repository)throw new TransportFailure(404,'not-found');
    if(!control.disposition)throw new TransportFailure(503,'service-unavailable');
    const result=validateFindingHistoryRecord(await control.disposition(findingId,value),value.subject);if(result.event.finding.id!==findingId||result.event.operationId!==value.operationId||result.event.finding.version!==value.expectedVersion+1)throw Error();reply(200,result);return true;
   }
   if(reservation){
    let findingId:string,value:FindingReproductionRequest;try{findingId=decodeURIComponent(findingMatch![1]!);if(!/^sha256:[a-f0-9]{64}$/.test(findingId))throw Error();value=validateFindingReproductionRequest(body);}catch{throw new TransportFailure(400,'invalid-request');}
    if(value.subject.organizationId!==control.scope.organizationId||value.subject.repository!==control.scope.repository)throw new TransportFailure(404,'not-found');
    if(!control.reserveReproduction)throw new TransportFailure(503,'service-unavailable');
    const result=validateFindingReproductionAccepted(await control.reserveReproduction(findingId,value),{id:value.approvalId,reviewId:value.reviewId,subject:value.subject,operationId:value.operationId,findingId,queuedVersion:value.expectedVersion+1,planDigest:value.approvalDigest});
    res.setHeader('location',`/v1/finding-reproductions/${result.id}?reviewId=${result.reviewId}`);reply(202,result);return true;
   }
   if(findingMatch){
    const reviewId=parsed.searchParams.get('reviewId')?.toLowerCase();let findingId:string;try{findingId=decodeURIComponent(findingMatch[1]!);}catch{throw new TransportFailure(400,'invalid-request');}
    if(!reviewId||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(reviewId)||!/^sha256:[a-f0-9]{64}$/.test(findingId))throw new TransportFailure(400,'invalid-request');
    if(findingMatch[2]){if(!control.history)throw new TransportFailure(503,'service-unavailable');reply(200,await control.history(reviewId,findingId,page));}
    else{if(!control.finding)throw new TransportFailure(503,'service-unavailable');reply(200,await control.finding(reviewId,findingId,integer('version')));}return true;
   }
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
   if(error instanceof TransportFailure||error instanceof FindingReadFailure||error instanceof FindingDispositionFailure){status=error.status;code=error.code;}
   else if(error instanceof ReproductionPermissionDenied){status=403;code='reproduction-denied';}
   else if(error instanceof ReproductionAuthorityConflict){status=409;code='approval-conflict';}
   else if(error instanceof ReproductionReservationConflict){status=error.code==='invalid-request'?400:409;code=['invalid-request','version-conflict','idempotency-conflict','approval-conflict'].includes(error.code)?error.code:'approval-conflict';}
   else if(error instanceof InvalidReviewAdmission||error instanceof InvalidFindingDisposition){status=400;code='invalid-request';}
   else if(error instanceof ReviewAdmissionDenied){status=403;code='review-denied';}
   else if(error instanceof ReviewAdmissionConflict){status=409;code='idempotency-conflict';}
   if(status===503)res.setHeader('retry-after','1');reply(status,{error:{code}});
  }
  return true;
 };
}
