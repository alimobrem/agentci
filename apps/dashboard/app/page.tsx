import {cookies} from 'next/headers';
import {z} from 'zod';
import {runtime} from '../lib/runtime';
import {SESSION_COOKIE,authorize} from '../lib/session';
import {readDashboard} from '../lib/dashboard';
import {ReviewDetail} from '../components/review-detail';
import {SessionBoundary} from '../components/session-boundary';
import {RefreshReview} from '../components/refresh-review';
import {SignOut} from '../components/sign-out';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{review?:string}>}){
 let r:ReturnType<typeof runtime>;try{r=runtime();}catch{return <section><h1 className="text-2xl font-semibold">Dashboard setup pending</h1><p>A trusted OIDC issuer and scoped server configuration are required. No review data is exposed.</p></section>;}
 let session;try{session=r.sessions.read((await cookies()).get(SESSION_COOKIE)?.value);}catch{return <section><h1 className="text-2xl font-semibold">Sign in to view reviews</h1><form method="post" action="/auth/login"><button className="mt-4 rounded border bg-white px-4 py-2">Sign in with your identity provider</button></form></section>;}
 const allowed=Object.entries(r.reviews).filter(([,b])=>{try{authorize(session.principal,b.admission.subject.organizationId,b.admission.subject.repository);return true;}catch{return false;}});
 const selected=(await searchParams).review;let data;try{if(selected){z.uuid().parse(selected);const binding=r.reviews[selected];if(!binding||binding.admission.id!==selected)throw Error();data=await readDashboard(session.principal,binding);r.sessions.read((await cookies()).get(SESSION_COOKIE)?.value);}}catch{return <section role="alert"><h1>Review unavailable</h1><p>Access, evidence integrity or the upstream request could not be verified.</p><a href="/">Return to authorized reviews</a></section>;}
 return <SessionBoundary key={session.viewBinding} viewBinding={session.viewBinding}><div className="flex flex-wrap gap-3 justify-between"><h1 className="text-2xl font-semibold">Authorized reviews</h1><div className="flex gap-2"><RefreshReview/><SignOut csrf={session.csrf}/></div></div><nav aria-label="Review selection" className="my-4"><ul>{allowed.map(([id,b])=><li key={id}><a href={`/?review=${id}`}>{b.admission.subject.repository} · PR {b.admission.subject.pullRequest} · {id}</a></li>)}</ul></nav>{!allowed.length&&<p>No reviews are available for this account.</p>}{data&&<ReviewDetail data={data}/>}</SessionBoundary>;
}
