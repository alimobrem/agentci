/** Parse only bounded delay metadata; never retain provider messages or response bodies. */
export function providerRetryDelay(headers:Headers|undefined,now=Date.now()):number|null{
 const millis=headers?.get('retry-after-ms'),seconds=headers?.get('retry-after');
 const numeric=(value:string|null|undefined,multiplier:number)=>{
  if(!value||!/^\d+(?:\.\d+)?$/.test(value.trim()))return null;
  // A syntactically valid delay that overflows must stop retries, not fall back
  // to a short jitter delay. The core rejects this sentinel against policy.
  const result=Math.ceil(Number(value)*multiplier);return Number.isSafeInteger(result)?result:Number.MAX_SAFE_INTEGER;
 };
 const ms=numeric(millis,1);if(ms!==null)return ms;
 const sec=numeric(seconds,1000);if(sec!==null)return sec;
 if(seconds&&seconds.length<=64&&!/^[-+\d.]+$/.test(seconds.trim())){const parsed=Date.parse(seconds);if(Number.isFinite(parsed))return Math.max(0,parsed-now);}
 return null;
}
