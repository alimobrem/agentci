const phases=new Set(['initialize','review','unsupported','approval','reservation','consumer','settlement','physical','active','recovery','observation','reconciliation','cleanup','quiescence']);
const outcomes=new Set(['started','passed','failed','aborted','unverified']);
const processStates=new Set(['absent','starting','running','exited','unverified']);
const evaluatorPhases=new Set(['not-started','creating','identifying','inspecting','starting','running','stopping','removed','unverified']);
const commands=new Set(['create','ps','inspect','start','kill','rm']);
const failures=new Set(['none','buffer-limit','deadline','not-found','command-failed','unverified']);
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
export function customerDiagnostics(facts){
 const events=[];let sequence=0,dropped=0;
 return {record(phase,outcome,status){
  if(!phases.has(phase)||!outcomes.has(outcome))throw Error('Invalid customer diagnostic classification');
  const event={sequence:++sequence,phase,outcome,...facts()};
  if(status){event.status={dispatch:['queued','bound','dispatched','settled','unavailable'].includes(status.dispatch)?status.dispatch:'unavailable',cancelRequested:status.cancelRequested===true,settlement:['receipt-retained','never-staged','superseded'].includes(status.settlement)?status.settlement:null};}
  if(events.length===256){events.shift();dropped++;}events.push(event);
 },snapshot(){return {schemaVersion:1,events:structuredClone(events),dropped};}};
}
export function customerAbort(signal){if(signal?.aborted){const error=Error('Customer operation aborted');error.code='customer-operation-aborted';throw error;}}
