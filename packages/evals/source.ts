import {canonical,digest} from '../review/engine.ts';
export interface ReproductionEvalSource {
 schemaVersion:'v1alpha1';kind:'finding-reproduction';organizationId:string;
 admissionId:string;operationId:string;planId:string;planDigest:string;requestDigest:string;
 inputDigests:{base:string;head:string};definitionDigest:string;
}
export class UnsupportedEvalSource extends Error {constructor(){super('unsupported-eval-source');}}
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const sha=(v:unknown)=>typeof v==='string'&&/^sha256:[a-f0-9]{64}$/.test(v);
export function validateReproductionEvalSource(value:unknown):ReproductionEvalSource{
 const v=value as ReproductionEvalSource;
 if(!v||Object.keys(v).sort().join(',')!=='admissionId,definitionDigest,inputDigests,kind,operationId,organizationId,planDigest,planId,requestDigest,schemaVersion'||v.schemaVersion!=='v1alpha1'||v.kind!=='finding-reproduction'||![v.organizationId,v.admissionId,v.operationId,v.planId].every(uuid)||![v.planDigest,v.requestDigest,v.definitionDigest].every(sha)||!v.inputDigests||Object.keys(v.inputDigests).sort().join(',')!=='base,head'||![v.inputDigests.base,v.inputDigests.head].every(sha))throw Error('invalid-eval-source');
 return structuredClone(v);
}
/** Credential-free worker validation: source carries approved digests bound by
 * controller-only SQL insertion authority, never privileges on approval tables. */
export function verifyReproductionEvalInputs(value:unknown,organizationId:string,attemptKey:string,inputs:any,plan:any,definition:unknown){
 const source=validateReproductionEvalSource(value);
 if(source.organizationId!==organizationId.toLowerCase()||source.planId!==attemptKey||digest(canonical(inputs?.base?.snapshot?.files))!==source.inputDigests.base||digest(canonical(inputs?.head?.snapshot?.files))!==source.inputDigests.head||digest(canonical(definition))!==source.definitionDigest||canonical(plan)!==canonical({units:[definition],suiteChanges:[],coverageGaps:[],selectionGaps:[]}))throw Error('Eval source authority mismatch');
 return source;
}
