/** Owns only the session's explicitly supplied processes, pool clients and gRPC
 * connection. A deadline alone is insufficient: force() fences new work and
 * closes these handles before the entrypoint's last-resort process termination. */
export function customerRecoveryOwner({pool,runtime,evaluator,connection,journal}){
 const abort=new AbortController(),clients=new Set(),callbacks=new Set();let latched=false,quiescing,endingPool;
 // The borrower owns release(): pool.query releases in its error callback.
 // Stealing it here can crash on double release after stream destruction.
 const destroyClient=client=>{try{client.connection?.stream?.destroy();}catch{}try{client.end()?.catch?.(()=>{});}catch{}};
 pool.on('error',()=>{});
 pool.on('connect',client=>{clients.add(client);client.on('error',()=>{});if(latched)destroyClient(client);});
 pool.on('remove',client=>clients.delete(client));
 pool.on('acquire',client=>{if(latched){destroyClient(client);queueMicrotask(()=>destroyClient(client));}});
 const forceConnections=()=>{try{connection()?.client?.close();}catch{}for(const client of clients)destroyClient(client);};
 const owner={get quiesced(){return latched;},get signal(){return abort.signal;},
  combine(signal){return signal?AbortSignal.any([signal,abort.signal]):abort.signal;},
  async diagnostic(action){if(latched)return;const pending=Promise.resolve().then(()=>{if(!latched)return action({signal:abort.signal});});callbacks.add(pending);try{return await pending;}finally{callbacks.delete(pending);}},
  closePool(){return endingPool??=pool.end();},
  force(){latched=true;abort.abort();try{runtime.forceStop();}catch{}try{evaluator.forceCommands?.();}catch{}forceConnections();journal.record('quiescence','unverified');},
  quiesce({signal}={}){if(quiescing)return quiescing;latched=true;abort.abort();journal.record('quiescence','started');
   // Close parent network handles immediately, including checked-out PostgreSQL
   // clients; pool.end alone waits indefinitely for a missing release.
   forceConnections();
   quiescing=(async()=>{let verified=true;
    try{await runtime.close('SIGKILL');}catch{verified=false;}
    try{await evaluator.close({signal});}catch{verified=false;}
    try{await connection()?.close();}catch{verified=false;}
    try{await owner.closePool();}catch{verified=false;}
    await Promise.allSettled([...callbacks]);
    const complete=verified&&!signal?.aborted;journal.record('quiescence',complete?'passed':'unverified');
    if(!complete)throw Error('Owned customer quiescence remains unverified');
    // Do not invoke a diagnostic callback here. Its pending writes were aborted
    // and joined above; the caller retains the final snapshot after this join.
   })();return quiescing;
  }
 };return owner;
}
