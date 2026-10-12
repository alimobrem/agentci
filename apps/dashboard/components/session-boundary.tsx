'use client';
import {useEffect,useState,type ReactNode} from 'react';
/** Page navigation only aborts this browser read. It never cancels controller work. */
export function SessionBoundary({children,viewBinding}:{children:ReactNode;viewBinding:string}){
 const [verifiedBinding,setVerifiedBinding]=useState<string|null>(null);
 const [state,setState]=useState<'checking'|'valid'|'expired'|'unavailable'|'changed'>('checking');
 useEffect(()=>{
  let active=true,generation=0;let controller:AbortController|undefined,expiry:ReturnType<typeof setTimeout>|undefined;
  const hide=()=>{generation++;controller?.abort();clearTimeout(expiry);setState('checking');};
  const check=async()=>{
   const current=++generation;controller?.abort();clearTimeout(expiry);setState('checking');
   controller=new AbortController();const started=performance.now();
   try{
    const response=await fetch('/api/session',{cache:'no-store',signal:controller.signal});
    const data=response.ok?await response.json():null;
    // Server computes remaining TTL. Subtract the entire round trip conservatively;
    // browser wall-clock skew cannot extend the server's session lifetime.
    const remaining=data&&data.viewBinding===viewBinding&&Number.isFinite(data.validForMs)&&data.validForMs>0&&data.validForMs<=1800000?data.validForMs-(performance.now()-started):0;
    if(active&&current===generation){if(remaining>0)setVerifiedBinding(viewBinding);setState(remaining>0?'valid':response.status===401?'expired':response.ok&&data?.viewBinding!==viewBinding?'changed':data&&Number.isFinite(data.validForMs)?'expired':'unavailable');if(remaining>0)expiry=setTimeout(()=>{hide();setState('expired');},remaining);}
   }catch{if(active&&current===generation)setState('unavailable');}
  };
  const visibility=()=>{if(document.visibilityState==='hidden')hide();else void check();};
  window.addEventListener('pagehide',hide);window.addEventListener('pageshow',check);window.addEventListener('focus',check);document.addEventListener('visibilitychange',visibility);
  const timer=setInterval(check,30000);void check();
  return()=>{active=false;controller?.abort();clearTimeout(expiry);clearInterval(timer);window.removeEventListener('pagehide',hide);window.removeEventListener('pageshow',check);window.removeEventListener('focus',check);document.removeEventListener('visibilitychange',visibility);};
 },[viewBinding]);
 if(state==='valid'&&verifiedBinding===viewBinding)return <>{children}</>;
 if(state==='changed')return <section role="alert"><h1>Session changed</h1><p>Reopen your authorized reviews for the current account. Cached review content is hidden.</p><a href="/">Open current account</a></section>;
 if(state==='expired')return <section role="alert"><h1>Session expired or revoked</h1><p>Sign in again to view this review. Retained evidence has not been marked expired.</p><a href="/">Sign in again</a></section>;
 if(state==='unavailable')return <section role="alert"><h1>Session verification unavailable</h1><p>No protected review is shown while your access cannot be verified.</p><a href="/">Retry sign-in</a></section>;
 return <p role="status">Checking your session…</p>;
}
