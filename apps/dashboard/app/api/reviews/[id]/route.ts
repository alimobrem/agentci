import {z} from 'zod';
import {runtime} from '../../../../lib/runtime';
import {cookie,SESSION_COOKIE,privateHeaders,authorize} from '../../../../lib/session';
import {readDashboard} from '../../../../lib/dashboard';
export const dynamic='force-dynamic';
const failure=(error:string,status:number)=>Response.json({error},{status,headers:privateHeaders});
export async function GET(request:Request,context:{params:Promise<{id:string}>}){
 if(request.headers.get('sec-fetch-site')==='cross-site')return failure('Access denied',403);
 let r;try{r=runtime();}catch{return failure('Dashboard setup unavailable',503);}
 let session;try{session=r.sessions.read(cookie(request,SESSION_COOKIE));}catch{return failure('Session expired or missing. Sign in again.',401);}
 let id;try{id=z.uuid().parse((await context.params).id);}catch{return failure('Invalid review identifier',400);}
 const binding=r.reviews[id];try{if(!binding||binding.admission.id!==id)throw Error();authorize(session.principal,binding.admission.subject.organizationId,binding.admission.subject.repository);}catch{return failure('Access denied',403);}
 try{const data=await readDashboard(session.principal,binding,request.signal);try{r.sessions.read(cookie(request,SESSION_COOKIE));}catch{return failure('Session expired or missing. Sign in again.',401);}return Response.json(data,{headers:privateHeaders});}catch(error){const code=(error as {code?:string})?.code;if(code==='unauthorized'||code==='forbidden')return failure('Backend evidence access unavailable',502);if(code==='not-found')return failure('Review not found',404);if(code==='review-not-complete')return failure('Review evidence incomplete',409);if(code==='response-too-large'||code==='body-too-large')return failure('Evidence exceeds bounded read',413);return failure('Evidence unavailable or failed integrity checks',503);}
}
