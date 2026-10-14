'use client';
import {useEffect,useState,type ReactNode} from 'react';
/** Conceal the previously verified view while checking. Preserve its React
 * state only for an identical binding; invalidation destroys it and aborts reads. */
export function SessionBoundary({children,viewBinding}:{children:ReactNode;viewBinding:string}){
 const [verifiedBinding,setVerifiedBinding]=useState<string|null>(null);
 const [state,setState]=useState<'checking'|'valid'|'expired'|'unavailable'|'changed'>('checking');
 useEffect(()=>{
  let active=true,generation=0;let controller:AbortController|undefined,expiry:ReturnType<typeof setTimeout>|undefined;
  const discard=(next:'expired'|'unavailable'|'changed')=>{generation++;controller?.abort();clearTimeout(expiry);setVerifiedBinding(null);setState(next);};
  // Keep the old expiry deadline active while pending: a stalled check cannot
  // extend an earlier server TTL or resurrect a response after expiry.
  const hide=()=>{generation++;controller?.abort();setState('checking');};
  const check=async()=>{
   const current=++generation;controller?.abort();setState('checking');
   controller=new AbortController();const started=performance.now();
   try{
    const response=await fetch('/api/session',{cache:'no-store',signal:controller.signal});
    const data=response.ok?await response.json():null;
    const remaining=data&&data.viewBinding===viewBinding&&Number.isFinite(data.validForMs)&&data.validForMs>0&&data.validForMs<=1800000?data.validForMs-(performance.now()-started):0;
    if(active&&current===generation){
     if(remaining>0){clearTimeout(expiry);setVerifiedBinding(viewBinding);setState('valid');expiry=setTimeout(()=>discard('expired'),remaining);}
     else discard(response.status===401?'expired':response.ok&&data?.viewBinding!==viewBinding?'changed':data&&Number.isFinite(data.validForMs)?'expired':'unavailable');
    }
   }catch{if(active&&current===generation)discard('unavailable');}
  };
  const visibility=()=>{if(document.visibilityState==='hidden')hide();else void check();};
  window.addEventListener('pagehide',hide);window.addEventListener('pageshow',check);window.addEventListener('focus',check);document.addEventListener('visibilitychange',visibility);
  const timer=setInterval(check,30000);void check();
  return()=>{active=false;controller?.abort();clearTimeout(expiry);clearInterval(timer);window.removeEventListener('pagehide',hide);window.removeEventListener('pageshow',check);window.removeEventListener('focus',check);document.removeEventListener('visibilitychange',visibility);};
 },[viewBinding]);
 const visible=state==='valid'&&verifiedBinding===viewBinding;
 const preserve=verifiedBinding===viewBinding&&(state==='valid'||state==='checking');
 let notice:ReactNode=<p role="status">Checking your session…</p>;
 if(state==='changed')notice=<section role="alert"><h1>Session changed</h1><p>Reopen your authorized reviews for the current account. Cached review content is hidden.</p><a href="/">Open current account</a></section>;
 if(state==='expired')notice=<section role="alert"><h1>Session expired or revoked</h1><p>Sign in again to view this review. Retained evidence has not been marked expired.</p><a href="/">Sign in again</a></section>;
 if(state==='unavailable')notice=<section role="alert"><h1>Session verification unavailable</h1><p>No protected review is shown while your access cannot be verified.</p><a href="/">Retry sign-in</a></section>;
 return <>{preserve&&<div data-session-content hidden={!visible} inert={!visible} aria-hidden={!visible}>{children}</div>}{!visible&&notice}</>;
}
