const phases=new Set(['initialize','review','unsupported','approval','reservation','consumer','settlement','physical','active','recovery','observation','reconciliation','cleanup','quiescence']);
const outcomes=new Set(['started','passed','failed','aborted','unverified']);
const processStates=new Set(['absent','starting','running','exited','unverified']);
const evaluatorPhases=new Set(['not-started','creating','identifying','inspecting','starting','running','stopping','removed','unverified']);
const commands=new Set(['create','ps','inspect','start','kill','rm']);
const failures=new Set(['none','buffer-limit','deadline','not-found','command-failed','unverified']);
const clientErrors=new Set(['invalid-request','unauthorized','forbidden','review-denied','reproduction-denied','not-found','method-not-allowed','idempotency-conflict','version-conflict','review-not-complete','invalid-transition','approval-conflict','body-too-large','response-too-large','unsupported-media-type','unsupported-content-encoding','service-unavailable','invalid-response','timeout','network-error','aborted']);
export function customerDiagnosticError(error){
 if(error===undefined)return undefined;
 // Never copy message, body, cause, URL, headers or an arbitrary error object.
 return {code:clientErrors.has(error?.code)?error.code:'unclassified',status:[400,401,403,404,405,409,413,415,503].includes(error?.status)?error.status:null};
}
const integer=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max?value:null;
/** Projection is constructed field by field. No error, environment, path, output,
 * arbitrary label, or caller-supplied object can enter the retained journal. */
export function customerDiagnosticFacts(runtime,evaluator){
 const processes=['api','worker','evaluator','operator'].map(role=>{
  const s=runtime?.state?.(role)??{};
  return {role,state:processStates.has(s.state)?s.state:'unverified',pid:integer(s.pid,1,2**31-1),code:integer(s.code,0,255),signal:['SIGTERM','SIGKILL','SIGINT'].includes(s.signal)?s.signal:null};
 });
 const s=evaluator?.state?.()??{};
 return {processes,evaluator:{phase:evaluatorPhases.has(s.phase)?s.phase:'unverified',creationAttempted:s.creationAttempted===true,identified:s.identified===true,verified:s.verified===true,running:typeof s.running==='boolean'?s.running:null,exitCode:integer(s.exitCode,0,255),command:commands.has(s.command)?s.command:null,failure:failures.has(s.failure)?s.failure:'unverified'}};
}
export function customerDiagnosticIdentity(value){
 if(value===undefined||value===null)return null;
 const keys=['harnessSource','runId','runAttempt','candidate'],candidateKeys=['releaseSource','packageManifestSha256','packageSha256','imagesManifestSha256','publicationEvidenceSha256'];
 if(typeof value!=='object'||Object.keys(value).some(key=>!keys.includes(key))||!Object.keys(value).every(key=>keys.includes(key))||keys.some(key=>value[key]===undefined)||! /^[a-f0-9]{40}$/.test(value.harnessSource)||![value.runId,value.runAttempt].every(item=>typeof item==='string'&&/^[1-9][0-9]{0,19}$/.test(item))||!value.candidate||typeof value.candidate!=='object'||Object.keys(value.candidate).length!==candidateKeys.length||candidateKeys.some(key=>typeof value.candidate[key]!=='string'||!(key==='releaseSource'?/^[a-f0-9]{40}$/:/^[a-f0-9]{64}$/).test(value.candidate[key])))throw Error('Invalid customer diagnostic identity');
 return {harnessSource:value.harnessSource,runId:value.runId,runAttempt:value.runAttempt,candidate:Object.fromEntries(candidateKeys.map(key=>[key,value.candidate[key]]))};
}
export function customerDiagnostics(facts,identity){
 const binding=customerDiagnosticIdentity(identity);
 const events=[];let sequence=0,dropped=0;
 return {record(phase,outcome,status,error,operationId){
  if(!phases.has(phase)||!outcomes.has(outcome))throw Error('Invalid customer diagnostic classification');
  const event={sequence:++sequence,phase,outcome,...facts()};
  if(error!==undefined)event.error=customerDiagnosticError(error);
  if(typeof operationId==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(operationId))event.operationId=operationId;
  if(status){event.status={dispatch:['queued','bound','dispatched','settled','unavailable'].includes(status.dispatch)?status.dispatch:'unavailable',cancelRequested:status.cancelRequested===true,settlement:['receipt-retained','never-staged','superseded'].includes(status.settlement)?status.settlement:null};}
  if(events.length===256){events.shift();dropped++;}events.push(event);
 },snapshot(){return {schemaVersion:1,identity:structuredClone(binding),events:structuredClone(events),dropped};}};
}
export function customerAbort(signal){if(signal?.aborted){const error=Error('Customer operation aborted');error.code='customer-operation-aborted';throw error;}}
