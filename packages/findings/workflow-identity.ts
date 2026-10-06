import {canonical} from '../review/engine.ts';
import {nameUuid} from '../evals/request-id.ts';
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
/** Controller/activity-side identity derivation. Compute before dispatch/staging;
 * do not import Node crypto into the Temporal workflow sandbox. Pass the retained
 * identities to workflows, keeping their source-free history deterministic. */
export function reproductionWorkflowId(scope:{organizationId:string;repository:string},planId:string,kind:'parent'|'unit'|'cleanup'='parent',unitId?:string):string{
 if(!scope||!uuid(scope.organizationId)||typeof scope.repository!=='string'||scope.repository.length>256||! /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(scope.repository)||!uuid(planId)||!['parent','unit','cleanup'].includes(kind)||(kind==='parent'?unitId!==undefined:!uuid(unitId)))throw Error('invalid-reproduction-workflow-identity');
 const organizationId=scope.organizationId.toLowerCase();
 const id=nameUuid(organizationId,canonical({schemaVersion:'agentci:reproduction-workflow:v1',organizationId,repository:scope.repository,planId:planId.toLowerCase(),kind,unitId:unitId?.toLowerCase()??null}));
 return `agentci:repro:v1:${kind}:${id}`;
}
