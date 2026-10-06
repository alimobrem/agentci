import type {ReviewSubject} from './context.ts';
import {validateFindingHistoryRecord,validateFindingHistoryLink,type FindingHistoryRecord} from '../findings/history.ts';
export interface ModelReviewFindings {schemaVersion:'v1alpha1';reviewId:string;summaryDigest:string;items:{id:string;version:number;digest:string}[];nextCursor:string|null}
export interface ModelFindingHistory {schemaVersion:'v1alpha1';reviewId:string;findingId:string;throughVersion:number;items:FindingHistoryRecord[];nextCursor:string|null}
const exact=(v:any,keys:string[])=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys.sort().join(',');
const hash=(v:unknown)=>typeof v==='string'&&/^sha256:[a-f0-9]{64}$/.test(v);
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const version=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>=1&&Number(v)<=10000;
const cursor=(v:unknown)=>v===null||typeof v==='string'&&/^[A-Za-z0-9_-]{1,2048}$/.test(v);
function fail():never{throw Error('invalid-finding-transport');}
function base(v:any,keys:string[]){if(!exact(v,keys)||v.schemaVersion!=='v1alpha1'||!uuid(v.reviewId)||!Array.isArray(v.items)||v.items.length>100||!cursor(v.nextCursor)||v.nextCursor!==null&&!v.items.length||Buffer.byteLength(JSON.stringify(v))>4*1024*1024)fail();}
export function validateModelReviewFindings(value:unknown):ModelReviewFindings{
 const v=value as ModelReviewFindings;base(v,['schemaVersion','reviewId','summaryDigest','items','nextCursor']);if(!hash(v.summaryDigest))fail();let previous='';
 for(const i of v.items){if(!exact(i,['id','version','digest'])||!hash(i.id)||!version(i.version)||!hash(i.digest)||i.id<=previous)fail();previous=i.id;}return structuredClone(v);
}
export async function validateModelFindingHistory(value:unknown,subject:ReviewSubject,previous?:FindingHistoryRecord):Promise<ModelFindingHistory>{
 const v=value as ModelFindingHistory;base(v,['schemaVersion','reviewId','findingId','throughVersion','items','nextCursor']);if(!hash(v.findingId)||!version(v.throughVersion)||!v.items.length)fail();
 let prior:FindingHistoryRecord|undefined=previous;
 for(const raw of v.items){const r=validateFindingHistoryRecord(raw,subject);if(r.event.finding.id!==v.findingId||r.event.finding.version>v.throughVersion)fail();if(prior||r.event.finding.version===1)await validateFindingHistoryLink(r,subject,prior);prior=r;}
 if((prior!.event.finding.version<v.throughVersion)!==(v.nextCursor!==null))fail();return structuredClone(v);
}
