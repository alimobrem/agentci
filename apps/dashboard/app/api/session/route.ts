import {runtime} from '../../../lib/runtime';
import {cookie,SESSION_COOKIE,privateHeaders} from '../../../lib/session';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{if(request.headers.get('sec-fetch-site')==='cross-site')throw Error();const session=runtime().sessions.read(cookie(request,SESSION_COOKIE));return Response.json({validForMs:Math.max(0,session.expiresAt-Date.now()),viewBinding:session.viewBinding},{headers:privateHeaders});}catch{return new Response(null,{status:401,headers:privateHeaders});}}
