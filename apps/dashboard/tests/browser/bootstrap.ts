// TEST-ONLY process preload. Never imported by application code or copied into deployment assets.
import {createServer} from 'node:http';
import {once} from 'node:events';
import {readFile,writeFile} from 'node:fs/promises';
import {Sessions} from '../../lib/session';
import {canonical,digest} from '../../../../packages/review/engine.ts';
const examples=JSON.parse(await readFile(new URL('../../../../specs/api/drafts/model-review-examples.json',import.meta.url),'utf8'));
const admission=examples.request,second=structuredClone(admission);second.id='22222222-2222-4222-8222-222222222222';second.subject.pullRequest=8;second.subject.headSha='c'.repeat(40);
const token='read-only-fixture-token-'.repeat(3);let state='queued',reads=0,mutations=0,expired=false;const held:any[]=[];
const sessions=new Sessions(1800000,()=>Date.now()+(expired?1800001:0));
const samePrincipal=(subject:string)=>({issuer:'https://id.fixture.example',subject,organizationId:admission.subject.organizationId,repositories:[admission.subject.repository]});
const alice=sessions.create(samePrincipal('alice')),charlie=sessions.create(samePrincipal('charlie')),dana=sessions.create(samePrincipal('dana')),sameAccount=sessions.create(samePrincipal('alice'));
const bob=sessions.create({issuer:'https://id.fixture.example',subject:'bob',organizationId:'00000000-0000-4000-8000-000000000099',repositories:['other/repo']});
const backend=createServer((request,response)=>{
 const send=(value:unknown)=>response.end(JSON.stringify(value));
 if(request.url==='/fixture'){response.setHeader('content-type','application/json');send({state,reads,mutations,pending:held.length});return;}
 if(request.url?.startsWith('/fixture/state/')){state=request.url.split('/').pop()!;response.end();return;}
 if(request.url==='/fixture/release'||request.url==='/fixture/revoke-inflight'){if(request.url.endsWith('revoke-inflight'))sessions.revoke(charlie.id);for(const item of held.splice(0))item.response.end(JSON.stringify(item.value));state='queued';response.end();return;}
 if(request.url==='/fixture/expire'){expired=true;response.end();return;}
 reads++;if(request.method!=='GET')mutations++;
 if(request.headers.authorization!==`Bearer ${token}`){response.writeHead(401);response.end();return;}
 response.setHeader('content-type','application/json');
 const errors:Record<string,[number,string]>={unavailable:[503,'service-unavailable'],credential:[401,'unauthorized'],'not-found':[404,'not-found'],incomplete:[409,'review-not-complete'],'too-large':[413,'body-too-large']};
 if(errors[state]){const [status,code]=errors[state]!;response.writeHead(status);send({error:{code}});return;}
 if(state==='malformed'){send({...examples.statuses.queued,privateField:'forged'});return;}
 const isSecond=request.url?.includes(second.id),value=structuredClone(state==='completed-refusal'&&!isSecond?examples.statuses.completedWithRefusal:examples.statuses.queued);
 if(isSecond){value.admission={request:second,digest:digest(canonical(second))};}
 if(state==='cancelled')value.execution={state:'cancelled',cancelRequested:true,terminalDigest:'sha256:'+'a'.repeat(64)};
 if(state==='held'||state==='slow-first'&&!isSecond){held.push({response,value});return;}
 if(request.url?.includes('/findings?')){send(examples.emptyFindingsPage);return;}
 send(value);
});backend.listen(0,'127.0.0.1');await once(backend,'listening');const backendOrigin=`http://127.0.0.1:${(backend.address() as {port:number}).port}`;
(globalThis as any).agentciDashboardRuntime={origin:process.env.UI_FIXTURE_ORIGIN,sessions,login:{begin(){throw Error('test-only-login-unavailable');},finish(){throw Error('test-only-login-unavailable');}},reviews:{[admission.id]:{admission,apiOrigin:backendOrigin,readToken:token},[second.id]:{admission:second,apiOrigin:backendOrigin,readToken:token}}};
await writeFile(process.env.UI_FIXTURE_HANDSHAKE!,JSON.stringify({alice,bob,charlie,dana,sameAccount,reviewId:admission.id,secondReviewId:second.id,backendOrigin}),{mode:0o600});
