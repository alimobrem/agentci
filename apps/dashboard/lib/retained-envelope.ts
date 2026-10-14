import type {ReviewAdmissionRequest} from 'agentci/client';
import type {readFindingHistory,readReviewExport} from './retained-reads';
/** Browser transport guard. Full domain verification remains in the server SDK. */
export function canonical(value:unknown):string{
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 return '{'+Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,v])=>JSON.stringify(key)+':'+canonical(v)).join(',')+'}';
}
async function digest(value:unknown){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value)));return 'sha256:'+Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');}
function invalid():never{throw Error('Unverified retained response');}
export async function historyEnvelope(value:unknown,expected:ReviewAdmissionRequest,id:string,pinnedDigest:string){
 const data=value as Awaited<ReturnType<typeof readFindingHistory>>;
 if(!data||data.kind!=='history'||data.complete!==true||canonical(data.admission)!==canonical(expected)||data.findingId!==id||!Number.isSafeInteger(data.throughVersion)||data.throughVersion<1||!Array.isArray(data.records)||data.records.length!==data.throughVersion)invalid();
 if(data.summaryReference?.id!==id||data.summaryReference.digest!==pinnedDigest||data.records[data.summaryReference.version-1]?.digest!==pinnedDigest)invalid();
 let previous:string|null=null;
 for(let i=0;i<data.records.length;i++){const record=data.records[i]!;if(record.event.finding.id!==id||record.event.finding.version!==i+1||canonical(record.event.finding.subject)!==canonical(expected.subject)||record.event.previousDigest!==previous||record.digest!==await digest(record.event))invalid();previous=record.digest;}
 return data;
}
export async function exportEnvelope(value:unknown,expected:ReviewAdmissionRequest){
 const data=value as Awaited<ReturnType<typeof readReviewExport>>;
 if(!data||data.kind!=='export'||canonical(data.admission)!==canonical(expected)||data.certificate?.complete!==true||!Array.isArray(data.records)||data.records.length<2)invalid();
 const first=data.records[0]!,last=data.records.at(-1)!;
 if(first.type!=='header'||last.type!=='end'||canonical(first.data)!==canonical(data.certificate.header)||canonical(data.certificate.header.review.admission.request)!==canonical(expected)||last.digest!==data.certificate.endDigest)invalid();
 let previous='sha256:'+'0'.repeat(64),reviewers=0,events=0;
 for(let i=0;i<data.records.length;i++){const frame=data.records[i]!,{digest:given,...content}=frame;
  if(frame.sequence!==i||frame.previousDigest!==previous||given!==await digest(content)||(i>0&&i<data.records.length-1&&!['reviewer','finding'].includes(frame.type)))invalid();
  if(frame.type==='reviewer')reviewers++;if(frame.type==='finding')events++;previous=given;
 }
 if(last.data.snapshotDigest!==first.data.snapshotDigest||last.data.reviewerCount!==reviewers||last.data.eventCount!==events||first.data.reviewerCount!==reviewers||first.data.eventCount!==events||last.data.lastContentDigest!==last.previousDigest)invalid();
 const {snapshotDigest,...snapshot}=first.data;if(snapshotDigest!==await digest(snapshot))invalid();
 return data;
}
