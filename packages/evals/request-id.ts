import {createHash} from 'node:crypto';
/** RFC 9562 Appendix B.2 name-based SHA-256 UUIDv8; the name is application-specific. */
export function nameUuid(namespace:string,name:string):string {
  if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(namespace)||typeof name!=='string'||!name||Buffer.byteLength(name)>2048)throw new Error('Invalid request ID namespace/name');
  const bytes=createHash('sha256').update(Buffer.from(namespace.replaceAll('-',''),'hex')).update(name,'utf8').digest().subarray(0,16);
  bytes[6]=(bytes[6]!&0x0f)|0x80;bytes[8]=(bytes[8]!&0x3f)|0x80;
  const hex=bytes.toString('hex');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export function trialRequestId(unitId:string,index:number):string {
  if(!Number.isSafeInteger(index)||index<0||index>=1000)throw new Error('Invalid eval trial index');
  return nameUuid(unitId,`agentci:http-eval-trial:v1:${index}`);
}
