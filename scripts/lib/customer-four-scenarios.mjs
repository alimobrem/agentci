/** Trusted orchestrator. Session methods execute real installed production services;
 * callers retain public observations and separate physical/owned-cleanup evidence. */
export async function runCustomerFourScenarios(session,onProgress=async()=>{},{createStagedSession}={}){
 const evidence={schemaVersion:1,repository:session.scope.repository,mode:'temporary-synthetic-customer-demo',scenarios:[],customerEndpointAcceptance:'unverified',M3MilestoneAcceptance:'pending'};
 await session.initialize();await onProgress(evidence);
 // Observe the unsupported proposal before granting any assertion approval.
 const unsupported=await session.review('seeded'),unsupportedRejection=await session.unsupported(unsupported);evidence.scenarios.push({id:'unsupported-claim',public:await session.observe(unsupported,'unsupported-claim'),approval:'none',physicalExecution:'not-approved',rejection:unsupportedRejection});await onProgress(evidence);
 const seeded=await session.review('seeded'),seededApproval=await session.approve(seeded),seededReference=await session.reserve(seeded,seededApproval);await session.startConsumer();const seededStatus=await session.settled(seeded,seededReference);
 if(seededStatus.receipt?.value.outcome!=='reproduced')throw Error('Seeded fixture was not physically reproduced');
 const originalReceipt=JSON.stringify(seededStatus.receipt);evidence.scenarios.push({id:'seeded-defect',public:await session.observe(seeded,'seeded-defect',seededReference),physical:await session.physical(seededApproval,seededReference,seededStatus)});await onProgress(evidence);
 const fixed=await session.review('fixed'),fixedApproval=await session.approve(fixed),fixedReference=await session.reserve(fixed,fixedApproval);await session.startConsumer();const fixedStatus=await session.settled(fixed,fixedReference);
 if(fixedStatus.receipt?.value.outcome!=='not-reproduced')throw Error('Fixed fixture did not produce actual non-reproduction');
 evidence.scenarios.push({id:'fixed-result',public:await session.observe(fixed,'fixed-result',fixedReference),physical:await session.physical(fixedApproval,fixedReference,fixedStatus)});await onProgress(evidence);
 // Reserve/cancel through public routes while worker is drained: no stage/receipt is possible.
 const cancelled=await session.review('fixed'),cancelApproval=await session.approve(cancelled),cancelReference=await session.reserve(cancelled,cancelApproval);await session.client.cancelReproduction(cancelled.admission,cancelReference);await session.startConsumer();const cancelStatus=await session.settled(cancelled,cancelReference);
 if(cancelStatus.receipt!==null||!cancelStatus.nonExecution||cancelStatus.settlement?.kind!=='never-staged')throw Error('Never-staged cancellation fabricated execution');
 const neverStaged=await session.observe(cancelled,'failure-restart-recovery',cancelReference);evidence.failureProgress={neverStaged};await onProgress(evidence);
 // A retained first trial plus active second trial establishes a real death/recovery boundary.
 const recoveryReview=await session.review('fixed'),recoveryApproval=await session.approve(recoveryReview,{recovery:true}),recoveryReference=await session.reserve(recoveryReview,recoveryApproval);await session.startConsumer();const killed=await session.killAndRecover(recoveryReference);evidence.failureProgress.processDeath=killed;await onProgress(evidence);const recovered=await session.settled(recoveryReview,recoveryReference);
 const recoveryPhysical=await session.physical(recoveryApproval,recoveryReference,recovered),recovery=await session.verifyCheckpoint(killed,recoveryPhysical),recoveryPublic=await session.observe(recoveryReview,'failure-restart-recovery',recoveryReference);evidence.failureProgress.recovery={public:recoveryPublic,physical:recoveryPhysical,processDeath:recovery};await onProgress(evidence);
 // Cancellation after a real runner is observed must retain actual execution/cleanup facts.
 if(typeof createStagedSession!=='function')throw Error('Separately owned staged-cancellation session required');
 const staged=await createStagedSession();
 if(staged.scope.organizationId===session.scope.organizationId||staged.scope.repository!==session.scope.repository||staged.namespace===session.namespace)throw Error('Distinct customer staged scope and namespace required');
 await staged.initialize();
 const activeReview=await staged.review('fixed');
 if(session.production.canonical({...activeReview.admission.subject,organizationId:session.scope.organizationId})!==session.production.canonical(fixed.admission.subject))throw Error('Staged cancellation changed approved fixed fixture');
 const activeApproval=await staged.approve(activeReview,{recovery:true}),activeReference=await staged.reserve(activeReview,activeApproval);await staged.startConsumer();const active=await staged.active(activeReference);await staged.client.cancelReproduction(activeReview.admission,activeReference);const activeStatus=await staged.settled(activeReview,activeReference);
 if(!activeStatus.receipt||activeStatus.nonExecution)throw Error('Staged cancellation lost actual execution evidence');
 const activePhysical=await staged.physical(activeApproval,activeReference,activeStatus);
 evidence.scenarios.push({id:'failure-restart-recovery',neverStaged,recovery:{public:recoveryPublic,physical:recoveryPhysical,processDeath:recovery},stagedCancellation:{scope:staged.scope,namespace:staged.namespace,active,public:await staged.observe(activeReview,'failure-restart-recovery',activeReference),physical:activePhysical}});delete evidence.failureProgress;await onProgress(evidence);
 if(JSON.stringify((await session.client.reproductionStatus(seeded.admission,seededReference)).receipt)!==originalReceipt)throw Error('Fixed or recovery observation changed original confirmed receipt');
 evidence.originalConfirmedReceiptImmutable=true;await onProgress(evidence);return evidence;
}
