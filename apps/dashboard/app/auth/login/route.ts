import {runtime} from '../../../lib/runtime';
import {requireOrigin,setCookie,TRANSACTION_COOKIE,privateHeaders} from '../../../lib/session';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{const r=runtime();requireOrigin(request,r.origin);const login=await r.login.begin();return new Response(null,{status:303,headers:{...privateHeaders,Location:login.url.href,'Set-Cookie':setCookie(TRANSACTION_COOKIE,login.id,300)}});}catch{return new Response('Sign-in unavailable',{status:403,headers:privateHeaders});}}
