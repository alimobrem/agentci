import {readFileSync,appendFileSync} from 'node:fs';
import {createHash,createPublicKey,verify} from 'node:crypto';
/** Synthetic GitHub transport with genuine Git blob identities and generated
 * App signatures. Unknown routes/origins fail without a network fallback. */
export function customerRecoveryTransport(fixturePath){
 const read=()=>JSON.parse(readFileSync(fixturePath,'utf8'));
 const record=value=>appendFileSync(read().events,JSON.stringify(value)+'\n');
 const history=()=>{try{return readFileSync(read().events,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));}catch{return [];}};
 return async(input,init={})=>{
  const request=new Request(input,init),url=new URL(request.url),fixture=read(),method=request.method;
  if(url.origin!=='https://api.github.com')throw Error('Unexpected fixture origin');
  const auth=request.headers.get('authorization'),prefix='/repos/alimobrem/agentci-onboarding-demo';let result;
  if(method==='POST'&&url.pathname==='/app/installations/12/access_tokens'){
   const jwt=auth?.replace(/^bearer /i,'').split('.')??[];
   if(jwt.length!==3||Number(JSON.parse(Buffer.from(jwt[1],'base64url')).iss)!==42||!verify('RSA-SHA256',Buffer.from(jwt[0]+'.'+jwt[1]),createPublicKey(fixture.publicKey),Buffer.from(jwt[2],'base64url')))throw Error('Fixture App authentication mismatch');
   result={token:'fixture-recovery-token',expires_at:new Date(Date.now()+3600000).toISOString(),permissions:{checks:'write',contents:'read',pull_requests:'read',metadata:'read'}};record({type:'app-authenticated',appId:42,installationId:12});
  }else{
   if(auth!=='token fixture-recovery-token'){const jwt=auth?.replace(/^bearer /i,'').split('.')??[];if(method!=='GET'||url.pathname!==prefix+'/installation'||jwt.length!==3||Number(JSON.parse(Buffer.from(jwt[1],'base64url')).iss)!==42||!verify('RSA-SHA256',Buffer.from(jwt[0]+'.'+jwt[1]),createPublicKey(fixture.publicKey),Buffer.from(jwt[2],'base64url')))throw Error('Fixture installation authentication mismatch');record({type:'app-installation-read',appId:42,installationId:12});}
   const commits=new Map(Object.entries(fixture.snapshots)),trees=new Map([...commits].map(([sha,files])=>[createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0,40),{sha,files}])),blobs=new Map();
   for(const files of commits.values())for(const text of Object.values(files))blobs.set(createHash('sha1').update('blob '+Buffer.byteLength(text)+'\0').update(text).digest('hex'),text);
   if(method==='GET'&&url.pathname===prefix+'/installation')result={id:12,suspended_at:null};
   else if(method==='GET'&&url.pathname===prefix+'/pulls/'+(fixture.pullRequest??4))result={number:fixture.pullRequest??4,state:'open',base:{sha:fixture.baseSha,repo:{full_name:'alimobrem/agentci-onboarding-demo'}},head:{sha:fixture.headSha}};
   else if(method==='GET'&&url.pathname.startsWith(prefix+'/git/commits/')){const sha=url.pathname.split('/').at(-1),files=commits.get(sha);if(!files)throw Error('Unexpected fixture commit');result={sha,tree:{sha:createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0,40)}};}
   else if(method==='GET'&&url.pathname.startsWith(prefix+'/git/trees/')){const sha=url.pathname.split('/').at(-1),tree=trees.get(sha);if(!tree)throw Error('Unexpected fixture tree');result={sha,truncated:false,tree:Object.entries(tree.files).map(([path,text])=>({path,type:'blob',mode:'100644',size:Buffer.byteLength(text),sha:createHash('sha1').update('blob '+Buffer.byteLength(text)+'\0').update(text).digest('hex')}))};}
   else if(method==='GET'&&url.pathname.startsWith(prefix+'/git/blobs/')){const sha=url.pathname.split('/').at(-1),text=blobs.get(sha);if(text===undefined)throw Error('Unexpected fixture blob');result={sha,encoding:'base64',content:Buffer.from(text).toString('base64')};}
   else if(method==='GET'&&url.pathname===prefix+'/commits/'+fixture.headSha+'/check-runs'){const checks=new Map();for(const event of history())if(event.type==='check')checks.set(event.id,{...checks.get(event.id),...event.body,id:event.id,app:{id:42}});result={total_count:checks.size,check_runs:[...checks.values()]};}
   else if(method==='POST'&&url.pathname===prefix+'/check-runs'){const body=await request.json(),id=100+history().filter(event=>event.type==='check'&&event.create).length;record({type:'check',create:true,id,body});result={...body,id,app:{id:42}};}
   else if(method==='PATCH'&&url.pathname.startsWith(prefix+'/check-runs/')){const id=Number(url.pathname.split('/').at(-1)),body=await request.json();if(!history().some(event=>event.type==='check'&&event.id===id))throw Error('Unexpected fixture Check');record({type:'check',id,body});result={...body,id,app:{id:42}};}
   else{record({type:'blocked-route',method,path:url.pathname});throw Error('Unexpected fixture route');}
  }
  return new Response(JSON.stringify(result),{status:200,headers:{'content-type':'application/json'}});
 };
}
