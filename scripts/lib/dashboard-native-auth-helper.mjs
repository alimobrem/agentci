/** Synthetic fixture only. No production loader, session injection, global trust or app code is installed. */
export const AUTH_ORIGIN='https://dashboard.fixture.invalid:3000';
export const AUTH_ISSUER='https://127.0.0.3:4443';
export const AUTH_BACKEND='https://127.0.0.4:4446';

/** Shared verbatim with the hosted helper; pure protocol/crypto functions permit Mac tests without TLS/listeners. */
export function createIssuerProtocol(settings,crypto,now=Date.now){
 const issuer='https://127.0.0.3:4443',redirect='https://dashboard.fixture.invalid:3000/auth/callback';
 const codes=new Map(),used=new Set(),stats={authorizations:0,tokenRequests:0,successfulExchanges:0,rejectedExchanges:0,pkceVerified:0,clientAuthenticated:0};
 const hash=v=>crypto.createHash('sha256').update(v).digest('base64url');
 const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
 const fail=()=>{throw Error('synthetic-issuer-rejected');};
 const unique=(form,key)=>{const all=form.getAll(key);if(all.length!==1)fail();return all[0];};
 const {privateKey,publicKey}=settings.signingKeyPair??crypto.generateKeyPairSync('rsa',{modulusLength:2048});
 const jwk={...publicKey.export({format:'jwk'}),kid:'native-auth-fixture',use:'sig',alg:'RS256'};
 return {
  discovery(){return {issuer,authorization_endpoint:issuer+'/authorize',token_endpoint:issuer+'/token',jwks_uri:issuer+'/jwks',response_types_supported:['code'],grant_types_supported:['authorization_code'],subject_types_supported:['public'],id_token_signing_alg_values_supported:['RS256'],token_endpoint_auth_methods_supported:['client_secret_post'],code_challenge_methods_supported:['S256']};},
  jwks(){return {keys:[{...jwk}]};},
  authorize(url){
   if(!(url instanceof URL)||url.origin!==issuer||url.pathname!=='/authorize'||url.username||url.password||url.hash)fail();
   const p=url.searchParams;for(const key of p.keys())if(!['client_id','redirect_uri','response_type','scope','state','nonce','code_challenge','code_challenge_method'].includes(key))fail();
   const state=unique(p,'state'),nonce=unique(p,'nonce'),challenge=unique(p,'code_challenge');
   if(unique(p,'client_id')!==settings.clientId||unique(p,'redirect_uri')!==redirect||unique(p,'response_type')!=='code'||unique(p,'scope')!=='openid'||unique(p,'code_challenge_method')!=='S256'||!/^[-_A-Za-z0-9]{43}$/.test(challenge)||![state,nonce].every(s=>s.length>=8&&s.length<=512&&/^[\x21-\x7e]+$/.test(s))||codes.size>=8)fail();
   const code=crypto.randomBytes(32).toString('base64url');codes.set(code,{state,nonce,challenge,expiresAt:now()+60000});stats.authorizations++;
   const callback=new URL(redirect);callback.searchParams.set('code',code);callback.searchParams.set('state',state);return callback;
  },
  token(form,authorization){
   stats.tokenRequests++;try{
    if(!(form instanceof URLSearchParams))fail();
    for(const key of form.keys())if(!['grant_type','code','redirect_uri','code_verifier','client_id','client_secret'].includes(key)||form.getAll(key).length!==1)fail();
    const code=unique(form,'code'),record=codes.get(code);codes.delete(code);if(!record||used.has(code)||record.expiresAt<=now())fail();used.add(code);
    let id,secret;
    if(authorization!==undefined){
     if(typeof authorization!=='string'||!/^Basic [A-Za-z0-9+/]+=*$/.test(authorization)||form.has('client_secret')||form.has('client_id'))fail();
     const encoded=Buffer.from(authorization.slice(6),'base64').toString('utf8'),colon=encoded.indexOf(':');if(colon<1)fail();
     try{id=decodeURIComponent(encoded.slice(0,colon));secret=decodeURIComponent(encoded.slice(colon+1));}catch{fail();}
    }else{id=unique(form,'client_id');secret=unique(form,'client_secret');}
    if(!same(id,settings.clientId)||!same(secret,settings.clientSecret))fail();stats.clientAuthenticated++;
    const verifier=unique(form,'code_verifier');
    if(unique(form,'grant_type')!=='authorization_code'||unique(form,'redirect_uri')!==redirect||!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)||!same(hash(verifier),record.challenge))fail();stats.pkceVerified++;
    const timestamp=Math.floor(now()/1000),claims={iss:issuer,sub:settings.subject,aud:settings.clientId,iat:timestamp,exp:timestamp+60,nonce:record.nonce};
    const payload=[{alg:'RS256',kid:jwk.kid,typ:'JWT'},claims].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
    stats.successfulExchanges++;
    return {access_token:crypto.randomBytes(32).toString('base64url'),token_type:'Bearer',expires_in:60,id_token:payload+'.'+crypto.sign('RSA-SHA256',Buffer.from(payload),privateKey).toString('base64url')};
   }catch{stats.rejectedExchanges++;fail();}
  },
  stats(){return {...stats};}
 };
}

/** Cookie values stay private; public observations retain attribute checks only. */
export function authHelperCookie(headers,name){
 const values=Array.isArray(headers)?headers:typeof headers==='string'?[headers]:[];
 const matches=values.filter(value=>typeof value==='string'&&value.startsWith(name+'=')&&value.length<=2048);
 if(matches.length!==1)throw Error('synthetic-cookie-rejected');
 const parts=matches[0].split(';').map(v=>v.trim()),value=parts[0].slice(name.length+1),attributes=parts.slice(1);
 if(!/^[A-Za-z0-9_-]{43}$/.test(value)||attributes.length!==5||new Set(attributes).size!==5||!attributes.includes('Path=/')||!attributes.includes('Secure')||!attributes.includes('HttpOnly')||!attributes.includes('SameSite=Lax')||!attributes.includes(name==='__Host-agentci-login'?'Max-Age=300':'Max-Age=1800'))throw Error('synthetic-cookie-rejected');
 return {cookie:name+'='+value,attributes:{secure:true,httpOnly:true,sameSiteLax:true,hostOnly:true,pathRoot:true}};
}

/** No raw body/header/error enters the public result. Exact bytes and parsed expected shape must both match. */
export function projectAuthResponse(response,expectedBody,privateValues=[]){
 const body=Buffer.isBuffer(response.body)?response.body:Buffer.from(response.body??'');
 const headers=response.headers??{},text=body.toString('utf8');
 const canonical=v=>v&&typeof v==='object'?Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
 let schemaMatched=false;try{
  const value=JSON.parse(text),expected=JSON.parse(expectedBody);
  schemaMatched=canonical(value)===canonical(expected)&&value.admission?.id===expected.admission?.id&&canonical(value.status?.admission?.request)===canonical(value.admission)&&value.status?.summary===null&&value.status?.execution?.state==='queued'&&Array.isArray(value.findings)&&value.findings.length===0&&value.evidence==='unavailable';
 }catch{}
 return {complete:response.complete===true,status:Number.isSafeInteger(response.status)?response.status:0,bytes:body.length,expectedBodyMatched:text===expectedBody,schemaMatched,privateCacheHeaders:headers['cache-control']==='private, no-store, max-age=0'&&headers.pragma==='no-cache'&&String(headers.vary??'').split(',').map(v=>v.trim().toLowerCase()).includes('cookie'),cookieIssued:!!headers['set-cookie'],privateValueLeak:privateValues.some(v=>typeof v==='string'&&v.length>=8&&text.includes(v))};
}

/** A fixed one-name client lookup; the application itself retains ordinary DNS and default TLS verification. */
export function authHelperLookup(host,options,callback){
 if(host!=='dashboard.fixture.invalid'){const error=Error('fixture-dns-rejected');error.code='ENOTFOUND';callback(error);return;}
 if(options?.all)callback(null,[{address:'127.0.0.2',family:4}]);else callback(null,'127.0.0.2',4);
}

/** Record only DER hashes obtained from the actual TLS socket. Missing socket observations cannot be synthesized. */
export function captureAuthCertificateHash(peer,socket,crypto,remote=false){
 try{
  const cert=remote?socket.getPeerX509Certificate?.():socket.getX509Certificate?.();
  const raw=cert?.raw??(remote?socket.getPeerCertificate?.():socket.getCertificate?.())?.raw;
  if(!Buffer.isBuffer(raw)||raw.length<1||raw.length>32768)return false;
  const digest=crypto.createHash('sha256').update(raw).digest('hex'),key=remote?'clientObservedCertificateSha256s':'presentedCertificateSha256s';
  if(!Array.isArray(peer[key]))return false;if(!peer[key].includes(digest)&&peer[key].length<2)peer[key].push(digest);return true;
 }catch{return false;}
}

/** Node's documented server event exposes the live socket earlier than close-generated errors.
 * The first argument contains secrets: never inspect, hash, store, emit or output it. Only socket DER is observed.
 */
export function bindAuthEarlyCertificateCapture(server,peer,crypto){
 server.on('keylog',(_discardedLine,socket)=>{captureAuthCertificateHash(peer,socket,crypto);});
}

/** Publish elapsed hold facts only. A late release remains >=6000ms even if capped at the public 30000ms bound. */
export function authHoldTiming(startedAt,releasedAt,now){
 if(startedAt===null)return {heldAgeMs:0,backendHoldMs:null};
 if(!Number.isFinite(startedAt)||!Number.isFinite(now)||now<startedAt||releasedAt!==null&&(!Number.isFinite(releasedAt)||releasedAt<startedAt||releasedAt>now))throw Error('fixture-monotonic-clock-invalid');
 const elapsed=Math.min(30000,Math.ceil((releasedAt??now)-startedAt));
 return {heldAgeMs:elapsed,backendHoldMs:releasedAt===null?null:elapsed};
}

async function runAuthHelper(crypto,http,https){
 const ORIGIN='https://dashboard.fixture.invalid:3000',ISSUER='https://127.0.0.3:4443';
 const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
 const MAX_BODY=262144,MAX_BOOTSTRAP=1048576;
 const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
 const safeError=error=>['ECONNREFUSED','ECONNRESET','EPIPE','ETIMEDOUT','ERR_TLS_CERT_ALTNAME_INVALID','CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE','SELF_SIGNED_CERT_IN_CHAIN','DEPTH_ZERO_SELF_SIGNED_CERT','ERR_SSL_TLSV1_ALERT_UNKNOWN_CA','ERR_SSL_SSLV3_ALERT_BAD_CERTIFICATE','ERR_SSL_SSLV3_ALERT_CERTIFICATE_UNKNOWN','ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR'].includes(error?.code)?error.code:'OTHER_TRANSPORT_ERROR';
 let bootstrap=Buffer.alloc(0);
 const config=await new Promise((resolve,reject)=>{
  const fail=()=>reject(Error('fixture-bootstrap-rejected'));
  process.stdin.on('error',fail);process.stdin.on('data',chunk=>{bootstrap=Buffer.concat([bootstrap,chunk]);if(bootstrap.length>MAX_BOOTSTRAP){fail();return;}const end=bootstrap.indexOf(10);if(end>=0){if(end!==bootstrap.length-1){fail();return;}process.stdin.pause();try{resolve(JSON.parse(bootstrap.subarray(0,end).toString('utf8')));}catch{fail();}}});process.stdin.on('end',()=>{if(bootstrap.indexOf(10)<0)fail();});
 });
 const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join(',')===[...keys].sort().join(',');
 if(!exact(config,['schemaVersion','observerId','trustCase','caPem','frontend','issuer','backend','clientId','clientSecret','principal','admission','status','expectedApiBody','readToken'])||config.schemaVersion!==1||!UUID.test(config.observerId)||!['valid','absent-ca','wrong-ca','wrong-hostname','expired-certificate'].includes(config.trustCase)||typeof config.caPem!=='string'||Buffer.byteLength(config.caPem)>8192||!config.caPem.startsWith('-----BEGIN CERTIFICATE-----')||!exact(config.principal,['issuer','subject','organizationId','repositories'])||config.principal.issuer!==ISSUER||typeof config.principal.subject!=='string'||!config.principal.subject||!UUID.test(config.principal.organizationId)||!Array.isArray(config.principal.repositories)||config.principal.repositories.length!==1||typeof config.clientId!=='string'||!config.clientId||config.clientId.length>256||typeof config.clientSecret!=='string'||config.clientSecret.length<16||config.clientSecret.length>256||typeof config.readToken!=='string'||config.readToken.length<32||config.readToken.length>256||!UUID.test(config.admission?.id)||typeof config.expectedApiBody!=='string'||Buffer.byteLength(config.expectedApiBody)>MAX_BODY||config.status?.admission?.request?.id!==config.admission.id||JSON.stringify(config.status.admission.request)!==JSON.stringify(config.admission)||config.status?.summary!==null||config.status?.execution?.state!=='queued'||config.admission.subject?.organizationId!==config.principal.organizationId||!config.principal.repositories.includes(config.admission.subject?.repository))throw Error('fixture-bootstrap-rejected');
 const ca=new crypto.X509Certificate(config.caPem),certificates={};
 for(const name of ['frontend','issuer','backend']){
  const leaf=config[name];if(!exact(leaf,['keyPem','certPem'])||typeof leaf.keyPem!=='string'||typeof leaf.certPem!=='string'||leaf.keyPem.length>16384||leaf.certPem.length>16384)throw Error('fixture-leaf-rejected');
  const cert=new crypto.X509Certificate(leaf.certPem),key=crypto.createPrivateKey(leaf.keyPem);
  if(!cert.checkPrivateKey(key)||!cert.verify(ca.publicKey)&&!(name==='issuer'&&config.trustCase==='wrong-ca'))throw Error('fixture-leaf-rejected');
  if(name==='issuer'&&config.trustCase==='wrong-ca'&&cert.verify(ca.publicKey))throw Error('fixture-negative-leaf-rejected');
  certificates[name]={sha256:hash(cert.raw),validFromMs:Date.parse(cert.validFrom),validToMs:Date.parse(cert.validTo),signedByFixtureCa:cert.verify(ca.publicKey),expectedName:!!(name==='frontend'?cert.checkHost('dashboard.fixture.invalid'):cert.checkIP(name==='issuer'?'127.0.0.3':'127.0.0.4'))};
 }
 bootstrap=Buffer.alloc(0);
 const expectedBody=config.expectedApiBody,privateValues=[config.clientSecret,config.readToken];
 const issuerProtocol=createIssuerProtocol({clientId:config.clientId,clientSecret:config.clientSecret,subject:config.principal.subject},crypto);
 const peer=()=>({tlsAttempts:0,tlsEstablished:0,tlsFailures:0,tlsErrorCodes:[],httpRequests:0,presentedCertificateSha256s:[],clientObservedCertificateSha256s:[]});
 const state={schemaVersion:1,observerId:config.observerId,trustCase:config.trustCase,ready:false,stage:'starting',caSha256:hash(config.caPem),certificates,authentication:{started:false,complete:false,authenticated:false,stage:'not-started',anonymousStatus:0,loginStatus:0,loginResponseComplete:false,callbackStatus:0,sessionStatus:0,callbackOriginMatched:false,transactionCookieIssued:false,sessionCookieIssued:false,transactionCookieAttributes:null,sessionCookieAttributes:null,baseline:null,failedProtectedStatus:0,failureCode:null},held:null,peers:{frontend:peer(),issuer:{...peer(),discoveryRequests:0,authorizationRequests:0,tokenRequests:0,jwksRequests:0},backend:{...peer(),authorizedReads:0,rejectedReads:0}},proxy:{requests:0,errors:0,timeouts:0,responseOrigin:'upstream-only'},shutdownRequested:false};
 let sessionCookie='',busy=false,heldResponse=null,watchdog=null,clientRequest=null,backendHeldAt=null,backendReleasedAt=null;
 const sockets=new Set(),servers=[];
 const bindTls=(server,name)=>{servers.push(server);if(name==='issuer')bindAuthEarlyCertificateCapture(server,state.peers[name],crypto);server.on('connection',socket=>{state.peers[name].tlsAttempts++;if(sockets.size>=64){socket.destroy();return;}sockets.add(socket);socket.on('error',()=>{});socket.once('close',()=>sockets.delete(socket));});server.on('secureConnection',socket=>{state.peers[name].tlsEstablished++;captureAuthCertificateHash(state.peers[name],socket,crypto);});server.on('tlsClientError',(error,socket)=>{state.peers[name].tlsFailures++;captureAuthCertificateHash(state.peers[name],socket,crypto);const code=safeError(error);if(!state.peers[name].tlsErrorCodes.includes(code)&&state.peers[name].tlsErrorCodes.length<8)state.peers[name].tlsErrorCodes.push(code);});};
 const json=(res,status,value)=>{const body=JSON.stringify(value);if(Buffer.byteLength(body)>32768)throw Error('fixture-public-bound');res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(body);};
 const readBody=async req=>{let body=Buffer.alloc(0);for await(const chunk of req){body=Buffer.concat([body,chunk]);if(body.length>16384)throw Error('fixture-body-bound');}return body.toString('utf8');};
 const privateHeaders=headers=>headers['cache-control']==='private, no-store, max-age=0'&&headers.pragma==='no-cache'&&String(headers.vary??'').toLowerCase().split(',').map(s=>s.trim()).includes('cookie');
 const request=(target,{method='GET',cookie='',body='',origin=false}={})=>new Promise(resolve=>{
  const url=new URL(target);if(![ORIGIN,ISSUER].includes(url.origin)||url.username||url.password||url.hash){resolve({complete:false,status:0,body:Buffer.alloc(0),headers:{},failureCode:'OTHER_TRANSPORT_ERROR'});return;}
  let settled=false;const chunks=[],finish=value=>{if(settled)return;settled=true;resolve(value);};let bytes=0;
  const headers={...(cookie?{cookie}:{}),...(origin?{origin:ORIGIN,'sec-fetch-site':'same-origin'}:{}),...(method==='POST'?{'content-length':Buffer.byteLength(body)}:{})};
  const req=https.request(url,{method,headers,ca:config.caPem,rejectUnauthorized:true,agent:false,...(url.origin===ORIGIN?{lookup:authHelperLookup}:{})},res=>{
   res.on('data',chunk=>{bytes+=chunk.length;if(bytes>MAX_BODY){res.destroy();return;}chunks.push(chunk);});
   res.once('end',()=>finish({complete:res.complete,status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));
   res.once('error',error=>finish({complete:false,status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks),failureCode:safeError(error)}));
   res.once('aborted',()=>finish({complete:false,status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks),failureCode:'ECONNRESET'}));
  });
  req.once('socket',socket=>socket.once('secureConnect',()=>captureAuthCertificateHash(state.peers[url.origin===ORIGIN?'frontend':'issuer'],socket,crypto,true)));
  req.setTimeout(7800,()=>{req.destroy(Object.assign(Error('fixture-client-timeout'),{code:'ETIMEDOUT'}));});
  req.once('error',error=>finish({complete:false,status:0,headers:{},body:Buffer.concat(chunks),failureCode:safeError(error)}));
  if(url.origin===ORIGIN&&state.held?.requestStarted&&!state.held.response)clientRequest=req;
  req.end(body);
 });
 const projection=response=>({...projectAuthResponse(response,expectedBody,privateValues),sha256:hash(response.body??Buffer.alloc(0)),failureCode:response.failureCode??null,responseOrigin:'upstream-only'});
 const issuerServer=https.createServer({key:config.issuer.keyPem,cert:config.issuer.certPem},async(req,res)=>{state.peers.issuer.httpRequests++;try{
  if(req.method==='GET'&&req.url==='/.well-known/openid-configuration'){state.peers.issuer.discoveryRequests++;json(res,200,issuerProtocol.discovery());}
  else if(req.method==='GET'&&req.url==='/jwks'){state.peers.issuer.jwksRequests++;json(res,200,issuerProtocol.jwks());}
  else if(req.method==='GET'&&req.url?.startsWith('/authorize?')){state.peers.issuer.authorizationRequests++;const redirect=issuerProtocol.authorize(new URL(req.url,ISSUER));res.writeHead(303,{location:redirect.href,'cache-control':'no-store'});res.end();}
  else if(req.method==='POST'&&req.url==='/token'&&String(req.headers['content-type']??'').startsWith('application/x-www-form-urlencoded')){state.peers.issuer.tokenRequests++;json(res,200,issuerProtocol.token(new URLSearchParams(await readBody(req)),req.headers.authorization));}
  else json(res,404,{error:'not_found'});
 }catch{json(res,400,{error:'invalid_grant'});}});
 bindTls(issuerServer,'issuer');
 const finishBackend=reason=>{if(!state.held||!heldResponse||state.held.released)return false;backendReleasedAt=performance.now();state.held.released=true;state.held.releaseReason=reason;state.held.backendPending=false;clearTimeout(watchdog);if(reason==='explicit'){heldResponse.writeHead(200,{'content-type':'application/json'});heldResponse.end(JSON.stringify(config.status));}else{state.held.watchdogFired=reason==='watchdog';heldResponse.destroy();clientRequest?.destroy(Object.assign(Error('fixture-interrupted'),{code:'ECONNRESET'}));}heldResponse=null;return true;};
 const backendServer=https.createServer({key:config.backend.keyPem,cert:config.backend.certPem},(req,res)=>{state.peers.backend.httpRequests++;if(req.method!=='GET'||req.url!==`/v1/model-reviews/${config.admission.id}`||req.headers.authorization!==`Bearer ${config.readToken}`){state.peers.backend.rejectedReads++;json(res,403,{error:{code:'review-denied'}});return;}state.peers.backend.authorizedReads++;
  if(state.held?.requestStarted&&!state.held.backendObserved){const held=state.held;backendHeldAt=performance.now();held.backendObserved=true;held.backendPending=true;held.backendReadOrdinal=state.peers.backend.authorizedReads;heldResponse=res;watchdog=setTimeout(()=>finishBackend('watchdog'),7000);res.once('close',()=>{if(state.held===held&&!held.released){held.backendPending=false;held.backendClientDisconnected=true;}});return;}
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(config.status));
 });
 bindTls(backendServer,'backend');
 const frontendServer=https.createServer({key:config.frontend.keyPem,cert:config.frontend.certPem},(req,res)=>{
  state.peers.frontend.httpRequests++;state.proxy.requests++;
  if(!req.url?.startsWith('/')||req.url.startsWith('//')||!['GET','POST'].includes(req.method)||req.headers.host!=='dashboard.fixture.invalid:3000'){res.writeHead(400);res.end();return;}
  const headers={host:'dashboard.fixture.invalid:3000','x-forwarded-proto':'https',...(req.headers.origin?{origin:req.headers.origin}:{}),...(req.headers.cookie?{cookie:req.headers.cookie}:{}),...(req.headers['sec-fetch-site']?{'sec-fetch-site':req.headers['sec-fetch-site']}:{}),...(req.headers['content-length']?{'content-length':req.headers['content-length']}:{}),...(req.headers['content-type']?{'content-type':req.headers['content-type']}:{})};
  const upstream=http.request({host:'127.0.0.1',port:3000,path:req.url,method:req.method,headers,agent:false},response=>{res.writeHead(response.statusCode,response.headers);response.on('error',()=>{state.proxy.errors++;res.destroy();});response.pipe(res);});
  upstream.setTimeout(7600,()=>{state.proxy.timeouts++;upstream.destroy(Object.assign(Error('fixture-upstream-timeout'),{code:'ETIMEDOUT'}));});upstream.on('error',()=>{state.proxy.errors++;res.destroy();});req.on('aborted',()=>upstream.destroy());res.on('close',()=>{if(!res.writableEnded)upstream.destroy();});req.pipe(upstream);
 });
 bindTls(frontendServer,'frontend');
 const authenticate=async()=>{
  const a=state.authentication;a.started=true;state.stage='authenticating';a.stage='anonymous-read';
  try{
   const anonymous=await request(ORIGIN+`/api/reviews/${config.admission.id}`);a.anonymousStatus=anonymous.status;if(!anonymous.complete||anonymous.status!==401||!privateHeaders(anonymous.headers))throw Error();
   a.stage='login';const login=await request(ORIGIN+'/auth/login',{method:'POST',origin:true});a.loginStatus=login.status;a.loginResponseComplete=login.complete;a.transactionCookieIssued=!!login.headers['set-cookie'];
   if(!login.complete||login.status!==303||!privateHeaders(login.headers))throw Error();
   const transaction=authHelperCookie(login.headers['set-cookie'],'__Host-agentci-login');a.transactionCookieAttributes=transaction.attributes;privateValues.push(transaction.cookie.split('=')[1]);
   const authorization=new URL(login.headers.location);if(authorization.origin!==ISSUER||authorization.pathname!=='/authorize'||authorization.searchParams.get('redirect_uri')!==ORIGIN+'/auth/callback')throw Error();
   a.stage='authorization';const authorized=await request(authorization.href);if(!authorized.complete||authorized.status!==303)throw Error();
   const callback=new URL(authorized.headers.location);a.callbackOriginMatched=callback.origin===ORIGIN&&callback.pathname==='/auth/callback';if(!a.callbackOriginMatched||callback.searchParams.get('state')!==authorization.searchParams.get('state'))throw Error();
   a.stage='callback';const returned=await request(callback.href,{cookie:transaction.cookie});a.callbackStatus=returned.status;a.sessionCookieIssued=(returned.headers['set-cookie']??[]).some(value=>value.startsWith('__Host-agentci-session='));if(!returned.complete||returned.status!==303||returned.headers.location!==ORIGIN||!privateHeaders(returned.headers))throw Error();
   const session=authHelperCookie(returned.headers['set-cookie'],'__Host-agentci-session');a.sessionCookieAttributes=session.attributes;sessionCookie=session.cookie;privateValues.push(session.cookie.split('=')[1]);
   a.stage='session';const sessionResult=await request(ORIGIN+'/api/session',{cookie:sessionCookie});a.sessionStatus=sessionResult.status;const sessionBody=JSON.parse(sessionResult.body.toString('utf8'));if(!sessionResult.complete||sessionResult.status!==200||!privateHeaders(sessionResult.headers)||!Number.isFinite(sessionBody.validForMs)||sessionBody.validForMs<=0||!/^[a-f0-9]{32}$/.test(sessionBody.viewBinding))throw Error();privateValues.push(sessionBody.viewBinding);
   a.stage='baseline';a.baseline=projection(await request(ORIGIN+`/api/reviews/${config.admission.id}`,{cookie:sessionCookie}));if(!a.baseline.complete||a.baseline.status!==200||!a.baseline.expectedBodyMatched||!a.baseline.schemaMatched||!a.baseline.privateCacheHeaders||a.baseline.cookieIssued||a.baseline.privateValueLeak)throw Error();
   a.authenticated=true;a.stage='complete';state.stage='authenticated';
  }catch{a.failureCode='AUTHENTICATION_REJECTED';a.stage='failed';state.stage='authentication-failed';const protectedRead=await request(ORIGIN+`/api/reviews/${config.admission.id}`);a.failedProtectedStatus=protectedRead.complete?protectedRead.status:0;}
  finally{a.complete=true;busy=false;}
 };
 const hold=async id=>{
  backendHeldAt=null;backendReleasedAt=null;
  state.held={id,observerId:config.observerId,requestStarted:true,requestPending:true,backendObserved:false,backendPending:false,backendReadOrdinal:0,backendClientDisconnected:false,released:false,releaseReason:null,watchdogFired:false,response:null};state.stage='held-request-started';
  const response=await request(ORIGIN+`/api/reviews/${config.admission.id}`,{cookie:sessionCookie});state.held.response=projection(response);state.held.requestPending=false;state.stage=response.complete?'held-response-complete':'held-response-interrupted';
 };
 const snapshot=()=>({...state,held:state.held?{...state.held,...authHoldTiming(backendHeldAt,backendReleasedAt,performance.now())}:null,issuerProtocol:issuerProtocol.stats()});
 const control=http.createServer((req,res)=>{
  try{
   const url=new URL(req.url,'http://127.0.0.5:4444');
   if(req.method==='GET'&&url.pathname==='/state'&&!url.search){json(res,200,snapshot());return;}
   if(req.method!=='POST'){json(res,405,{error:'method_rejected'});return;}
   if(url.pathname==='/authenticate'&&!url.search&&!busy&&!state.authentication.started){busy=true;void authenticate();json(res,202,snapshot());return;}
   const id=url.searchParams.get('id');
   if(url.pathname==='/hold'&&url.searchParams.size===1&&UUID.test(id??'')&&state.authentication.authenticated&&!state.held){void hold(id);json(res,202,snapshot());return;}
   if(url.pathname==='/release'&&url.searchParams.size===1&&id===state.held?.id&&state.held.backendPending&&finishBackend('explicit')){json(res,200,snapshot());return;}
   if(url.pathname==='/shutdown'&&!url.search){state.shutdownRequested=true;finishBackend('shutdown');json(res,200,snapshot());setTimeout(()=>{for(const socket of sockets)socket.destroy();for(const server of [...servers,control])server.close();process.stdin.destroy();},25);return;}
   json(res,409,{error:'control_rejected'});
  }catch{json(res,400,{error:'control_rejected'});}
 });
 servers.push(control);
 const listen=(server,port,host)=>new Promise((resolve,reject)=>{server.once('error',()=>reject(Error('fixture-listener-rejected')));server.listen(port,host,resolve);});
 await Promise.all([listen(frontendServer,3000,'127.0.0.2'),listen(issuerServer,4443,'127.0.0.3'),listen(backendServer,4446,'127.0.0.4'),listen(control,4444,'127.0.0.5')]);
 state.ready=true;state.stage='ready';
}

/** No bootstrap, secret, certificate or private body is interpolated into this immutable command. */
export const AUTH_HELPER_SOURCE=[
 "import crypto from 'node:crypto';import http from 'node:http';import https from 'node:https';",
 'const createIssuerProtocol='+createIssuerProtocol.toString()+';',
 'const authHelperCookie='+authHelperCookie.toString()+';',
 'const projectAuthResponse='+projectAuthResponse.toString()+';',
 'const authHelperLookup='+authHelperLookup.toString()+';',
 'const captureAuthCertificateHash='+captureAuthCertificateHash.toString()+';',
 'const bindAuthEarlyCertificateCapture='+bindAuthEarlyCertificateCapture.toString()+';',
 'const authHoldTiming='+authHoldTiming.toString()+';',
 '('+runAuthHelper.toString()+')(crypto,http,https).catch(()=>{process.exitCode=1;process.stderr.write("fixture-helper-failed\\n");process.exit(1);});'
].join('\n');
