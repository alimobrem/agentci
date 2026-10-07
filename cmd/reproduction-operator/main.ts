#!/usr/bin/env node
import {Pool} from 'pg';
import {runtimeConfig} from '../../packages/runtime/config.ts';
import {loadReproductionRuntime} from '../../packages/runtime/reproductions.ts';
import {reproductionCatalogReaders} from '../../packages/runtime/reproduction-catalog.ts';
import {installationClient,createRemoteSnapshotReader} from '../../packages/github/client.ts';
import {ReproductionAuthorityStore} from '../../packages/storage/reproduction-authority.ts';
import {applyReproductionOperator,ReproductionOperatorArguments} from '../../packages/operator/reproduction.ts';
const args=process.argv.slice(2);
if(args.length===1&&args[0]==='--help'){
 console.log('Deployment operator: apply --config ABSOLUTE_JSON --config-digest sha256:HASH --expected initial|REVISION:sha256:HASH\nRequires scoped deployment environment, pinned catalog, target configuration identity, independent cursor key and approved App credentials. Does not queue execution.');
}else{
 try{
  const result=await applyReproductionOperator(args,async()=>{
   const config=await runtimeConfig(),runtime=await loadReproductionRuntime(config),key=process.env.AGENTCI_CURSOR_KEY;
   if(!runtime||!key||key.length<32||/[\r\n]/.test(key)||key===config.evidenceToken||key===process.env.AGENTCI_OPERATOR_TOKEN)throw Error('reproduction-operator-unavailable');
   const github=installationClient(config.appId,config.installationId,config.privateKey),snapshot=createRemoteSnapshotReader(github),pool=new Pool({connectionString:config.databaseUrl,max:5,connectionTimeoutMillis:5000,query_timeout:10000});
   const readers=reproductionCatalogReaders(pool,config,runtime.catalog,key,(subject,side)=>snapshot(subject.repository,side==='base'?subject.baseSha:subject.headSha));
   // Apply validates historical approval and source. Live execution permission
   // is checked separately by the consumer, never granted by this command.
   return {runtime,authority:new ReproductionAuthorityStore(pool,config,readers,async()=>false),close:()=>pool.end()};
  });console.log(JSON.stringify({applied:result}));
 }catch(error){console.error(JSON.stringify({error:{code:error instanceof ReproductionOperatorArguments?'invalid-reproduction-operator-arguments':'reproduction-operator-unavailable'}}));process.exitCode=2;}
}
