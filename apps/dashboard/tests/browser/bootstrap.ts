// TEST-ONLY process preload. Never imported by application code or copied into deployment assets.
import {createServer} from 'node:http';
import {once} from 'node:events';
import {readFile,writeFile} from 'node:fs/promises';
import {Sessions} from '../../lib/session';
import {retainedProtocol} from '../helpers/retained-protocol';
import {retainedFindingFixture} from '../helpers/retained-finding';
import {canonical,digest} from '../../../../packages/review/engine.ts';
const examples=JSON.parse(await readFile(new URL('../../../../specs/api/drafts/model-review-examples.json',import.meta.url),'utf8'));
const admission=examples.request,second=structuredClone(admission);second.id='22222222-2222-4222-8222-222222222222';second.subject.pullRequest=8;second.subject.headSha='c'.repeat(40);
const retained=retainedFindingFixture(admission,['Unsupported authorization assertion','Independent unsupported reliability assertion']);
const protocol=await retainedProtocol(admission);
const token='read-only-fixture-token-'.repeat(3);let state='queued',reads=0,mutations=0,expired=false,findingReads=0,activeFindingReads=0,abortedFindingReads=0,activeRetainedReads=0,abortedRetainedReads=0,historyReads=0,exportReads=0;const held:any[]=[];
const sessions=new Sessions(1800000,()=>Date.now()+(expired?1800001:0));
const samePrincipal=(subject:string)=>({issuer:'https://id.fixture.example',subject,organizationId:admission.subject.organizationId,repositories:[admission.subject.repository]});
const alice=sessions.create(samePrincipal('alice')),charlie=sessions.create(samePrincipal('charlie')),dana=sessions.create(samePrincipal('dana')),sameAccount=sessions.create(samePrincipal('alice')),erin=sessions.create(samePrincipal('erin'));
const historyUser=sessions.create(samePrincipal('history')),exportUser=sessions.create(samePrincipal('export')),logoutUser=sessions.create(samePrincipal('logout')),historyLogout=sessions.create(samePrincipal('history-logout'));
const bob=sessions.create({issuer:'https://id.fixture.example',subject:'bob',organizationId:'00000000-0000-4000-8000-000000000099',repositories:['other/repo']});
const backend=createServer((request,response)=>{
 const send=(value:unknown)=>response.end(JSON.stringify(value));
 if(request.url==='/fixture'){response.setHeader('content-type','application/json');send({state,reads,mutations,pending:held.length,findingReads,activeFindingReads,abortedFindingReads,activeRetainedReads,abortedRetainedReads,historyReads,exportReads});return;}
 if(request.url?.startsWith('/fixture/state/')){state=request.url.split('/').pop()!;response.end();return;}
 if(request.url==='/fixture/release'||request.url==='/fixture/revoke-inflight'){if(request.url.endsWith('revoke-inflight'))sessions.revoke(charlie.id);for(const item of held.splice(0))item.response.end(item.raw?'':JSON.stringify(item.value));state='queued';response.end();return;}
 if(request.url==='/fixture/revoke-export'){sessions.revoke(exportUser.id);response.end();return;}
 if(request.url==='/fixture/revoke-history'){sessions.revoke(historyUser.id);response.end();return;}
 if(request.url==='/fixture/expire-logout'){sessions.revoke(logoutUser.id);response.end();return;}
 if(request.url==='/fixture/malformed-config'){(globalThis as any).agentciDashboardRuntime.reviews[admission.id].admission.extraPrivateSentinel='ui-extra-private-sentinel-not-credential';response.end();return;}
 if(request.url==='/fixture/restore-config'){delete (globalThis as any).agentciDashboardRuntime.reviews[admission.id].admission.extraPrivateSentinel;response.end();return;}
 if(request.url==='/fixture/revoke-erin'){sessions.revoke(erin.id);response.end();return;}
 if(request.url==='/fixture/revoke-dana'){sessions.revoke(dana.id);response.end();return;}
 if(request.url==='/fixture/expire'){expired=true;response.end();return;}
 reads++;if(request.method!=='GET')mutations++;
 if(request.headers.authorization!==`Bearer ${token}`){response.writeHead(401);response.end();return;}
 response.setHeader('content-type','application/json');
 const errors:Record<string,[number,string]>={unavailable:[503,'service-unavailable'],credential:[401,'unauthorized'],'not-found':[404,'not-found'],incomplete:[409,'review-not-complete'],'too-large':[413,'body-too-large']};
 if(errors[state]){const [status,code]=errors[state]!;response.writeHead(status);send({error:{code}});return;}
 if(state==='malformed'){send({...examples.statuses.queued,privateField:'forged'});return;}
 if(state.startsWith('protocol')){
  const hold=(raw=false,value?:unknown)=>{activeRetainedReads++;response.once('close',()=>{activeRetainedReads--;if(!response.writableEnded)abortedRetainedReads++;});held.push({response,value,raw});};
  if(request.url?.endsWith('/export')){exportReads++;response.setHeader('content-type','application/x-ndjson');
   if((state==='protocol-held-export'||state==='protocol-held-both')){response.write(protocol.stream);hold(true);return;}
   if(state==='protocol-truncated'){response.end(protocol.stream.trimEnd());return;}
   if(state==='protocol-trailing'){response.end(protocol.stream+JSON.stringify(protocol.frames.at(-1))+'\n');return;}
   if(state==='protocol-wrong-digest'){const frames=structuredClone(protocol.frames);frames[1]!.digest='sha256:'+'f'.repeat(64);response.end(frames.map(f=>JSON.stringify(f)+'\n').join(''));return;}
   if(state==='protocol-wrong-identity'){const frames=structuredClone(protocol.frames);(frames[0]!.data as any).review.admission.request.subject.headSha='f'.repeat(40);response.end(frames.map(f=>JSON.stringify(f)+'\n').join(''));return;}
   if(state==='protocol-invalid-utf8'){response.end(Buffer.concat([Buffer.from(protocol.stream),Buffer.from([0xff,10])]));return;}
   response.end(protocol.stream);return;
  }
  if(request.url?.includes('/history?')){historyReads++;const later=new URL(request.url,'http://fixture').searchParams.has('cursor');let page=protocol.page(later);
   if((state==='protocol-held-history'||state==='protocol-held-both')&&later){hold(false,page);return;}
   if(state==='protocol-wrong-history-pin')page={...page,items:[later?protocol.alternateSecond:protocol.alternateFirst]};
   if(state==='protocol-wrong-watermark'&&later)page={...page,throughVersion:3};
   send(page);return;
  }
  if(request.url?.includes('/findings?')){send(protocol.manifest);return;}
  if(request.url?.startsWith('/v1/findings/')){send(protocol.first);return;}
  send(protocol.status);return;
 }
 if(state==='retained'||state==='delayed-finding'){if(request.url?.includes('/findings?')){send(retained.page);return;}if(request.url?.startsWith('/v1/findings/')){findingReads++;const record=retained.records.find(r=>request.url?.includes(encodeURIComponent(r.event.finding.id))||request.url?.includes(r.event.finding.id));if(state==='delayed-finding'){activeFindingReads++;response.once('close',()=>{activeFindingReads--;if(!response.writableEnded)abortedFindingReads++;});held.push({response,value:record});return;}send(record);return;}send(retained.status);return;}
 const isSecond=request.url?.includes(second.id),value=structuredClone(state==='completed-refusal'&&!isSecond?examples.statuses.completedWithRefusal:examples.statuses.queued);
 if(isSecond){value.admission={request:second,digest:digest(canonical(second))};}
 if(state==='cancelled')value.execution={state:'cancelled',cancelRequested:true,terminalDigest:'sha256:'+'a'.repeat(64)};
 if(state==='held'||state==='slow-first'&&!isSecond){held.push({response,value});return;}
 if(request.url?.includes('/findings?')){send(examples.emptyFindingsPage);return;}
 send(value);
});backend.listen(0,'127.0.0.1');await once(backend,'listening');const backendOrigin=`http://127.0.0.1:${(backend.address() as {port:number}).port}`;
(globalThis as any).agentciDashboardRuntime={origin:process.env.UI_FIXTURE_ORIGIN,sessions,login:{begin(){throw Error('test-only-login-unavailable');},finish(){throw Error('test-only-login-unavailable');}},reviews:{[admission.id]:{admission,apiOrigin:backendOrigin,readToken:token},[second.id]:{admission:second,apiOrigin:backendOrigin,readToken:token}}};
await writeFile(process.env.UI_FIXTURE_HANDSHAKE!,JSON.stringify({alice,bob,charlie,dana,sameAccount,erin,historyUser,exportUser,logoutUser,historyLogout,protocolFinding:protocol.first.event.finding.id,retained:retained.records.map(r=>({id:r.event.finding.id,digest:r.digest})),reviewId:admission.id,secondReviewId:second.id,backendOrigin}),{mode:0o600});
