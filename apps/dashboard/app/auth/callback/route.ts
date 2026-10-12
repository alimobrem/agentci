import {runtime} from '../../../lib/runtime';
import {cookie,setCookie,TRANSACTION_COOKIE,SESSION_COOKIE,privateHeaders} from '../../../lib/session';
export const dynamic='force-dynamic';
export async function GET(request:Request){const headers=new Headers(privateHeaders);headers.append('Set-Cookie',setCookie(TRANSACTION_COOKIE,'',0));try{const r=runtime();const principal=await r.login.finish(cookie(request,TRANSACTION_COOKIE),new URL(request.url));const session=r.sessions.create(principal,cookie(request,SESSION_COOKIE));headers.append('Set-Cookie',setCookie(SESSION_COOKIE,session.id,1800));headers.set('Location',r.origin);return new Response(null,{status:303,headers});}catch{return new Response('Sign-in failed. Start a new sign-in request.',{status:403,headers});}}
