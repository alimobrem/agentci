import {runtime} from '../../../lib/runtime';
import {cookie,setCookie,SESSION_COOKIE,privateHeaders,requireCsrf} from '../../../lib/session';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{const r=runtime(),id=cookie(request,SESSION_COOKIE),session=r.sessions.read(id);requireCsrf(request,r.origin,session.csrf);r.sessions.revoke(id);return new Response(null,{status:204,headers:{...privateHeaders,'Set-Cookie':setCookie(SESSION_COOKIE,'',0)}});}catch{return new Response('Request denied',{status:403,headers:privateHeaders});}}
