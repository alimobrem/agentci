'use client';
import {useEffect,useRef,useState} from 'react';
import type {ReviewAdmissionRequest} from 'agentci/client';
import {historyEnvelope,exportEnvelope,canonical} from '../lib/retained-envelope';
type History=Awaited<ReturnType<typeof historyEnvelope>>;
type Export=Awaited<ReturnType<typeof exportEnvelope>>;
type State={kind:'idle'}|{kind:'loading'}|{kind:'failed';status:number}|{kind:'history';data:History}|{kind:'export';data:Export};
type Props={admission:ReviewAdmissionRequest;viewBinding:string;findingId?:string;pinnedDigest?:string};
/** A prop transition creates an empty buffer synchronously, before effects run. */
export function RetainedReader(props:Props){return <ScopedRetainedReader key={canonical(props)} {...props}/>;}
function ScopedRetainedReader({admission,viewBinding,findingId,pinnedDigest}:Props){
 const [state,setState]=useState<State>({kind:'idle'}),generation=useRef(0),active=useRef<AbortController|null>(null),url=useRef<string|null>(null);
 const clear=()=>{generation.current++;active.current?.abort();active.current=null;if(url.current)URL.revokeObjectURL(url.current);url.current=null;};
 useEffect(()=>{const hide=()=>{clear();setState({kind:'idle'});};window.addEventListener('pagehide',hide);return()=>{clear();window.removeEventListener('pagehide',hide);};},[admission.id,viewBinding,findingId]);
 async function session(signal:AbortSignal){const started=performance.now();const response=await fetch('/api/session',{cache:'no-store',signal});if(!response.ok)throw Object.assign(Error('session'),{status:response.status===401?401:503});const value=await response.json();if(value.viewBinding!==viewBinding||!Number.isFinite(value.validForMs)||value.validForMs-(performance.now()-started)<=0)throw Object.assign(Error('session'),{status:401});signal.throwIfAborted();return started+value.validForMs;}
 async function run(){clear();const current=generation.current,controller=new AbortController();active.current=controller;setState({kind:'loading'});const deadline=AbortSignal.any([controller.signal,AbortSignal.timeout(15000)]),expiry=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined,signal=deadline;try{
  const validUntil=await session(deadline);timer=setTimeout(()=>expiry.abort(Object.assign(Error('expired'),{status:401})),Math.max(0,validUntil-performance.now()));signal=AbortSignal.any([deadline,expiry.signal]);
  const path='/api/reviews/'+encodeURIComponent(admission.id)+(findingId?'/findings/'+encodeURIComponent(findingId)+'/history':'/export');
  const response=await fetch(path,{cache:'no-store',signal});if(!response.ok)throw Object.assign(Error('read'),{status:response.status});
  const value=await response.json();const data=findingId?await historyEnvelope(value,admission,findingId,pinnedDigest??''):await exportEnvelope(value,admission);
  signal.throwIfAborted();await session(signal);if(current===generation.current&&!signal.aborted)setState(findingId?{kind:'history',data:data as History}:{kind:'export',data:data as Export});
 }catch(error){if(current===generation.current&&!controller.signal.aborted)setState({kind:'failed',status:(signal.reason as {status?:number})?.status??(error as {status?:number}).status??503});}finally{clearTimeout(timer);}}
 async function download(){if(state.kind!=='export')return;const data=state.data;clear();const current=generation.current,controller=new AbortController();active.current=controller;const started=performance.now(),signal=AbortSignal.any([controller.signal,AbortSignal.timeout(15000)]);try{
  const validUntil=await session(signal);if(current!==generation.current||signal.aborted)return;
  // Same NDJSON frame format as the backend; the certificate is shown separately.
  const blob=new Blob([data.records.map(frame=>JSON.stringify(frame)+'\n').join('')],{type:'application/x-ndjson'});signal.throwIfAborted();if(performance.now()>=validUntil)throw Object.assign(Error('expired'),{status:401});if(performance.now()-started>=15000)throw Error('deadline');url.current=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url.current;link.download='agentci-review-'+admission.id+'.ndjson';link.click();URL.revokeObjectURL(url.current);url.current=null;
 }catch(error){if(current===generation.current&&!controller.signal.aborted)setState({kind:'failed',status:(error as {status?:number}).status??503});}}
 return <section aria-label={findingId?'Finding history':'Review export'} className="retained-reader"><h3>{findingId?'Finding history':'Review export'}</h3>{findingId&&<><p>A captured history watermark may include later events.</p><details className="technical-details"><summary>Summary-pinned digest</summary><code>{pinnedDigest}</code></details></>}<p>Complete evidence does not establish a passing review or a verified fix. Operator attestation and cancellation intent retain their original meaning.</p>
 {state.kind==='loading'?<><p role="status">Verifying {findingId?'history through its final page':'export through end and EOF'}… Nothing partial is complete.</p><button onClick={()=>{clear();setState({kind:'idle'});}}>Stop read</button></>:<button onClick={()=>void run()} disabled={!viewBinding}>{findingId?'Read complete history':'Verify complete export'}</button>}
 {state.kind==='failed'&&<p role="alert">{state.status===401?'Your session expired, changed or was revoked.':state.status===409?'Review evidence is incomplete.':state.status===404?'Retained evidence was not found.':state.status===413?'Evidence exceeds the bounded read limit.':'Evidence unavailable or failed integrity checks.'} No complete result or download is available.</p>}
 {state.kind==='history'&&<><p role="status">Complete captured history through version {state.data.throughVersion}; {state.data.pageCount} verified pages.</p><ol className="history-timeline">{state.data.records.map(record=><li key={record.digest}><p>Version {record.event.finding.version}: {record.event.action.type} · {record.event.finding.state}</p><details><summary>Full event digest</summary><code>{record.digest}</code></details>{record.event.receipt&&<p>{record.event.receipt.actor}: {record.event.receipt.outcome}{record.event.receipt.actor==='operator'?' — not a verified fix':''}</p>}</li>)}</ol></>}
 {state.kind==='export'&&<><p role="status">Complete snapshot verified after end and EOF. Execution: {state.data.certificate.header.review.execution.state}. Missing roles: {state.data.certificate.header.missingRoleIds.length}.</p><details className="technical-details"><summary>Snapshot identity</summary><p>Snapshot: <code>{state.data.certificate.header.snapshotDigest}</code></p></details><button onClick={()=>void download()}>Download verified snapshot</button></>}
 </section>;
}
