'use client';
import {useEffect,useRef,useState} from 'react';
import type {ReviewAdmissionRequest} from 'agentci/client';
import type {readDashboard} from '../lib/dashboard';
import {ReviewDetail} from './review-detail';
type Data=Awaited<ReturnType<typeof readDashboard>>;
/** Existing authenticated data route owns contract validation and credentials. */
export function ReviewLoader({expected,viewBinding}:{expected:ReviewAdmissionRequest;viewBinding:string}){
 const [state,setState]=useState<{kind:'loading'}|{kind:'ready';data:Data}|{kind:'failed';status:number}>({kind:'loading'}),[retry,setRetry]=useState(0),generation=useRef(0);
 useEffect(()=>{
  const current=++generation.current,controller=new AbortController();setState({kind:'loading'});
  const stop=()=>controller.abort();window.addEventListener('pagehide',stop);
  void(async()=>{try{
   const response=await fetch('/api/reviews/'+encodeURIComponent(expected.id),{cache:'no-store',signal:controller.signal});
   if(!response.ok){if(generation.current===current&&!controller.signal.aborted)setState({kind:'failed',status:response.status});return;}
   const data=await response.json() as Data;
   if(JSON.stringify(data.admission)!==JSON.stringify(expected)||!data.status||!Array.isArray(data.findings)||!['retained','unavailable'].includes(data.evidence))throw Error('invalid-detail');
   if(generation.current===current&&!controller.signal.aborted)setState({kind:'ready',data});
  }catch{if(generation.current===current&&!controller.signal.aborted)setState({kind:'failed',status:503});}})();
  return()=>{generation.current++;controller.abort();window.removeEventListener('pagehide',stop);};
 },[expected,retry]);
 if(state.kind==='ready')return <ReviewDetail data={state.data} viewBinding={viewBinding}/>;
 if(state.kind==='loading')return <p role="status">Loading review evidence…</p>;
 return <section role="alert"><h2>Review unavailable</h2><p>{state.status===401?'Your session expired or was revoked. Sign in again.':state.status===409?'Review evidence is incomplete.':state.status===404?'The review was not found.':state.status===413?'Evidence exceeds the bounded display limit.':'Access, evidence integrity or the upstream request could not be verified.'} No passing result is established.</p><button className="rounded border px-3 py-2" onClick={()=>setRetry(v=>v+1)}>Retry read</button></section>;
}
