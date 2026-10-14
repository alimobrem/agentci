import {z} from 'zod';
import {runtime} from './runtime';
import {validatedReviewBindings} from './admissions';
import {cookie,SESSION_COOKIE,privateHeaders,authorize} from './session';
import type {Principal} from './session';
import type {ReviewBinding} from './dashboard';
const failure=(error:string,status:number)=>Response.json({error},{status,headers:privateHeaders});
export async function protectedRetainedRead(request:Request,params:Promise<{id:string;findingId?:string}>,read:(principal:Principal,binding:ReviewBinding,signal:AbortSignal,findingId?:string)=>Promise<unknown>){
 if(request.headers.get('sec-fetch-site')==='cross-site')return failure('Access denied',403);
 let r;try{r=runtime();}catch{return failure('Dashboard setup unavailable',503);}
 const sessionId=cookie(request,SESSION_COOKIE);let session;try{session=r.sessions.read(sessionId);}catch{return failure('Session expired or missing. Sign in again.',401);}
 try{
  const input=await params,id=z.uuid().parse(input.id),findingId=input.findingId===undefined?undefined:z.string().regex(/^sha256:[a-f0-9]{64}$/).parse(input.findingId);
  const reviews=await validatedReviewBindings(r.reviews),binding=reviews[id];
  r.sessions.read(sessionId);if(!binding||binding.admission.id!==id)return failure('Access denied',403);
  try{authorize(session.principal,binding.admission.subject.organizationId,binding.admission.subject.repository);}catch{return failure('Access denied',403);}
  const data=await read(session.principal,binding,AbortSignal.any([request.signal,r.sessions.signal(sessionId)]),findingId);
  r.sessions.read(sessionId);return Response.json(data,{headers:privateHeaders});
 }catch(error){
  try{r.sessions.read(sessionId);}catch{return failure('Session expired or missing. Sign in again.',401);}
  const code=(error as {code?:string})?.code;
  if(error instanceof z.ZodError)return failure('Invalid read identifier',400);
  if(code==='unauthorized'||code==='forbidden')return failure('Backend evidence access unavailable',502);
  if(code==='not-found')return failure('Retained finding not found',404);
  if(code==='review-not-complete')return failure('Review evidence incomplete',409);
  if(code==='response-too-large'||code==='body-too-large')return failure('Evidence exceeds bounded read',413);
  if((error as Error)?.message==='Access denied')return failure('Access denied',403);
  return failure('Evidence unavailable or failed integrity checks',503);
 }
}
