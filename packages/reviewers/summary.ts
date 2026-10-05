import {REVIEWER_ROLES} from './roles.ts';
export interface ReviewExecutionSummary {
 schemaVersion:'v1alpha1';admissionId:string;admissionDigest:string;profileRevision:string;contextDigest:string;mode:'synthetic'|'live';
 coverage:{selectedFiles:number;configuredRoles:number;completedRoles:number;wholeRepository:false};
 roles:{requestId:string;role:string;digest:string;status:string}[];
 findings:{id:string;digest:string}[];
}
const exact=(v:any,keys:string[])=>v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const sha=(v:unknown)=>typeof v==='string'&&/^sha256:[a-f0-9]{64}$/.test(v);
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
export function validateReviewExecutionSummary(value:unknown):ReviewExecutionSummary{
 try{
  const s=value as ReviewExecutionSummary;
  if(!exact(s,['schemaVersion','admissionId','admissionDigest','profileRevision','contextDigest','mode','coverage','roles','findings'])||s.schemaVersion!=='v1alpha1'||!uuid(s.admissionId)||![s.admissionDigest,s.profileRevision,s.contextDigest].every(sha)||!['synthetic','live'].includes(s.mode))throw Error();
  if(!Array.isArray(s.roles)||!s.roles.length||s.roles.length>7||!Array.isArray(s.findings)||s.findings.length>64)throw Error();
  for(const r of s.roles)if(!exact(r,['requestId','role','digest','status'])||!uuid(r.requestId)||!(REVIEWER_ROLES as readonly string[]).includes(r.role)||!sha(r.digest)||!['completed','refused','incomplete'].includes(r.status))throw Error();
  if(new Set(s.roles.map(r=>r.requestId)).size!==s.roles.length||new Set(s.roles.map(r=>r.role)).size!==s.roles.length)throw Error();
  for(const f of s.findings)if(!exact(f,['id','digest'])||!sha(f.id)||!sha(f.digest))throw Error();
  if(new Set(s.findings.map(f=>f.id)).size!==s.findings.length)throw Error();
  const c=s.coverage;if(!exact(c,['selectedFiles','configuredRoles','completedRoles','wholeRepository'])||c.wholeRepository!==false||!Number.isSafeInteger(c.selectedFiles)||c.selectedFiles<1||c.selectedFiles>64||c.configuredRoles!==s.roles.length||c.completedRoles!==s.roles.filter(r=>r.status==='completed').length)throw Error();
  return structuredClone(s);
 }catch{throw Error('invalid-review-execution-summary');}
}
