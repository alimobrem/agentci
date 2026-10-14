/** Explicit trusted-entrypoint fallback, never called on import. Exiting this
 * owned harness process prevents non-cooperative callbacks from acting later.
 * Recovery state stays unverified even when synchronous handle closure succeeds. */
export function terminateCustomerHarness(session,persist){
 try{try{session.forceQuiesce?.();}catch{}const result=persist();if(result?.then)throw Error('Terminal recovery persistence must be synchronous');}
 finally{process.exit(1);}
}
