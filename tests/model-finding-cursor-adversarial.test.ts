import test from 'node:test';
import assert from 'node:assert/strict';
import {FindingCursors,FindingReadFailure} from '../packages/storage/finding-cursor.ts';
const key='independent-cursor-signing-fixture-key';
const scope={route:'history' as const,organizationId:'00000000-0000-4000-8000-000000000001',repository:'example/repo',reviewId:'00000000-0000-4000-8000-000000000002',findingId:`sha256:${'a'.repeat(64)}`};
const position={...scope,summaryDigest:null,throughVersion:3,next:2,previousDigest:`sha256:${'b'.repeat(64)}`};
const invalid=(fn:()=>unknown)=>assert.throws(fn,(error:unknown)=>error instanceof FindingReadFailure&&error.status===400&&error.code==='invalid-cursor');
test('finding cursor binds tenant, repository, route, review, finding, signing key, and exact expiry',()=>{
 let now=1_800_000_000_000;const cursors=new FindingCursors(key,()=>now),token=cursors.encode(position);
 assert.equal(cursors.decode(token,scope).next,2);
 for(const changed of [{organizationId:'00000000-0000-4000-8000-000000000003'},{repository:'other/repo'},{route:'findings' as const},{reviewId:'00000000-0000-4000-8000-000000000004'},{findingId:`sha256:${'b'.repeat(64)}`}])invalid(()=>cursors.decode(token,{...scope,...changed}));
 invalid(()=>new FindingCursors('different-fixture-key-with-enough-entropy',()=>now).decode(token,scope));
 now+=15*60*1000-1;assert.equal(cursors.decode(token,scope).throughVersion,3);now++;invalid(()=>cursors.decode(token,scope));
});
test('cursor tampering cannot change immutable watermark, summary, offset, expiration or add filters',()=>{
 const cursors=new FindingCursors(key,()=>1_800_000_000_000),token=cursors.encode(position);
 for(const mutation of [{throughVersion:999},{summaryDigest:`sha256:${'f'.repeat(64)}`},{next:99},{expires:1_900_000_000_000},{status:'confirmed'},{repository:'foreign/repo'}]){
  const wrapped=JSON.parse(Buffer.from(token,'base64url').toString());Object.assign(wrapped.data,mutation);
  invalid(()=>cursors.decode(Buffer.from(JSON.stringify(wrapped)).toString('base64url'),scope));
 }
 for(const malformed of ['',token+'=',token+'\n','_'.repeat(2049),Buffer.from('{}').toString('base64url'),Buffer.from('null').toString('base64url')])invalid(()=>cursors.decode(malformed,scope));
});
