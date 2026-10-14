import type {ReviewAdmissionRequest} from 'agentci/client';
import {retainedFindingFixture} from './retained-finding';
import {canonical,digest} from '../../../../packages/review/engine.ts';
import {createFindingTransitions} from '../../../../packages/findings/lifecycle.ts';
import {nameUuid} from '../../../../packages/evals/request-id.ts';
import {modelReviewExportFrame,ModelReviewExportVerifier} from '../../../../packages/reviewers/export.ts';
import {validateFindingHistoryRecord} from '../../../../packages/findings/history.ts';
/** Synthetic complete protocol fixture, validated by the actual domain verifier. */
export async function retainedProtocol(request:ReviewAdmissionRequest){
 const retained=retainedFindingFixture(request,['Unsupported authorization assertion'],true),first=retained.records[0]!;
 const finding=(await createFindingTransitions(async()=>{throw Error('unused');})(first.event.finding,{type:'queue'},1)).finding;
 const event={schemaVersion:'v1alpha1',operationId:'55555555-5555-4555-8555-555555555555',inputDigest:digest(canonical({id:finding.id,subject:request.subject,action:{type:'queue'},expectedVersion:1})),previousDigest:first.digest,action:{type:'queue'},receipt:null,finding};
 const second=validateFindingHistoryRecord({event,digest:digest(canonical(event))},request.subject);
 const snapshot={schemaVersion:'v1alpha1' as const,review:retained.status as any,configuredRoles:[{role:'security',requestId:nameUuid(request.id,`agentci:reviewer:v1:${request.profile.revision}:security`)}],retainedRoles:[{requestId:retained.result.requestId,digest:digest(canonical(retained.result))}],missingRoleIds:[],findings:[{id:finding.id,throughVersion:2,lastDigest:second.digest}],reviewerCount:1,eventCount:2};
 const header={...snapshot,snapshotDigest:digest(canonical(snapshot))},frames=[modelReviewExportFrame({type:'header',data:header},0,'sha256:'+'0'.repeat(64))];
 const append=(item:Parameters<typeof modelReviewExportFrame>[0])=>frames.push(modelReviewExportFrame(item,frames.length,frames.at(-1)!.digest));
 append({type:'reviewer',data:{result:retained.result,digest:digest(canonical(retained.result))}});append({type:'finding',data:first});append({type:'finding',data:second});append({type:'end',data:{snapshotDigest:header.snapshotDigest,reviewerCount:1,eventCount:2,lastContentDigest:frames.at(-1)!.digest}});
 const verifier=new ModelReviewExportVerifier(request);for(const frame of frames)await verifier.push(frame);const certificate=verifier.finish();
 const alternateFirst=structuredClone(first);alternateFirst.event.operationId='66666666-6666-4666-8666-666666666666';alternateFirst.digest=digest(canonical(alternateFirst.event));const alternateSecond=structuredClone(second);alternateSecond.event.previousDigest=alternateFirst.digest;alternateSecond.digest=digest(canonical(alternateSecond.event));
 const manifest={schemaVersion:'v1alpha1',reviewId:request.id,summaryDigest:retained.status.summary.digest,items:[{id:finding.id,version:1,digest:first.digest}],nextCursor:null};
 const page=(later:boolean)=>({schemaVersion:'v1alpha1',reviewId:request.id,findingId:finding.id,throughVersion:2,items:[later?second:first],nextCursor:later?null:'fixture_cursor'});
 return {...retained,first,second,alternateFirst,alternateSecond,manifest,page,frames,certificate,stream:frames.map(f=>JSON.stringify(f)+'\n').join('')};
}
