import {readFileSync} from 'node:fs';
import {canonical,digest} from '../../../../packages/review/engine.ts';
import {buildReviewContext} from '../../../../packages/reviewers/context.ts';
import {findingsFromReviewer,deduplicateFindings} from '../../../../packages/findings/model.ts';
import {validateFindingHistoryRecord} from '../../../../packages/findings/history.ts';
import type {ReviewAdmissionRequest} from 'agentci/client';
/** Synthetic domain-validated retained records; no execution receipt or live provider claim. */
export function retainedFindingFixture(request:ReviewAdmissionRequest,claims=['Unsupported authorization assertion']){
 const result=JSON.parse(readFileSync(new URL('../../../../specs/api/fixtures/reviewer-result.json',import.meta.url),'utf8'));result.subject=request.subject;
 const docs=[{kind:'source',side:'head',path:'app.ts',content:'first\nsecond',digest:digest('first\nsecond')}];result.contextDigest=buildReviewContext(result.subject,docs).digest;
 result.response.structuredOutput={findings:claims.map(claim=>({category:'security',severity:'high',claim,evidence:[{side:'head',path:'app.ts',digest:docs[0]!.digest,startLine:1,endLine:2}]}))};result.proposal.output=structuredClone(result.response.structuredOutput);result.responseDigest=digest(canonical(result.response));
 const records=deduplicateFindings(findingsFromReviewer(result,result.subject,docs),result.subject).map(finding=>{const event={schemaVersion:'v1alpha1',operationId:'44444444-4444-4444-8444-444444444444',inputDigest:digest(canonical({type:'create',finding})),previousDigest:null,action:{type:'create'},receipt:null,finding};return validateFindingHistoryRecord({event,digest:digest(canonical(event))},request.subject);}).sort((a,b)=>a.event.finding.id.localeCompare(b.event.finding.id));
 const summary={schemaVersion:'v1alpha1',admissionId:request.id,admissionDigest:digest(canonical(request)),profileRevision:request.profile.revision,contextDigest:result.contextDigest,mode:'synthetic',coverage:{selectedFiles:1,configuredRoles:1,completedRoles:1,wholeRepository:false},roles:[{requestId:result.requestId,role:'security',digest:digest(canonical(result)),status:'completed'}],findings:records.map(record=>({id:record.event.finding.id,digest:record.digest}))};
 const summaryDigest=digest(canonical(summary));return {records,status:{schemaVersion:'v1alpha1',admission:{request,digest:digest(canonical(request))},execution:{state:'completed',cancelRequested:false,terminalDigest:summaryDigest},summary:{summary,digest:summaryDigest}},page:{schemaVersion:'v1alpha1',reviewId:request.id,summaryDigest,items:records.map(record=>({id:record.event.finding.id,version:1,digest:record.digest})),nextCursor:null}};
}
