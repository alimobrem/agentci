import {createHash} from 'node:crypto';
import {canonical,digest} from './engine.ts';
import type {Snapshot} from './types.ts';
import {VERSION} from '../version.ts';
export const INTENT_PATH='.agentci/intent.json',MAX_INTENT_SOURCE_BYTES=12288,MAX_INTENT_SUMMARY_BYTES=8192;
export interface IntentSubject {organizationId:string;repository:string;pullRequest:number;baseSha:string;headSha:string}
export interface IntentRecord {schemaVersion:'v1alpha1';reviewId:string;subject:IntentSubject;summary:string;classification:'asserted';source:{kind:'repository-declaration';path:typeof INTENT_PATH;gitSha:string;blobSha:string;contentDigest:string;bytes:number;content:string};producer:{name:'agentci';version:string};digest:string}
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const exact=(v:unknown,keys:string[]):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
function fail():never{throw Error('invalid-intent-record');}
function declaration(content:string):string{
 if(Buffer.byteLength(content)>MAX_INTENT_SOURCE_BYTES||Buffer.from(content).toString('utf8')!==content)fail();
 let value;try{value=JSON.parse(content);}catch{fail();}
 if(!exact(value,['schemaVersion','summary'])||value.schemaVersion!=='v1alpha1'||typeof value.summary!=='string'||!value.summary.trim()||Buffer.byteLength(value.summary)>MAX_INTENT_SUMMARY_BYTES||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value.summary)||Buffer.from(value.summary).toString('utf8')!==value.summary)fail();
 return value.summary;
}
export function validateIntentRecord(input:unknown,expected?:IntentSubject&{reviewId:string;digest?:string}):IntentRecord{
 if(!exact(input,['schemaVersion','reviewId','subject','summary','classification','source','producer','digest']))fail();
 const r=input as unknown as IntentRecord,s=r.subject,src=r.source;
 if(r.schemaVersion!=='v1alpha1'||typeof r.reviewId!=='string'||!uuid.test(r.reviewId)||!exact(s,['organizationId','repository','pullRequest','baseSha','headSha'])||typeof s.organizationId!=='string'||!uuid.test(s.organizationId)||typeof s.repository!=='string'||!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(s.repository)||!Number.isSafeInteger(s.pullRequest)||s.pullRequest<1||![s.baseSha,s.headSha].every(x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x))||r.classification!=='asserted'||!exact(r.producer,['name','version'])||r.producer.name!=='agentci'||typeof r.producer.version!=='string'||!r.producer.version||r.producer.version.length>128)fail();
 if(!exact(src,['kind','path','gitSha','blobSha','contentDigest','bytes','content'])||src.kind!=='repository-declaration'||src.path!==INTENT_PATH||src.gitSha!==s.headSha||typeof src.content!=='string'||src.bytes!==Buffer.byteLength(src.content)||src.blobSha!==createHash('sha1').update(`blob ${src.bytes}\0`).update(src.content).digest('hex')||src.contentDigest!==digest(src.content)||r.summary!==declaration(src.content))fail();
 const {digest:hash,...payload}=r;if(hash!==digest(canonical(payload)))fail();
 if(expected&&(r.reviewId!==expected.reviewId||expected.digest!==undefined&&hash!==expected.digest||Object.entries(s).some(([key,value])=>value!==expected[key as keyof IntentSubject])))throw Error('intent-identity-mismatch');
 return structuredClone(r);
}
/** Only an explicit repository declaration is captured. No title/body, inference or truncation. */
export function captureIntent(reviewId:string,subject:IntentSubject,head:Snapshot):IntentRecord|undefined{
 if(head.sha!==subject.headSha)throw Error('intent-identity-mismatch');
 if(!Object.hasOwn(head.files,INTENT_PATH))return undefined;const content=head.files[INTENT_PATH]!;
 const summary=declaration(content),bytes=Buffer.byteLength(content),payload={schemaVersion:'v1alpha1' as const,reviewId,subject:structuredClone(subject),summary,classification:'asserted' as const,source:{kind:'repository-declaration' as const,path:INTENT_PATH,gitSha:head.sha,blobSha:createHash('sha1').update(`blob ${bytes}\0`).update(content).digest('hex'),contentDigest:digest(content),bytes,content},producer:{name:'agentci' as const,version:VERSION}};
 return validateIntentRecord({...payload,digest:digest(canonical(payload))});
}
