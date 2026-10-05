import type {Pool,PoolClient} from 'pg';
import {canonical,digest} from '../review/engine.ts';
import {validateReviewAdmission,validateReviewAdmissionApproval,type ReviewAdmissionRequest,type ReviewAdmissionApproval} from '../reviewers/admission.ts';
export class ReviewAdmissionConflict extends Error {constructor(){super('review-admission-conflict');}}
export class ReviewAdmissionUnavailable extends Error {constructor(){super('review-admission-unavailable');}}
export class ReviewAdmissionDenied extends Error {constructor(){super('review-admission-denied');}}
export interface ReviewAdmissionAuthorizer {approve(request:ReviewAdmissionRequest):Promise<ReviewAdmissionApproval>}
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const fail=():never=>{throw new ReviewAdmissionConflict();};
export class ReviewAdmissionStore {
 private readonly scope:{organizationId:string;repository:string};
 constructor(private readonly pool:Pool,scope:{organizationId:string;repository:string},private readonly authorizer:ReviewAdmissionAuthorizer){
  if(!uuid(scope.organizationId)||typeof scope.repository!=='string'||scope.repository.length>256||!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(scope.repository))fail();
  this.scope={organizationId:scope.organizationId.toLowerCase(),repository:scope.repository};
 }
 private async transaction<T>(run:(client:PoolClient)=>Promise<T>):Promise<T>{
  let client:PoolClient;try{client=await this.pool.connect();}catch{throw new ReviewAdmissionUnavailable();}
  let broken=false;try{await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='10s'");const result=await run(client);await client.query('COMMIT');return result;}
  catch(error){try{await client.query('ROLLBACK');}catch{broken=true;}if(error instanceof ReviewAdmissionConflict)throw error;throw new ReviewAdmissionUnavailable();}
  finally{client.release(broken);}
 }
 private decode(row:any){
  try{
   const request=validateReviewAdmission(row.request),approval=validateReviewAdmissionApproval(row.approval,request);
   if(request.id!==row.id||request.subject.organizationId!==this.scope.organizationId||request.subject.repository!==this.scope.repository||row.digest!==digest(canonical(request))||row.approval_digest!==digest(canonical(approval)))fail();
   return {request,approval,digest:row.digest as string,approvalDigest:row.approval_digest as string};
  }catch{return fail();}
 }
 async get(id:string){
  if(!uuid(id))fail();
  return this.transaction(async client=>{const row=(await client.query('SELECT * FROM agentci_review_admissions WHERE organization_id=$1 AND repository=$2 AND id=$3',[this.scope.organizationId,this.scope.repository,id.toLowerCase()])).rows[0];return row?this.decode(row):undefined;});
 }
 async admit(value:unknown){
  let request:ReviewAdmissionRequest;try{request=validateReviewAdmission(value);}catch{return fail();}
  if(request.subject.organizationId!==this.scope.organizationId||request.subject.repository!==this.scope.repository)fail();
  const hash=digest(canonical(request)),prior=await this.get(request.id);
  // Transport authenticates every caller. An exact retry returns the original
  // admission; it does not authorize another profile or create another outbox row.
  if(prior){if(prior.digest!==hash)fail();return prior;}
  let approval:ReviewAdmissionApproval;
  try{approval=validateReviewAdmissionApproval(await this.authorizer.approve(structuredClone(request)),request);}
  catch(error){if(error instanceof ReviewAdmissionDenied)throw error;throw new ReviewAdmissionUnavailable();}
  return this.transaction(async client=>{
   const values=[this.scope.organizationId,this.scope.repository,request.id,hash,request,digest(canonical(approval)),approval];
   const inserted=await client.query('INSERT INTO agentci_review_admissions(organization_id,repository,id,digest,request,approval_digest,approval) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(organization_id,repository,id) DO NOTHING RETURNING *',values);
   const row=inserted.rows[0]??(await client.query('SELECT * FROM agentci_review_admissions WHERE organization_id=$1 AND repository=$2 AND id=$3',values.slice(0,3))).rows[0];
   if(!row||row.digest!==hash)fail();
   if(inserted.rowCount)await client.query('INSERT INTO agentci_review_admission_outbox(organization_id,repository,id) VALUES($1,$2,$3)',values.slice(0,3));
   return this.decode(row);
  });
 }
}
