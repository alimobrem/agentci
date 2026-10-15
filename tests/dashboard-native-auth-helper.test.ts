import test from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {EventEmitter} from 'node:events';
// @ts-ignore Fixed source is shared verbatim with the hosted synthetic helper.
import {AUTH_HELPER_SOURCE,createIssuerProtocol,authHelperCookie,authHelperLookup,projectAuthResponse,captureAuthCertificateHash,bindAuthEarlyCertificateCapture} from '../scripts/lib/dashboard-native-auth-helper.mjs';

const issuer='https://127.0.0.3:4443',origin='https://dashboard.fixture.invalid:3000';
const clientId='synthetic-client',clientSecret='private-synthetic-client-secret',subject='synthetic-owner';
const signingKeyPair=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const verifier='fixed-synthetic-verifier-'.repeat(3),nonce='fixed-synthetic-nonce',state='fixed-synthetic-state';
const challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
const authorization=()=>{const url=new URL(issuer+'/authorize');for(const [key,value] of Object.entries({client_id:clientId,redirect_uri:origin+'/auth/callback',response_type:'code',scope:'openid',state,nonce,code_challenge:challenge,code_challenge_method:'S256'}))url.searchParams.set(key,value);return url;};
const fixture=(now=()=>1700000000000)=>createIssuerProtocol({clientId,clientSecret,subject,signingKeyPair},crypto,now);
const exchange=(callback:URL)=>new URLSearchParams({grant_type:'authorization_code',code:callback.searchParams.get('code')!,redirect_uri:origin+'/auth/callback',code_verifier:verifier,client_id:clientId,client_secret:clientSecret});

test('same hosted issuer protocol binds real S256 code exchange to signed RS256 issuer/audience/nonce/expiry and one-use code',()=>{
 const protocol=fixture(),callback=protocol.authorize(authorization());assert.equal(callback.origin,origin);assert.equal(callback.pathname,'/auth/callback');assert.equal(callback.searchParams.get('state'),state);
 const form=exchange(callback),tokens=protocol.token(form),[header,payload,signature]=tokens.id_token.split('.');
 const jwk=protocol.jwks().keys[0];assert.equal(jwk.d,undefined);assert.deepEqual(JSON.parse(Buffer.from(header,'base64url').toString()),{alg:'RS256',kid:jwk.kid,typ:'JWT'});
 assert.equal(crypto.verify('RSA-SHA256',Buffer.from(header+'.'+payload),crypto.createPublicKey({key:jwk,format:'jwk'}),Buffer.from(signature,'base64url')),true);
 assert.deepEqual(JSON.parse(Buffer.from(payload,'base64url').toString()),{iss:issuer,sub:subject,aud:clientId,iat:1700000000,exp:1700000060,nonce});
 assert.throws(()=>protocol.token(form),/synthetic-issuer-rejected/);
 assert.deepEqual(protocol.stats(),{authorizations:1,tokenRequests:2,successfulExchanges:1,rejectedExchanges:1,pkceVerified:1,clientAuthenticated:1});
 const publicMetadata=JSON.stringify({discovery:protocol.discovery(),jwks:protocol.jwks(),stats:protocol.stats()});for(const value of [clientSecret,verifier,tokens.access_token,tokens.id_token,callback.searchParams.get('code')!])assert.equal(publicMetadata.includes(value),false);
 assert.deepEqual(protocol.discovery().token_endpoint_auth_methods_supported,['client_secret_post']);
});

test('real issuer protocol rejects equal-length wrong PKCE, wrong client/secret/redirect and replay after rejected token attempts',()=>{
 for(const change of [(p:URLSearchParams)=>p.set('code_verifier','x'.repeat(verifier.length)),(p:URLSearchParams)=>p.set('client_id','other-client'),(p:URLSearchParams)=>p.set('client_secret','x'.repeat(clientSecret.length)),(p:URLSearchParams)=>p.set('redirect_uri',origin+'/other'),(p:URLSearchParams)=>p.set('grant_type','refresh_token'),(p:URLSearchParams)=>p.append('client_secret',clientSecret)]){
  const protocol=fixture(),callback=protocol.authorize(authorization()),form=exchange(callback);change(form);assert.throws(()=>protocol.token(form),/synthetic-issuer-rejected/);
  // A malformed duplicate request fails before consuming a code; every structurally valid attempted exchange consumes it atomically.
  if(form.getAll('client_secret').length===1)assert.throws(()=>protocol.token(exchange(callback)),/synthetic-issuer-rejected/);
  assert.equal(protocol.stats().successfulExchanges,0);
 }
 const protocol=fixture(),a=authorization();a.searchParams.set('code_challenge',crypto.createHash('sha256').update(verifier+'different').digest('base64url'));assert.throws(()=>protocol.token(exchange(protocol.authorize(a))),/synthetic-issuer-rejected/);
});

test('authorization scope, exact redirect, state/nonce/challenge and duplicate fields are checked; expired codes cannot exchange',()=>{
 for(const change of [(u:URL)=>u.searchParams.set('client_id','unknown'),(u:URL)=>u.searchParams.set('redirect_uri','https://evil.fixture.invalid/auth/callback'),(u:URL)=>u.searchParams.set('response_type','token'),(u:URL)=>u.searchParams.set('scope','openid admin'),(u:URL)=>u.searchParams.set('nonce',''),(u:URL)=>u.searchParams.delete('state'),(u:URL)=>u.searchParams.set('code_challenge_method','plain'),(u:URL)=>u.searchParams.set('code_challenge','x'.repeat(42)),(u:URL)=>u.searchParams.append('state',state),(u:URL)=>u.searchParams.set('extra','private')]){const url=authorization();change(url);assert.throws(()=>fixture().authorize(url),/synthetic-issuer-rejected/);}
 let now=1700000000000;const protocol=fixture(()=>now),callback=protocol.authorize(authorization());now+=60001;assert.throws(()=>protocol.token(exchange(callback)),/synthetic-issuer-rejected/);assert.equal(protocol.stats().successfulExchanges,0);
});

test('Basic client authentication is strictly checked and cannot be mixed with body client secrets',()=>{
 const protocol=fixture(),callback=protocol.authorize(authorization()),form=exchange(callback);form.delete('client_id');form.delete('client_secret');
 const authHeader='Basic '+Buffer.from(encodeURIComponent(clientId)+':'+encodeURIComponent(clientSecret)).toString('base64');assert.ok(protocol.token(form,authHeader).id_token);
 const mixed=fixture(),mixedForm=exchange(mixed.authorize(authorizationUrl()));assert.throws(()=>mixed.token(mixedForm,authHeader),/synthetic-issuer-rejected/);
 function authorizationUrl(){return new URL(issuer+'/authorize?'+new URLSearchParams({client_id:clientId,redirect_uri:origin+'/auth/callback',response_type:'code',scope:'openid',state,nonce,code_challenge:challenge,code_challenge_method:'S256'}));}
});

test('cookie observer requires all actual __Host attributes, one value and exact lifetime; values never enter public attributes',()=>{
 const value='x'.repeat(43),cookie=`__Host-agentci-login=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=300`;
 const result=authHelperCookie([cookie],'__Host-agentci-login');assert.equal(result.cookie,'__Host-agentci-login='+value);assert.deepEqual(result.attributes,{secure:true,httpOnly:true,sameSiteLax:true,hostOnly:true,pathRoot:true});assert.equal(JSON.stringify(result.attributes).includes(value),false);
 for(const headers of [[cookie,cookie],[cookie.replace('; Secure','')],[cookie+'; Domain=dashboard.fixture.invalid'],[cookie.replace('SameSite=Lax','SameSite=None')],[cookie.replace('Max-Age=300','Max-Age=0')],[cookie.replace(value,'short')],[cookie.replace('Path=/','Path=/auth')]])assert.throws(()=>authHelperCookie(headers,'__Host-agentci-login'),/synthetic-cookie-rejected/);
 const cleared='__Host-agentci-login=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0',session=cookie.replace('__Host-agentci-login','__Host-agentci-session').replace('Max-Age=300','Max-Age=1800');assert.ok(authHelperCookie([cleared,session],'__Host-agentci-session').attributes.secure);
});

test('response observer requires exact complete bytes plus queued schema/subject and private cache headers without retaining body',async()=>{
 const examples=JSON.parse(await readFile(new URL('../specs/api/drafts/model-review-examples.json',import.meta.url),'utf8'));
 const body=JSON.stringify({admission:examples.request,status:examples.statuses.queued,findings:[],views:{intent:{availability:'unavailable'}},evidence:'unavailable'});
 const response={complete:true,status:200,body:Buffer.from(body),headers:{'cache-control':'private, no-store, max-age=0',pragma:'no-cache',vary:'Cookie'}};
 const good=projectAuthResponse(response,body,[clientSecret]);assert.equal(good.expectedBodyMatched,true);assert.equal(good.schemaMatched,true);assert.equal(good.privateCacheHeaders,true);assert.equal(good.privateValueLeak,false);assert.equal(JSON.stringify(good).includes(body),false);
 assert.equal(projectAuthResponse({...response,complete:false},body).complete,false);
 assert.equal(projectAuthResponse({...response,body:Buffer.from(body+' ')},body).expectedBodyMatched,false);
 assert.equal(projectAuthResponse({...response,headers:{...response.headers,'set-cookie':['private']}},body).cookieIssued,true);
 assert.equal(projectAuthResponse({...response,headers:{}},body).privateCacheHeaders,false);
 const wrong=JSON.parse(body);wrong.status.admission.request=structuredClone(wrong.admission);wrong.status.admission.request.subject.repository='other/repo';assert.equal(projectAuthResponse({...response,body:Buffer.from(JSON.stringify(wrong))},JSON.stringify(wrong)).schemaMatched,false);
 assert.equal(projectAuthResponse({...response,body:Buffer.from(clientSecret)},body,[clientSecret]).privateValueLeak,true);
 assert.equal(JSON.stringify(projectAuthResponse({...response,body:Buffer.from(clientSecret)},body,[clientSecret])).includes(clientSecret),false);
});

test('client lookup maps only its fixed verified HTTPS hostname and rejects unrelated hostnames',()=>{
 const calls:any[]=[];authHelperLookup('dashboard.fixture.invalid',{},(...args:any[])=>calls.push(args));authHelperLookup('dashboard.fixture.invalid',{all:true},(...args:any[])=>calls.push(args));assert.deepEqual(calls,[[null,'127.0.0.2',4],[null,[{address:'127.0.0.2',family:4}]]]);
 for(const host of ['127.0.0.1','evil.fixture.invalid','dashboard.fixture.invalid.evil','Dashboard.fixture.invalid'])authHelperLookup(host,{},(error:any)=>assert.equal(error.code,'ENOTFOUND'));
});

test('actual TLS socket certificate observer records only bounded DER hashes and cannot substitute configured metadata',()=>{
 const peer={presentedCertificateSha256s:[],clientObservedCertificateSha256s:[]},raw=Buffer.from('synthetic DER bytes for pure observer test'),digest=crypto.createHash('sha256').update(raw).digest('hex');
 assert.equal(captureAuthCertificateHash(peer,{getX509Certificate:()=>({raw})},crypto),true);assert.deepEqual(peer.presentedCertificateSha256s,[digest]);
 assert.equal(captureAuthCertificateHash(peer,{getPeerCertificate:()=>({raw})},crypto,true),true);assert.deepEqual(peer.clientObservedCertificateSha256s,[digest]);
 assert.equal(captureAuthCertificateHash(peer,{getX509Certificate:()=>undefined},crypto),false);assert.equal(captureAuthCertificateHash(peer,{getCertificate:()=>({raw:'PRIVATE-CERT'})},crypto),false);assert.equal(captureAuthCertificateHash(peer,{getCertificate:()=>({raw:Buffer.alloc(32769)})},crypto),false);
 assert.equal(JSON.stringify(peer).includes(raw.toString()),false);assert.equal(JSON.stringify(peer).includes('PRIVATE-CERT'),false);
 for(const value of ['other DER','third DER'])captureAuthCertificateHash(peer,{getCertificate:()=>({raw:Buffer.from(value)})},crypto);assert.equal(peer.presentedCertificateSha256s.length,2);
});

test('early issuer event ignores a poison secret argument and hashes only actual socket DER before later close',()=>{
 const server=new EventEmitter(),peer={presentedCertificateSha256s:[],clientObservedCertificateSha256s:[]},raw=Buffer.from('public issuer DER fixture'),expected=crypto.createHash('sha256').update(raw).digest('hex');
 let touched=0,closed=false;const updates:unknown[]=[];
 const poison=new Proxy(Object.create(null),{get(){touched++;throw Error('secret argument accessed');},ownKeys(){touched++;throw Error('secret argument enumerated');},getOwnPropertyDescriptor(){touched++;throw Error('secret argument inspected');}});
 const observedCrypto={createHash(algorithm:string){assert.equal(algorithm,'sha256');const digest=crypto.createHash(algorithm);return {update(value:unknown){updates.push(value);assert.equal(value,raw);digest.update(value as Buffer);return {digest(encoding:'hex'){return digest.digest(encoding);}};}};}};
 const socket={getX509Certificate:()=>closed?undefined:{raw},getCertificate:()=>closed?null:{raw}};
 bindAuthEarlyCertificateCapture(server,peer,observedCrypto);assert.equal(server.listenerCount('keylog'),1);
 server.emit('keylog',poison,socket);server.emit('keylog',poison,socket);assert.deepEqual(peer.presentedCertificateSha256s,[expected]);
 closed=true;assert.equal(captureAuthCertificateHash(peer,socket,observedCrypto),false);server.emit('keylog',poison,socket);
 assert.deepEqual(peer.presentedCertificateSha256s,[expected]);assert.equal(updates.length,2);assert.equal(touched,0);assert.equal(JSON.stringify(peer).includes(raw.toString()),false);
});

test('early event with no live socket certificate cannot manufacture a hash from configured metadata or its secret argument',()=>{
 const server=new EventEmitter(),peer={presentedCertificateSha256s:[],clientObservedCertificateSha256s:[]};let hashes=0,touched=0;
 const poison=new Proxy(Object.create(null),{get(){touched++;throw Error('secret coercion/access');},ownKeys(){touched++;throw Error('secret enumeration');}});
 bindAuthEarlyCertificateCapture(server,peer,{createHash(){hashes++;throw Error('unexpected hash');}});
 server.emit('keylog',poison,{getX509Certificate:()=>undefined,getCertificate:()=>null,configuredCertificate:{raw:Buffer.from('configured certificate is not an observation')}});
 server.emit('keylog',poison,{getX509Certificate(){throw Error('already closed');}});
 assert.deepEqual(peer,{presentedCertificateSha256s:[],clientObservedCertificateSha256s:[]});assert.equal(hashes,0);assert.equal(touched,0);
});

test('fixed helper source parses without execution and keeps TLS/forwarding/watchdog boundaries explicit',()=>{
 const result=spawnSync(process.execPath,['--check','--input-type=module'],{input:AUTH_HELPER_SOURCE,encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 for(const text of ['rejectUnauthorized:true','ca:config.caPem','lookup:authHelperLookup',"host:'127.0.0.1',port:3000", "'x-forwarded-proto':'https'", "finishBackend('watchdog'),7000", "state.proxy.timeouts++", "state.held.backendReadOrdinal=state.peers.backend.authorizedReads",'fixture-helper-failed'])assert.equal(AUTH_HELPER_SOURCE.includes(text),true,text);
 for(const forbidden of ['rejectUnauthorized:false','checkServerIdentity:','NODE_TLS_REJECT_UNAUTHORIZED','NODE_EXTRA_CA_CERTS','agentciDashboardRuntime','process.env','writeFile','createSecureContext','process.on(\'SIGTERM\'','caPrivateKey','caKeyPem','--tls-keylog','--trace-tls','enableTrace','SSLKEYLOGFILE'])assert.equal(AUTH_HELPER_SOURCE.includes(forbidden),false,forbidden);
 assert.ok(AUTH_HELPER_SOURCE.includes("if(name==='issuer')bindAuthEarlyCertificateCapture(server,state.peers[name],crypto)"));
 assert.match(AUTH_HELPER_SOURCE,/https\.createServer\(\{key:config\.issuer\.keyPem,cert:config\.issuer\.certPem\}/);
 assert.ok(AUTH_HELPER_SOURCE.length<65536);
});
