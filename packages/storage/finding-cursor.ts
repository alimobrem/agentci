import {createHmac,timingSafeEqual} from 'node:crypto';
import {canonical} from '../review/engine.ts';
export class FindingReadFailure extends Error {constructor(public status:number,public code:string){super(code);}}
export interface FindingCursor {route:'findings'|'history';organizationId:string;repository:string;reviewId:string;findingId:string|null;summaryDigest:string|null;throughVersion:number|null;next:number;previousDigest:string|null;expires:number}
/** Cursor signatures are independent of authentication; each page still authenticates. */
export class FindingCursors {
 constructor(private key:string,private now=()=>Date.now()){if(key.length<32||/[\r\n]/.test(key))throw Error('Invalid finding cursor key');}
 encode(value:Omit<FindingCursor,'expires'>){const data={...value,expires:this.now()+15*60*1000};const payload=canonical(data),mac=createHmac('sha256',this.key).update(payload).digest('hex');return Buffer.from(JSON.stringify({data,mac})).toString('base64url');}
 decode(value:string,expected:Pick<FindingCursor,'route'|'organizationId'|'repository'|'reviewId'|'findingId'>):FindingCursor{
  try{
   if(!/^[A-Za-z0-9_-]{1,2048}$/.test(value))throw Error();const bytes=Buffer.from(value,'base64url');if(bytes.toString('base64url')!==value)throw Error();const wrapped=JSON.parse(bytes.toString('utf8'));
   if(Object.keys(wrapped).sort().join(',')!=='data,mac'||typeof wrapped.mac!=='string'||!/^[a-f0-9]{64}$/.test(wrapped.mac))throw Error();
   const actual=Buffer.from(wrapped.mac,'hex'),mac=createHmac('sha256',this.key).update(canonical(wrapped.data)).digest();if(!timingSafeEqual(actual,mac))throw Error();
   const c=wrapped.data as FindingCursor;if(Object.keys(c).sort().join(',')!=='expires,findingId,next,organizationId,previousDigest,repository,reviewId,route,summaryDigest,throughVersion'||Object.entries(expected).some(([k,v])=>c[k as keyof FindingCursor]!==v)||!Number.isSafeInteger(c.expires)||c.expires<=this.now()||c.expires>this.now()+15*60*1000||!Number.isSafeInteger(c.next)||c.next<1)throw Error();
   return c;
  }catch{throw new FindingReadFailure(400,'invalid-cursor');}
 }
}
