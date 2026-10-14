import {cookies} from 'next/headers';
import {z} from 'zod';
import {runtime} from '../lib/runtime';
import {validatedReviewBindings} from '../lib/admissions';
import {SESSION_COOKIE,authorize} from '../lib/session';
import type {ReviewAdmissionRequest} from 'agentci/client';
import {ReviewLoader} from '../components/review-loader';
import {SessionBoundary} from '../components/session-boundary';
import {RefreshReview} from '../components/refresh-review';
import {SignOut} from '../components/sign-out';
import {ReviewQueue} from '../components/review-queue';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{review?:string}>}){
 let r:ReturnType<typeof runtime>;try{r=runtime();}catch{return <section><h1 className="text-2xl font-semibold">Dashboard setup pending</h1><p>A trusted OIDC issuer and scoped server configuration are required. No review data is exposed.</p></section>;}
 const originalSessionId=(await cookies()).get(SESSION_COOKIE)?.value;
 let session;try{session=r.sessions.read(originalSessionId);}catch{return <section><h1 className="text-2xl font-semibold">Sign in to view reviews</h1><form method="post" action="/auth/login"><button className="primary-button">Sign in with your identity provider</button></form></section>;}
 let reviews;try{reviews=await validatedReviewBindings(r.reviews);}catch{return <section role="alert"><h1>Dashboard configuration unavailable</h1><p>No review data is exposed while configuration cannot be verified.</p></section>;}
 const allowed=Object.entries(reviews).filter(([,b])=>{try{authorize(session.principal,b.admission.subject.organizationId,b.admission.subject.repository);return true;}catch{return false;}});
 const selected=(await searchParams).review;let expected:ReviewAdmissionRequest|undefined;try{if(selected){z.uuid().parse(selected);const binding=reviews[selected];if(!binding||binding.admission.id!==selected)throw Error();authorize(session.principal,binding.admission.subject.organizationId,binding.admission.subject.repository);expected=structuredClone(binding.admission);}}catch{return <section role="alert"><h1>Review unavailable</h1><p>Access, evidence integrity or the upstream request could not be verified.</p><a href="/">Return to authorized reviews</a></section>;}
 try{r.sessions.read(originalSessionId);}catch{return <section role="alert"><h1>Session expired or revoked</h1><p>Sign in again. Retained evidence is unchanged.</p><a href="/">Sign in again</a></section>;}
 return <SessionBoundary key={session.viewBinding+':'+(expected?JSON.stringify(expected):'queue')} viewBinding={session.viewBinding}><header className="workspace-heading"><div><span className="eyebrow">CHANGE INTELLIGENCE / REVIEW</span><h1>Authorized reviews</h1><p>Inspect the change. Follow the proof.</p></div><div className="workspace-actions"><RefreshReview/><SignOut csrf={session.csrf}/></div></header><div className="review-workspace"><ReviewQueue reviews={allowed.map(([id,b])=>({id,repository:b.admission.subject.repository,pullRequest:b.admission.subject.pullRequest,headSha:b.admission.subject.headSha}))} selected={selected}/><div className="review-content">{expected?<ReviewLoader key={expected.id} expected={expected} viewBinding={session.viewBinding}/>:<section className="welcome-panel"><span className="welcome-glyph" aria-hidden="true">⌘</span><span className="eyebrow">TRACEABLE BY DESIGN</span><h2>Choose a change.<br/>Inspect its evidence.</h2><p>Open an authorized PR to see execution state, coverage and retained findings. A completed run alone does not establish a passing review.</p><div className="welcome-steps"><span><b>01</b> Select a review</span><span><b>02</b> Assess the finding</span><span><b>03</b> Follow the evidence</span></div></section>}</div></div></SessionBoundary>;
}
