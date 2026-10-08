import {modelReviewOpenApiSchemas,findingOpenApiSchemas} from '../reviewers/transport-schema.ts';
const object=(properties:Record<string,unknown>)=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
const uuid={type:'string',pattern:'^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$'},hash={type:'string',pattern:'^sha256:[a-f0-9]{64}$'},nullableHash={...hash,nullable:true};
const reference={schemaVersion:{type:'string',enum:['v1alpha1']},id:uuid,operationId:uuid,reviewId:uuid,subject:modelReviewOpenApiSchemas.ModelReviewAdmission.properties.subject,finding:object({id:hash,queuedVersion:{type:'integer',minimum:2,maximum:9999},digest:hash}),planDigest:hash,requestDigest:hash};
// Reuse the authoritative history receipt shape; semantic validators enforce
// receipt actor, exact subject and all cross-field integrity constraints.
const historyEvent=(findingOpenApiSchemas.FindingHistoryRecord.properties.event as {oneOf:{properties:{receipt:Record<string,unknown>}}[]}).oneOf[0]!;
export const reproductionOpenApiSchemas={
 FindingReproductionStatus:object({...reference,dispatch:object({state:{type:'string',enum:['queued','bound','dispatched','settled']},cancelRequested:{type:'boolean'},cancellationCause:{type:'string',nullable:true,enum:['user','revoked','expired','permission-denied','superseded','unavailable',null]}}),receipt:{...object({value:{...historyEvent.properties.receipt,nullable:false},digest:hash}),nullable:true},nonExecution:{...object({value:{$ref:'#/components/schemas/ReproductionNonExecutionProof'},digest:hash}),nullable:true},settlement:{...object({kind:{type:'string',enum:['receipt-retained','never-staged','superseded']},findingVersion:{type:'integer',minimum:3,maximum:10000},historyDigest:hash,evidenceDigest:hash,retainedReceiptDigest:nullableHash,retainedProofDigest:nullableHash}),nullable:true}}),
 FindingReproductionCancellation:object({schemaVersion:reference.schemaVersion,id:uuid,cancelRequested:{type:'boolean',enum:[true]}}),
};
