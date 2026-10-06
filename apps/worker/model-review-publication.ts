import type {Pool} from 'pg';
import type {Octokit} from '@octokit/rest';
import {createModelReviewPublisher,ModelReviewCheckUnavailable} from '../../packages/github/model-review-check.ts';
import {ModelReviewPublicationOutbox} from '../../packages/storage/model-review-publication-outbox.ts';
import {modelReviewPublicationSource} from '../../packages/storage/model-review-publication.ts';
import {ModelReviewReads} from '../../packages/storage/model-review-reads.ts';

/** Opt-in controller capability; does not change the released deterministic/eval
 * Checks. Durable queued work remains available while this capability is off. */
export async function initializeModelReviewCheckScheduler(pool:Pool,github:Octokit,config:{organizationId:string;repository:string;appId:number;installationId:number;publicUrl:string},env:NodeJS.ProcessEnv=process.env){
 if(env.AGENTCI_MODEL_REVIEW_CHECKS===undefined||env.AGENTCI_MODEL_REVIEW_CHECKS==='false')return null;
 if(env.AGENTCI_MODEL_REVIEW_CHECKS!=='true')throw Error('invalid-model-review-check-configuration');
 const scoped={...config,organizationId:config.organizationId.toLowerCase()};
 const outbox=new ModelReviewPublicationOutbox(pool,scoped),reads=new ModelReviewReads(pool,scoped);
 await outbox.ready();
 const publish=createModelReviewPublisher(github,modelReviewPublicationSource(pool,scoped),scoped);
 return {async tick(shouldStop:()=>boolean=()=>false){
  const counts={attempted:0,published:0,superseded:0,deferred:0};
  for(let i=0;i<10&&!shouldStop();i++){
   const claim=await outbox.claim();if(!claim)break;counts.attempted++;
   try{
    const status=await reads.status(claim.id);if(!status)throw Error();
    const outcome=await publish(status.admission.request);await outbox.acknowledge(claim,outcome);counts[outcome]++;
   }catch(error){
    // New evidence cannot bypass the deployment cooldown, including after restart.
    await outbox.defer(claim,error instanceof ModelReviewCheckUnavailable?error.retryAfterMs:undefined);counts.deferred++;
   }
  }
  return counts;
 }};
}
