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
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{review?:string}>}){
 let r:ReturnType<typeof runtime>;try{r=runtime();}catch{return <section><h1 className="text-2xl font-semibold">Dashboard setup pending</h1><p>A trusted OIDC issuer and scoped server configuration are required. No review data is exposed.</p></section>;}
 const originalSessionId=(await cookies()).get(SESSION_COOKIE)?.value;
 let session;try{session=r.sessions.read(originalSessionId);}catch{return <section><h1 className="text-2xl font-semibold">Sign in to view reviews</h1><form method="post" action="/auth/login"><button className="mt-4 rounded border bg-white px-4 py-2">Sign in with your identity provider</button></form></section>;}
 let reviews;try{reviews=await validatedReviewBindings(r.reviews);}catch{return <section role="alert"><h1>Dashboard configuration unavailable</h1><p>No review data is exposed while configuration cannot be verified.</p></section>;}
 const allowed=Object.entries(reviews).filter(([,b])=>{try{authorize(session.principal,b.admission.subject.organizationId,b.admission.subject.repository);return true;}catch{return false;}});
 const selected=(await searchParams).review;let expected:ReviewAdmissionRequest|undefined;try{if(selected){z.uuid().parse(selected);const binding=reviews[selected];if(!binding||binding.admission.id!==selected)throw Error();authorize(session.principal,binding.admission.subject.organizationId,binding.admission.subject.repository);expected=structuredClone(binding.admission);}}catch{return <section role="alert"><h1>Review unavailable</h1><p>Access, evidence integrity or the upstream request could not be verified.</p><a href="/">Return to authorized reviews</a></section>;}
 try{r.sessions.read(originalSessionId);}catch{return <section role="alert"><h1>Session expired or revoked</h1><p>Sign in again. Retained evidence is unchanged.</p><a href="/">Sign in again</a></section>;}
 return <SessionBoundary key={session.viewBinding} viewBinding={session.viewBinding}><div className="flex flex-wrap gap-3 justify-between"><h1 className="text-2xl font-semibold">Authorized reviews</h1><div className="flex gap-2"><RefreshReview/><SignOut csrf={session.csrf}/></div></div><nav aria-label="Review selection" className="my-4"><ul>{allowed.map(([id,b])=><li key={id}><a href={`/?review=${id}`}>{b.admission.subject.repository} · PR {b.admission.subject.pullRequest} · {id}</a></li>)}</ul></nav>{!allowed.length&&<p>No reviews are available for this account.</p>}{expected&&<ReviewLoader key={expected.id} expected={expected} viewBinding={session.viewBinding}/>}</SessionBoundary>;
}
