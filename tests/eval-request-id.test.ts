import test from 'node:test';import assert from 'node:assert/strict';
import {nameUuid,trialRequestId} from '../packages/evals/request-id.ts';
test('SHA-256 name-based UUIDv8 matches RFC 9562 B.2 and separates unit/trial identities',()=>{
  assert.equal(nameUuid('6ba7b810-9dad-11d1-80b4-00c04fd430c8','www.example.com'),'5c146b14-3c52-8afd-938a-375d0df1fbf6');
  const unit='00000000-0000-4000-8000-000000000001';
  assert.equal(trialRequestId(unit,0),trialRequestId(unit.toUpperCase(),0));
  assert.notEqual(trialRequestId(unit,0),trialRequestId(unit,1));
  assert.notEqual(trialRequestId(unit,0),trialRequestId('00000000-0000-4000-8000-000000000002',0));
  for(const index of [-1,1000,0.5,NaN])assert.throws(()=>trialRequestId(unit,index),/trial index/);
  assert.throws(()=>trialRequestId('invalid',0),/namespace/);
});
