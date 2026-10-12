import {randomUUID} from 'node:crypto';
/** Fixture bytes are prepared by trusted service source and published through Work GitHub.
 * PR copies are read as Git objects only, never executed on this controller host. */
export const CUSTOMER_BASE_SOURCE="export function allowed(ns){return ns==='safe';}";
export const CUSTOMER_SEEDED_SOURCE='export function allowed(ns){return true;}';
export const CUSTOMER_TRUSTED_HARNESS="import{writeFileSync}from'node:fs';import{allowed}from'./app.mjs';if(process.argv.includes('--recovery-pause'))await new Promise(r=>setTimeout(r,10000));writeFileSync('repro.json',JSON.stringify({schemaVersion:'v1alpha1',results:[{scenario:'namespace-bypass',status:allowed('other')?'passed':'failed'}]}));process.exitCode=allowed('other')?0:1;";
export function customerFixtureFiles(kind){if(!['base','seeded','fixed'].includes(kind))throw Error('Unknown customer fixture');return {'app.mjs':kind==='seeded'?CUSTOMER_SEEDED_SOURCE:CUSTOMER_BASE_SOURCE,'repro.mjs':kind==='base'?CUSTOMER_TRUSTED_HARNESS:'process.exit(0);'};}
/** Uses production compiler supplied from the already hash-verified installed package. */
export function compileCustomerApproval({current,admission,base,head,runnerImage,recovery=false},production){
 const {canonical,digest,compileFindingReproduction}=production;
 if(admission?.subject?.repository!=='alimobrem/agentci-onboarding-demo'||current.subject.repository!==admission.subject.repository||canonical(current.subject)!==canonical(admission.subject)||!['deduplicated','unconfirmed'].includes(current.state)||base.sha!==admission.subject.baseSha||head.sha!==admission.subject.headSha||base.files['app.mjs']!==CUSTOMER_BASE_SOURCE||base.files['repro.mjs']!==CUSTOMER_TRUSTED_HARNESS||![CUSTOMER_SEEDED_SOURCE,CUSTOMER_BASE_SOURCE].includes(head.files['app.mjs']))throw Error('Unapproved customer fixture or current finding');
 const queued={...structuredClone(current),state:'reproduction-pending',version:current.version+1,disposition:null};
 const suite={apiVersion:'agentci.io/v1alpha1',kind:'EvalSuite',metadata:{id:'customer-namespace-bypass'},spec:{class:'adversarial',requirements:['SPEC-12.3-001'],impact:{categories:['prompt'],include:['app.mjs']},runner:{adapter:'native',command:['node','repro.mjs',...(recovery?['--recovery-pause']:[])],report:'repro.json',harness:['repro.mjs'],timeoutMs:15000,maxOutputBytes:65536},scenarios:[{id:'namespace-bypass'}],trials:{count:recovery?2:1,passRate:1,confidenceMethod:'wilson'}}};
 const approval={id:randomUUID(),policyDigest:digest('Owner-approved bounded demo namespace-bypass fixture assertion'),findingDigest:digest(canonical(queued)),reviewId:admission.id,targetSide:'head',assertionSide:'base',suite,scenarioId:'namespace-bypass',reproducedStatus:'passed',reason:'Trusted controller approval for the exact public namespace-bypass fixture; synthetic proposal alone is advisory'};
 const plan=compileFindingReproduction(queued,approval,base,head,{image:runnerImage,engine:'docker'},{maxAttempts:3,maxTrials:recovery?2:1,maxTimeoutMs:15000,maxOutputBytes:65536});
 return {current,plan,reference:{planId:plan.id,planDigest:digest(canonical(plan)),findingId:current.id,findingVersion:current.version,findingDigest:digest(canonical(current)),enabled:true,expiresAt:new Date(Date.now()+60*60*1000).toISOString()}};
}
export function customerAuthorityDocuments(scope,approved,revision,production){
 if(scope.repository!=='alimobrem/agentci-onboarding-demo'||!approved.length)throw Error('Explicit bounded customer authority required');
 const {canonical,digest}=production,catalog={schemaVersion:'v1alpha1',...scope,plans:approved.map(value=>({digest:digest(canonical(value.plan)),plan:value.plan}))};
 const config={schemaVersion:'v1alpha1',...scope,revision,approvals:approved.map(value=>value.reference)};
 return {catalog,catalogDigest:digest(canonical(catalog)),config,configDigest:digest(canonical(config))};
}
