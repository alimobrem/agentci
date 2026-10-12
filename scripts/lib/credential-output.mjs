import {Transform} from 'node:stream';
import {StringDecoder} from 'node:string_decoder';

// Keep the original tail until the next chunk, including matches crossing a cut.
export function credentialOutput(values) {
 const secrets=[...new Set(values.filter(value=>typeof value==='string'&&value.length))].sort((a,b)=>b.length-a.length);
 const keep=Math.max(1,...secrets.map(value=>value.length))-1,decoder=new StringDecoder('utf8');let pending='';
 const redact=text=>secrets.reduce((result,secret)=>result.split(secret).join('[REDACTED]'),text);
 return new Transform({transform(chunk,encoding,done){
  pending+=decoder.write(chunk);let cut=Math.max(0,pending.length-keep);
  for(const secret of secrets){let index=pending.indexOf(secret);while(index>=0){if(index<cut&&index+secret.length>cut)cut=index;index=pending.indexOf(secret,index+1);}}
  if(cut){this.push(redact(pending.slice(0,cut)));pending=pending.slice(cut);}done();
 },flush(done){
  let tail=redact(pending+decoder.end());
  // A cancelled child may terminate halfway through an authentication value.
  for(const secret of secrets)for(let length=Math.min(secret.length-1,tail.length);length>0;length--)if(tail.endsWith(secret.slice(0,length))){tail=tail.slice(0,-length)+'[REDACTED]';break;}
  this.push(tail);done();}});
}
