import {createHash} from 'node:crypto';
export const CAPTURED_GATE_HISTORY_SHA256='cbb84e4480d8c30ebb208f21e6323fedaf024ca23c032c929a1e4937f4ea4663';
/** This captured audit is immutable. Current ledgers belong in a separate field;
 * regeneration must not rewrite an earlier acceptance/scope observation. */
export function capturedGateHistory(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length>2*1024*1024||createHash('sha256').update(bytes).digest('hex')!==CAPTURED_GATE_HISTORY_SHA256)throw Error('captured-gate-history-changed');
 const value=JSON.parse(bytes.toString('utf8'));
 if(value.schemaVersion!==1||!Array.isArray(value.snapshots)||value.snapshots.map(s=>s.milestone).join(',')!=='M0,M1,M2,M3')throw Error('invalid-captured-gate-history');
 return structuredClone(value.snapshots);
}
