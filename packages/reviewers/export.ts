import {canonical,digest} from '../review/engine.ts';
import {validateReviewAdmission,type ReviewAdmissionRequest} from './admission.ts';
import {validateModelReviewStatus,type ModelReviewStatus} from './transport.ts';
import {validateReviewerResult,type ReviewerResult} from './result.ts';
import {validateFindingHistoryLink,type FindingHistoryRecord} from '../findings/history.ts';
import {findingsFromRetainedReviewer,deduplicateFindings,type ModelFinding} from '../findings/model.ts';
import {nameUuid} from '../evals/request-id.ts';import {REVIEWER_ROLES} from './roles.ts';
export const MAX_MODEL_EXPORT_FRAME_BYTES=4*1024*1024,MAX_MODEL_EXPORT_BYTES=128*1024*1024;
export interface ModelReviewExportHeader {schemaVersion:'v1alpha1';review:ModelReviewStatus;configuredRoles:{requestId:string;role:string}[];retainedRoles:{requestId:string;digest:string}[];missingRoleIds:string[];findings:{id:string;throughVersion:number;lastDigest:string}[];reviewerCount:number;eventCount:number;snapshotDigest:string}
export type ModelReviewExportItem={type:'header';data:ModelReviewExportHeader}|{type:'reviewer';data:{result:ReviewerResult;digest:string}}|{type:'finding';data:FindingHistoryRecord}|{type:'end';data:{snapshotDigest:string;reviewerCount:number;eventCount:number;lastContentDigest:string}};
export type ModelReviewExportFrame=ModelReviewExportItem&{sequence:number;previousDigest:string;digest:string};
const exact=(v:any,keys:string[])=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys.sort().join(',');
const hash=(v:unknown)=>typeof v==='string'&&/^sha256:[a-f0-9]{64}$/.test(v);
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const fail=():never=>{throw Error('invalid-model-review-export');};
export function modelReviewExportFrame(item:ModelReviewExportItem,sequence:number,previousDigest:string):ModelReviewExportFrame{const content={...item,sequence,previousDigest};return {...content,digest:digest(canonical(content))};}
export function validateModelReviewExportHeader(value:unknown,expected?:ReviewAdmissionRequest):ModelReviewExportHeader{
 const h=value as ModelReviewExportHeader;if(!exact(h,['schemaVersion','review','configuredRoles','retainedRoles','missingRoleIds','findings','reviewerCount','eventCount','snapshotDigest'])||h.schemaVersion!=='v1alpha1')fail();
 const review=validateModelReviewStatus(h.review),request=review.admission.request;if(expected&&canonical(request)!==canonical(validateReviewAdmission(expected)))fail();
 if(!Array.isArray(h.configuredRoles)||!h.configuredRoles.length||h.configuredRoles.length>7||!Array.isArray(h.retainedRoles)||!Array.isArray(h.missingRoleIds)||!Array.isArray(h.findings)||h.findings.length>64)fail();
 let role='';for(const r of h.configuredRoles){if(!exact(r,['requestId','role'])||!(REVIEWER_ROLES as readonly string[]).includes(r.role)||r.role<=role||r.requestId!==nameUuid(request.id,`agentci:reviewer:v1:${request.profile.revision}:${r.role}`))fail();role=r.role;}
 let position=-1;for(const r of h.retainedRoles){if(!exact(r,['requestId','digest'])||!uuid(r.requestId)||!hash(r.digest))fail();const i=h.configuredRoles.findIndex(c=>c.requestId===r.requestId);if(i<=position)fail();position=i;}
 if(canonical(h.missingRoleIds)!==canonical(h.configuredRoles.filter(r=>!h.retainedRoles.some(s=>s.requestId===r.requestId)).map(r=>r.requestId))||h.reviewerCount!==h.retainedRoles.length)fail();
 let finding='';for(const f of h.findings){if(!exact(f,['id','throughVersion','lastDigest'])||!hash(f.id)||f.id<=finding||!Number.isSafeInteger(f.throughVersion)||f.throughVersion<1||f.throughVersion>10000||!hash(f.lastDigest))fail();finding=f.id;}
 if(h.eventCount!==h.findings.reduce((n,f)=>n+f.throughVersion,0))fail();
 if(review.summary){const s=review.summary.summary;if(h.missingRoleIds.length||canonical(s.roles.map(({role,requestId})=>({role,requestId})))!==canonical(h.configuredRoles)||canonical(s.roles.map(({requestId,digest})=>({requestId,digest})))!==canonical(h.retainedRoles)||canonical([...s.findings.map(f=>f.id)].sort())!==canonical(h.findings.map(f=>f.id)))fail();}
 const {snapshotDigest,...snapshot}=h;if(snapshotDigest!==digest(canonical(snapshot)))fail();return structuredClone(h);
}
/** push() returns provisional content. Only finish() after EOF certifies a complete
 * snapshot; a complete download never implies successful review execution. */
export class ModelReviewExportVerifier {
 private expected:ReviewAdmissionRequest;private sequence=0;private previous='sha256:'+'0'.repeat(64);private bytes=0;private header?:ModelReviewExportHeader;private reviewerCount=0;private eventCount=0;private findingIndex=0;private prior?:FindingHistoryRecord;private associated=false;private proposals:ModelFinding[]=[];private expectedFindings?:ModelFinding[];private ended=false;private contextDigest?:string;
 constructor(expected:ReviewAdmissionRequest){this.expected=validateReviewAdmission(expected);}
 async push(value:unknown):Promise<ModelReviewExportFrame>{
  if(this.ended)fail();const f=value as ModelReviewExportFrame,size=Buffer.byteLength(JSON.stringify(f))+1;
  if(size>MAX_MODEL_EXPORT_FRAME_BYTES||(this.bytes+=size)>MAX_MODEL_EXPORT_BYTES||!exact(f,['type','data','sequence','previousDigest','digest'])||f.sequence!==this.sequence||f.previousDigest!==this.previous)fail();const {digest:given,...content}=f;if(given!==digest(canonical(content)))fail();
  if(f.type==='header'){if(this.header||this.sequence!==0)fail();this.header=validateModelReviewExportHeader(f.data,this.expected);}
  else{
   const h=this.header;if(!h)fail();
   if(f.type==='reviewer'){
    if(this.eventCount||!exact(f.data,['result','digest']))fail();const ref=h!.retainedRoles[this.reviewerCount],r=validateReviewerResult(f.data.result,this.expected.subject);
    if(!ref||r.requestId!==ref.requestId||f.data.digest!==ref.digest||digest(canonical(r))!==ref.digest||r.role!==h!.configuredRoles.find(x=>x.requestId===r.requestId)?.role||r.mode!==(this.expected.mode==='live'?'external':'synthetic'))fail();
    if(h!.review.summary){const s=h!.review.summary.summary;if(r.contextDigest!==s.contextDigest||r.status!==s.roles[this.reviewerCount]?.status)fail();}
    if(this.contextDigest!==undefined&&this.contextDigest!==r.contextDigest)fail();this.contextDigest=r.contextDigest;
    this.proposals.push(...findingsFromRetainedReviewer(r,this.expected.subject));this.reviewerCount++;
   }else if(f.type==='finding'){
    if(this.reviewerCount!==h!.reviewerCount)fail();this.expectedFindings??=deduplicateFindings(this.proposals,this.expected.subject);
    const ref=h!.findings[this.findingIndex];if(!ref)fail();const record=await validateFindingHistoryLink(f.data,this.expected.subject,this.prior),event=record.event;if(event.finding.id!==ref!.id||event.finding.version>ref!.throughVersion)fail();
    if(event.operationId===nameUuid(this.expected.id,`agentci:review-finding:v1:${ref!.id}`)){
     const original=event.action.type==='create'?event.finding:event.action.type==='evidence'?event.action.finding:null,expected=this.expectedFindings.find(v=>v.id===ref!.id);
     if(this.associated||!expected||canonical(original)!==canonical(expected)||h!.review.summary&&!h!.review.summary.summary.findings.some(r=>r.id===ref!.id&&r.digest===record.digest))fail();this.associated=true;
    }
    this.eventCount++;this.prior=record;if(event.finding.version===ref!.throughVersion){if(record.digest!==ref!.lastDigest||!this.associated)fail();this.findingIndex++;this.prior=undefined;this.associated=false;}
   }else if(f.type==='end'){
    if(!exact(f.data,['snapshotDigest','reviewerCount','eventCount','lastContentDigest'])||this.reviewerCount!==h!.reviewerCount||this.eventCount!==h!.eventCount||this.findingIndex!==h!.findings.length||this.prior||f.data.snapshotDigest!==h!.snapshotDigest||f.data.reviewerCount!==this.reviewerCount||f.data.eventCount!==this.eventCount||f.data.lastContentDigest!==this.previous)fail();this.ended=true;
   }else fail();
  }
  this.sequence++;this.previous=f.digest;return structuredClone(f);
 }
 finish(){if(!this.ended||!this.header)fail();return {header:structuredClone(this.header!),endDigest:this.previous,complete:true as const};}
}
