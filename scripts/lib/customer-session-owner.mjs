import {customerCleanupVerified} from './customer-infrastructure-teardown.mjs';
import {customerAbort} from './customer-diagnostics.mjs';
/** At most two ephemeral scopes. Own both before any initialization or write. */
export function customerSessionOwner(){
 const entries=[],completed=new Map(),databases=[],databaseProofs=new Map(),namespaces=[],namespaceProofs=new Map();let closing=false,inFlight;
 const snapshot=()=>entries.map(({label,session})=>({label,scope:session.scope,namespace:session.namespace,
  operations:session.reservations.map(({review,request,reference,acknowledged,recoveredAcknowledgement,absentAfterControllerDrain,cleanupSettlement})=>({admission:review.admission,request,reference,acknowledged,recoveredAcknowledgement,absentAfterControllerDrain,cleanupSettlement})),
  diagnostics:session.diagnosticsSnapshot(),cleanup:completed.get(session)}));
 return {register(label,session){
  if(closing||entries.length>=2||!['primary','staged-cancellation'].includes(label)||entries.some(e=>e.label===label)||!session?.scope||entries.some(e=>e.session.scope.organizationId===session.scope.organizationId||e.session.namespace===session.namespace||e.session.scope.repository!==session.scope.repository))throw Error('Distinct owned customer scope and namespace required');
  entries.push({label,session});return session;
 },registerDatabase(database){if(closing||databases.length||!/^customer_staged_[a-f0-9]{32}$/.test(database?.name))throw Error('Bounded owned isolated database required');databases.push(database);return database;},registerNamespace(resource){if(closing||namespaces.length>=2||!/^customer-staged-[a-f0-9-]{36}$/.test(resource?.namespace))throw Error('Bounded owned namespace required');namespaces.push(resource);return resource;},namespaceSnapshot:()=>namespaces.map(n=>({namespace:n.namespace,state:n.state(),cleanup:namespaceProofs.get(n)??null})),snapshot,databaseSnapshot:()=>databases.map(d=>({name:d.name,...(d.state?{state:d.state()}:{}),cleanup:databaseProofs.get(d)??null})),
 close(options={}){if(inFlight)return inFlight;closing=true;inFlight=(async()=>{customerAbort(options.signal);let failed=false;
  // Attempt both scopes even if one needs recovery. Retain successful proofs.
  for(const {session} of [...entries].reverse())if(!completed.has(session))try{const proof=await session.close(options);if(!customerCleanupVerified(proof))throw Error();completed.set(session,proof);}catch{failed=true;}
  if(failed||completed.size!==entries.length)throw Error('Customer scopes require owned cleanup recovery');
  customerAbort(options.signal);
  for(const resource of namespaces)if(!namespaceProofs.has(resource)){const proof=await resource.close(options);customerAbort(options.signal);if(proof?.temporaryConnections!==0||proof?.namespace!==resource.namespace)throw Error('Owned namespace transport cleanup unverified');namespaceProofs.set(resource,proof);}
  for(const database of databases)if(!databaseProofs.has(database)){customerAbort(options.signal);const proof=await database.close(options);if(proof?.ownedDatabases!==0||proof?.name!==database.name||proof?.result!=='passed')throw Error('Owned isolated database cleanup unverified');databaseProofs.set(database,proof);}
  return {assertionContainers:{ownedAssertionContainers:0},controllerProcesses:{ownedProcessesRemaining:0},evaluator:{ownedEvaluatorContainers:0},temporalConnection:null,evaluatorRole:null,databasePool:null,temporaryNamespaces:[...namespaceProofs.values()],isolatedDatabases:[...databaseProofs.values()],sessions:snapshot().map(({label,scope,namespace,cleanup})=>({label,scope,namespace,cleanup}))};
 })().finally(()=>{inFlight=null;});return inFlight;},async quiesce(options){const results=await Promise.allSettled([...entries.map(e=>e.session.quiesce(options)),...databases.map(d=>d.quiesce(options)),...namespaces.map(n=>n.quiesce(options))]);if(results.some(r=>r.status==='rejected'))throw Error('Customer scope quiescence unverified');},forceQuiesce(){for(const e of entries)try{e.session.forceQuiesce();}catch{}for(const d of databases)try{d.forceQuiesce();}catch{}for(const n of namespaces)try{n.forceQuiesce();}catch{}}};
}
