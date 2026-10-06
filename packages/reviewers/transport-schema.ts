import {readFileSync} from 'node:fs';
import {evalOpenApiSchema} from '../evals/openapi.ts';
function findingSchema(){const convert=(v:any):any=>{if(Array.isArray(v))return v.map(convert);if(v&&typeof v==='object'){if(v.type==='null')return {nullable:true,enum:[null]};return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,convert(x)]));}return v;};return convert(evalOpenApiSchema(JSON.parse(readFileSync(new URL('../findings/json/model-finding.schema.json',import.meta.url),'utf8'))));}
import {REVIEWER_ROLES} from './roles.ts';
// OpenAPI shapes for the implemented transport. Semantic identity/hash checks
// remain in authoritative domain validators composed by transport.ts.
const object=(properties:Record<string,unknown>)=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
const uuid={type:'string',pattern:'^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$'};
const inputUuid={type:'string',pattern:'^[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$'};
const hash={type:'string',pattern:'^sha256:[a-f0-9]{64}$'},version={type:'string',enum:['v1alpha1']},mode={type:'string',enum:['synthetic','live']};
const ref=(name:string)=>({$ref:`#/components/schemas/${name}`});
const subject=object({organizationId:inputUuid,repository:{type:'string',pattern:'^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$',maxLength:256},pullRequest:{type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER},baseSha:{type:'string',pattern:'^[a-f0-9]{40}$'},headSha:{type:'string',pattern:'^[a-f0-9]{40}$'}});
const summary=object({schemaVersion:version,admissionId:uuid,admissionDigest:hash,profileRevision:hash,contextDigest:hash,mode,
 coverage:object({selectedFiles:{type:'integer',minimum:1,maximum:64},configuredRoles:{type:'integer',minimum:1,maximum:7},completedRoles:{type:'integer',minimum:0,maximum:7},wholeRepository:{type:'boolean',enum:[false]}}),
 roles:{type:'array',minItems:1,maxItems:7,items:object({requestId:uuid,role:{type:'string',enum:[...REVIEWER_ROLES]},digest:hash,status:{type:'string',enum:['completed','refused','incomplete']}})},
 findings:{type:'array',maxItems:64,items:object({id:hash,digest:hash})},
});
const nullableHash={...hash,nullable:true};
export const modelReviewOpenApiSchemas={
 ModelReviewAdmission:object({schemaVersion:version,id:inputUuid,subject,profile:object({id:{type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$'},revision:hash}),mode}),
 ModelReviewAccepted:object({schemaVersion:version,id:uuid,requestDigest:hash}),
 ModelReviewCancellation:object({schemaVersion:version,id:uuid,cancelRequested:{type:'boolean',enum:[true]}}),
 ReviewerProfileList:object({schemaVersion:version,profiles:{type:'array',maxItems:64,items:object({id:{type:'string',pattern:'^[A-Za-z0-9._-]{1,128}$'},revision:hash,mode,revoked:{type:'boolean'}})}}),
 ModelReviewExecutionSummary:summary,
 ModelReviewStatus:object({schemaVersion:version,admission:object({request:ref('ModelReviewAdmission'),digest:hash}),execution:object({state:{type:'string',enum:['queued','dispatched','completed','failed','cancelled','terminated','timed-out']},cancelRequested:{type:'boolean'},terminalDigest:nullableHash}),summary:{...object({summary:ref('ModelReviewExecutionSummary'),digest:hash}),nullable:true}}),
 ModelReviewError:object({error:object({code:{type:'string',enum:['invalid-request','unauthorized','forbidden','review-denied','not-found','method-not-allowed','idempotency-conflict','body-too-large','unsupported-media-type','unsupported-content-encoding','service-unavailable']}})}),
};
const eventVersion={type:'integer',minimum:1,maximum:10000};
const nullableCursor={type:'string',pattern:'^[A-Za-z0-9_-]{1,2048}$',nullable:true};
const receipt=object({findingId:hash,subjectDigest:hash,evidenceDigest:hash,assertionDigest:nullableHash,actor:{type:'string',enum:['reproduction','operator']},outcome:{type:'string',enum:['reproduced','not-reproduced','error','false-positive','resolved']},reason:{type:'string',minLength:1,maxLength:4096}});
export const findingOpenApiSchemas={
 ModelFinding:findingSchema(),
 FindingHistoryRecord:object({digest:hash,event:object({schemaVersion:version,operationId:uuid,inputDigest:hash,previousDigest:nullableHash,action:{oneOf:[object({type:{type:'string',enum:['create']}}),object({type:{type:'string',enum:['evidence']},finding:ref('ModelFinding')}),object({type:{type:'string',enum:['queue']}}),object({type:{type:'string',enum:['reproduce','false-positive','resolve']},receiptId:inputUuid})]},receipt:{...receipt,nullable:true},finding:ref('ModelFinding')})}),
 ModelReviewFindings:object({schemaVersion:version,reviewId:uuid,summaryDigest:hash,items:{type:'array',maxItems:100,items:object({id:hash,version:eventVersion,digest:hash})},nextCursor:nullableCursor}),
 ModelFindingHistory:object({schemaVersion:version,reviewId:uuid,findingId:hash,throughVersion:eventVersion,items:{type:'array',minItems:1,maxItems:100,items:ref('FindingHistoryRecord')},nextCursor:nullableCursor}),
 FindingReadError:object({error:object({code:{type:'string',enum:['invalid-request','invalid-cursor','unauthorized','not-found','method-not-allowed','review-not-complete','response-too-large','service-unavailable']}})}),
};
