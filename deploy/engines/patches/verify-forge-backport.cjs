const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const directory=process.argv[2];if(!directory)throw new Error('Expected installed forge directory');
const forge=require(directory),metadata=require('./forge-backport.json'),fixture=require('./forge-nested-digest-fixture.json');
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(directory,'lib/rsa.js'))).digest('hex'),metadata.afterSha256);
const key=forge.pki.setRsaPublicKey(new forge.jsbn.BigInteger(fixture.modulusHex,16),new forge.jsbn.BigInteger(fixture.exponent));
const digest=forge.md.sha256.create().update(fixture.message).digest().getBytes(),signature=forge.util.hexToBytes(fixture.signatureHex);
assert.throws(()=>key.verify(digest,signature,undefined,{_skipPaddingChecks:true}),/valid RSASSA-PKCS1-v1_5 DigestInfo/);
const pair=crypto.generateKeyPairSync('rsa',{modulusLength:2048,publicExponent:65537}),publicKey=forge.pki.publicKeyFromPem(pair.publicKey.export({type:'spki',format:'pem'}));
for(const algorithm of ['sha256','sha512']){
 const message=Buffer.from('AgentCI valid RSA compatibility'),signed=crypto.sign(algorithm,message,pair.privateKey),expected=forge.md[algorithm].create().update(message.toString()).digest().getBytes();
 assert.equal(publicKey.verify(expected,signed.toString('binary')),true);assert.equal(publicKey.verify(forge.md[algorithm].create().update('different message').digest().getBytes(),signed.toString('binary')),false);
}
console.log('Pinned malformed nested DigestAlgorithm rejected; native valid SHA-256/SHA-512 signatures accepted and wrong messages rejected.');
