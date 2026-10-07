import {canonical,digest} from '../review/engine.ts';
import {validateModelFinding,type ModelFinding} from './model.ts';
export interface FindingReceipt {
 findingId:string;subjectDigest:string;evidenceDigest:string;assertionDigest:string|null;
 actor:'reproduction'|'operator';outcome:'reproduced'|'not-reproduced'|'error'|'false-positive'|'resolved';reason:string;
}
export type FindingAction={type:'queue'}|{type:'reproduce'|'false-positive'|'resolve';receiptId:string};
function fail():never{throw new Error('invalid-finding-transition');}
const sha=(v:unknown)=>typeof v==='string'&&/^sha256:[a-f0-9]{64}$/.test(v);
/** Shape and identity shared by retained event reads and live transitions. */
export function validateFindingActionReceipt(action:FindingAction,receipt:FindingReceipt|null,finding:Pick<ModelFinding,'id'|'subject'>){
 if(!action||typeof action!=='object'||!['queue','reproduce','false-positive','resolve'].includes(action.type)||Object.keys(action).sort().join(',')!==(action.type==='queue'?'type':'receiptId,type'))fail();
 if(action.type==='queue'){if(receipt!==null)fail();return;}
 if(typeof action.receiptId!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(action.receiptId))fail();
 if(!receipt||typeof receipt!=='object'||Object.keys(receipt).sort().join(',')!=='actor,assertionDigest,evidenceDigest,findingId,outcome,reason,subjectDigest'||receipt.findingId!==finding.id||receipt.subjectDigest!==digest(canonical(finding.subject))||!sha(receipt.evidenceDigest)||typeof receipt.reason!=='string'||!receipt.reason.trim()||Buffer.byteLength(receipt.reason)>4096)fail();
 if(action.type==='reproduce'){if(receipt.actor!=='reproduction'||!sha(receipt.assertionDigest)||!['reproduced','not-reproduced','error'].includes(receipt.outcome))fail();}
 else if(receipt.actor!=='operator'||receipt.assertionDigest!==null||receipt.outcome!==(action.type==='resolve'?'resolved':'false-positive'))fail();
}
/** The reader is controller-owned: it authenticates receipt writers, policy and
 * retained execution evidence. Never bind this to a model-supplied receipt map.
 * This layer checks identity/transitions; M3-06c supplies isolated reproduction.
 */
export function createFindingTransitions(readReceipt:(id:string)=>Promise<FindingReceipt>){
 return async(value:ModelFinding,action:FindingAction,expectedVersion:number)=>{
  const before=validateModelFinding(value,value.subject),beforeDigest=digest(canonical(before));
  if(before.version!==expectedVersion||before.version===Number.MAX_SAFE_INTEGER)fail();
  if(!action||typeof action!=='object'||!['queue','reproduce','false-positive','resolve'].includes(action.type))fail();
  const type=action.type;
  if(Object.keys(action).sort().join(',')!==(type==='queue'?'type':'receiptId,type'))fail();
  const allowed=type==='queue'?['deduplicated','unconfirmed']:type==='resolve'?['confirmed','unconfirmed','false-positive']:['reproduction-pending'];
  if(!allowed.includes(before.state))fail();
  let after:ModelFinding={...before,version:before.version+1,state:'reproduction-pending',disposition:null};
  if(type!=='queue'){
   const id=(action as Exclude<FindingAction,{type:'queue'}>).receiptId;
   if(typeof id!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))fail();
   let receipt:FindingReceipt;try{receipt=structuredClone(await readReceipt(id));}catch{throw new Error('finding-receipt-unavailable');}
   validateFindingActionReceipt(action,receipt,before);
   if(type==='reproduce'){
    after.state=receipt.outcome==='reproduced'?'confirmed':'unconfirmed';
   }else{
    after.state=type==='resolve'?'resolved':'false-positive';
   }
   after.disposition={kind:receipt.actor,evidenceDigest:receipt.evidenceDigest,reason:receipt.reason,outcome:receipt.outcome};
  }
  after=validateModelFinding(after,before.subject);
  return {beforeDigest,finding:after};
 };
}

/** Controller-authenticated policy. Consensus count is deliberately not an input. */
export function findingBlockingDecision(value:ModelFinding,policy:{id:string;minimumSeverity:ModelFinding['severity'];allowUnconfirmed:boolean;reason:string}){
 const f=validateModelFinding(value,value.subject),rank=['low','medium','high','critical'];
 if(!policy||Object.keys(policy).sort().join(',')!=='allowUnconfirmed,id,minimumSeverity,reason'||typeof policy.id!=='string'||!/^[A-Za-z0-9._-]{1,128}$/.test(policy.id)||!rank.includes(policy.minimumSeverity)||typeof policy.allowUnconfirmed!=='boolean'||typeof policy.reason!=='string'||Buffer.byteLength(policy.reason)>4096||policy.allowUnconfirmed&&!policy.reason.trim())fail();
 const eligible=f.mode==='external'&&!['resolved','false-positive'].includes(f.state)&&rank.indexOf(f.severity)>=rank.indexOf(policy.minimumSeverity);
 const blocking=eligible&&(f.state==='confirmed'||policy.allowUnconfirmed);
 return {blocking,basis:blocking?(f.state==='confirmed'?'confirmed-reproduction':'explicit-customer-policy'):'nonblocking',policyId:policy.id,policyDigest:digest(canonical(policy)),state:f.state,mode:f.mode};
}
