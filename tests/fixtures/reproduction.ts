import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {canonical,digest} from '../../packages/review/engine.ts';
import {buildReviewContext} from '../../packages/reviewers/context.ts';
import {findingsFromReviewer,deduplicateFindings,type ModelFinding} from '../../packages/findings/model.ts';
import {compileFindingReproduction,type ReproductionApproval} from '../../packages/findings/reproduction.ts';
import {evalSuite} from './evals.ts';
export function reproductionFixture(image=`sha256:${'1'.repeat(64)}`,options:{source?:string;script?:string}={}){
 const baseSource="export function allowed(ns){return ns==='safe';}",headSource=options.source??'export function allowed(ns){return true;}';
 const script=options.script??"import{writeFileSync}from'node:fs';import{allowed}from'./app.mjs';writeFileSync('repro.json',JSON.stringify({schemaVersion:'v1alpha1',results:[{scenario:'namespace-bypass',status:allowed('other')?'passed':'failed'}]}));process.exitCode=allowed('other')?0:1;";
 const reviewer=JSON.parse(readFileSync(new URL('../../specs/api/fixtures/reviewer-result.json',import.meta.url),'utf8'));
 reviewer.requestId=randomUUID();reviewer.attemptId=randomUUID();
 const documents=[{kind:'source',side:'head',path:'app.mjs',content:headSource,digest:digest(headSource)}];
 reviewer.contextDigest=buildReviewContext(reviewer.subject,documents).digest;
 reviewer.response.structuredOutput={findings:[{category:'security',severity:'high',claim:'Namespace validation can be bypassed',evidence:[{side:'head',path:'app.mjs',digest:digest(headSource),startLine:1,endLine:1}]}]};
 reviewer.proposal.output=structuredClone(reviewer.response.structuredOutput);reviewer.responseDigest=digest(canonical(reviewer.response));
 const initial=deduplicateFindings(findingsFromReviewer(reviewer,reviewer.subject,documents),reviewer.subject)[0]!;
 const finding:ModelFinding={...initial,state:'reproduction-pending',version:2};
 const base={sha:finding.subject.baseSha,files:{'app.mjs':baseSource,'repro.mjs':script}},head={sha:finding.subject.headSha,files:{'app.mjs':headSource,'repro.mjs':'process.exit(0)'}};
 const suite=evalSuite({class:'adversarial',requirements:['SPEC-12.3-001'],runner:{adapter:'native',command:['node','repro.mjs'],report:'repro.json',harness:['repro.mjs'],timeoutMs:5000,maxOutputBytes:65536},scenarios:[{id:'namespace-bypass'}],trials:{count:1,passRate:1,confidenceMethod:'wilson'}},'finding-reproduction');
 const approval:ReproductionApproval={id:randomUUID(),policyDigest:digest('trusted fixture policy'),findingDigest:digest(canonical(finding)),reviewId:randomUUID(),targetSide:'head',assertionSide:'base',suite,scenarioId:'namespace-bypass',reproducedStatus:'passed',reason:'Controller approved namespace bypass assertion'};
 const policy={image},limits={maxAttempts:3,maxTrials:1,maxTimeoutMs:5000,maxOutputBytes:65536};
 const plan=compileFindingReproduction(finding,approval,base,head,policy,limits);
 return {reviewer,documents,initial,finding,base,head,approval,policy,limits,plan};
}
