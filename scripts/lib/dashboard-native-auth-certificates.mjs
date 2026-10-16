import {generateKeyPairSync,randomBytes,createHash,X509Certificate,createPrivateKey} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {writeFile,mkdir,readFile,chmod,lstat} from 'node:fs/promises';
import {join,resolve,basename,isAbsolute} from 'node:path';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const AUTH_CA_DESTINATION='/run/agentci-fixture-ca.pem';
export const AUTH_TRUST_CASES=Object.freeze(['absent-ca','wrong-ca','wrong-hostname','expired-certificate']);
const run=args=>{try{return execFileSync('openssl',args,{env:{PATH:process.env.PATH},encoding:'utf8',timeout:15000,maxBuffer:1024*1024,stdio:['ignore','pipe','pipe']});}catch{throw Error('Owned synthetic certificate generation failed; diagnostics withheld');}};
const privateWrite=(path,value)=>writeFile(path,value,{mode:0o600,flag:'wx'});
function privateKey(){return generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({format:'pem',type:'pkcs8'});}
function publicCertificate(certPem,keyPem,caPem,signingCaPem){
 const cert=new X509Certificate(certPem),ca=new X509Certificate(caPem),signer=new X509Certificate(signingCaPem);
 if(cert.ca||!cert.checkPrivateKey(createPrivateKey(keyPem))||!cert.verify(signer.publicKey)||!cert.checkIssued(signer))throw Error('Synthetic leaf identity mismatch');
 return {sha256:hash(certPem),derSha256:hash(cert.raw),bytes:Buffer.byteLength(certPem),issuerCaSha256:hash(signingCaPem),verificationCaSha256:hash(caPem),signedByExpectedCa:cert.verify(ca.publicKey),validFrom:cert.validFrom,validTo:cert.validTo,expired:Date.parse(cert.validTo)<Date.now(),uiHostnameMatches:!!cert.checkHost('dashboard.fixture.invalid'),issuerIpMatches:!!cert.checkIP('127.0.0.3'),backendIpMatches:!!cert.checkIP('127.0.0.4')};
}
export function validateNativeAuthenticatedCertificateMetadata(leaves,nowMs=Date.now()){
 const reject=()=>{throw Error('Synthetic certificate controls do not establish intended differences');};
 const names=['valid','wrong-ca','wrong-hostname','expired'];
 const fields=['sha256','derSha256','bytes','issuerCaSha256','verificationCaSha256','signedByExpectedCa','validFrom','validTo','expired','uiHostnameMatches','issuerIpMatches','backendIpMatches'];
 const exact=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
 if(!Number.isSafeInteger(nowMs)||!exact(leaves,names))reject();
 const v=leaves.valid,w=leaves['wrong-ca'],h=leaves['wrong-hostname'],e=leaves.expired;
 const validDate=l=>typeof l.validFrom==='string'&&typeof l.validTo==='string'&&l.validFrom.length<=64&&l.validTo.length<=64&&Number.isFinite(Date.parse(l.validFrom))&&Number.isFinite(Date.parse(l.validTo))&&Date.parse(l.validFrom)<Date.parse(l.validTo);
 const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
 const current=l=>Date.parse(l.validFrom)<=nowMs&&Date.parse(l.validTo)>nowMs;
 const values=[v,w,h,e];
 if(!values.every(l=>exact(l,fields)&&validDate(l)&&[l.sha256,l.derSha256,l.issuerCaSha256,l.verificationCaSha256].every(sha)&&Number.isSafeInteger(l.bytes)&&l.bytes>0&&l.bytes<=16384&&['signedByExpectedCa','expired','uiHostnameMatches','issuerIpMatches','backendIpMatches'].every(key=>typeof l[key]==='boolean')&&l.expired===(Date.parse(l.validTo)<nowMs)&&l.verificationCaSha256===v.verificationCaSha256))reject();
 if(new Set(values.map(l=>l.sha256)).size!==4||new Set(values.map(l=>l.derSha256)).size!==4||![v,h,e].every(l=>l.issuerCaSha256===l.verificationCaSha256))reject();
 if(!v.signedByExpectedCa||!v.uiHostnameMatches||!v.issuerIpMatches||!v.backendIpMatches||!current(v)||w.signedByExpectedCa||w.uiHostnameMatches||!w.issuerIpMatches||w.backendIpMatches||!current(w)||w.issuerCaSha256===w.verificationCaSha256||!h.signedByExpectedCa||h.uiHostnameMatches||h.issuerIpMatches||h.backendIpMatches||!current(h)||!e.signedByExpectedCa||e.uiHostnameMatches||!e.issuerIpMatches||e.backendIpMatches||!e.expired)reject();
 return leaves;
}

/** Only the approved disposable hosted runner may generate these ephemeral test certificates. */
export async function createNativeAuthenticatedCertificates(directory){
 if(process.platform!=='linux'||process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REPOSITORY!=='alimobrem/agentci')throw Error('Synthetic CA generation requires owned disposable hosted Linux CI');
 if(!isAbsolute(directory)||resolve(directory)!==directory||!basename(directory).startsWith('agentci-image-smoke-'))throw Error('Owned synthetic certificate directory required');
 const info=await lstat(directory);if(!info.isDirectory()||info.isSymbolicLink()||(info.mode&0o777)!==0o700||info.uid!==process.getuid())throw Error('Private synthetic certificate directory required');
 const root=join(directory,'authenticated-certs');await mkdir(root,{mode:0o700});
 const files=[];
 const write=async(name,value,publicFile=false)=>{const path=join(root,name);await privateWrite(path,value);if(publicFile)await chmod(path,0o644);files.push(path);return path;};
 const roots={};
 for(const name of ['a','b']){
  const keyPem=privateKey(),keyPath=await write('ca-'+name+'-key.pem',keyPem),certPath=join(root,'ca-'+name+'.pem');
  run(['req','-new','-x509','-sha256','-key',keyPath,'-out',certPath,'-days','1','-subj','/CN=AgentCI disposable fixture CA '+name,'-addext','basicConstraints=critical,CA:TRUE','-addext','keyUsage=critical,keyCertSign,cRLSign']);
  await chmod(certPath,0o644);files.push(certPath);const certPem=await readFile(certPath,'utf8'),cert=new X509Certificate(certPem);
  if(!cert.ca||!cert.verify(cert.publicKey)||Date.parse(cert.validTo)<=Date.now()||Buffer.byteLength(certPem)>8192)throw Error('Synthetic CA identity incomplete');
  roots[name]={keyPath,certPath,certPem};
 }
 const leaves={};
 for(const [name,rootName,sans,expired] of [['valid','a','DNS:dashboard.fixture.invalid,IP:127.0.0.3,IP:127.0.0.4',false],['wrong-ca','b','IP:127.0.0.3',false],['wrong-hostname','a','DNS:wrong.fixture.invalid',false],['expired','a','IP:127.0.0.3',true]]){
  const keyPem=privateKey(),keyPath=await write(name+'-key.pem',keyPem),csr=join(root,name+'.csr'),certPath=join(root,name+'.pem'),ca=roots[rootName];
  run(['req','-new','-sha256','-key',keyPath,'-out',csr,'-subj','/CN=AgentCI disposable '+name]);await chmod(csr,0o600);files.push(csr);
  const extensions='[server]\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName='+sans+'\n';
  const extensionPath=await write(name+'-extensions.cnf',extensions);
  if(expired){
   const db=await write('index.txt',''),serial=await write('serial.txt','01\n'),newCerts=join(root,'issued');await mkdir(newCerts,{mode:0o700});
   const config=await write('expired-ca.cnf','[ca]\ndefault_ca=fixture\n[fixture]\ndatabase='+db+'\nserial='+serial+'\nnew_certs_dir='+newCerts+'\ncertificate='+ca.certPath+'\nprivate_key='+ca.keyPath+'\ndefault_md=sha256\npolicy=policy\nx509_extensions=server\n[policy]\ncommonName=supplied\n'+extensions);
   run(['ca','-batch','-notext','-config',config,'-in',csr,'-out',certPath,'-startdate','20200101000000Z','-enddate','20200102000000Z']);
  }else run(['x509','-req','-in',csr,'-CA',ca.certPath,'-CAkey',ca.keyPath,'-set_serial','0x'+randomBytes(16).toString('hex'),'-days','1','-sha256','-extfile',extensionPath,'-extensions','server','-out',certPath]);
  await chmod(certPath,0o600);files.push(certPath);const certPem=await readFile(certPath,'utf8');
  leaves[name]={keyPem,certPem,public:publicCertificate(certPem,keyPem,roots.a.certPem,ca.certPem)};
 }
 validateNativeAuthenticatedCertificateMetadata(Object.fromEntries(Object.entries(leaves).map(([name,value])=>[name,value.public])));
 // Root private keys are never delivered to either container. Helper receives only leaf keys over stdin.
 return {ca:{sourcePath:roots.a.certPath,destination:AUTH_CA_DESTINATION,sha256:hash(roots.a.certPem),bytes:Buffer.byteLength(roots.a.certPem)},caPem:roots.a.certPem,leaves,public:{caSha256:hash(roots.a.certPem),caBytes:Buffer.byteLength(roots.a.certPem),leaves:Object.fromEntries(Object.entries(leaves).map(([name,value])=>[name,value.public]))}};
}
