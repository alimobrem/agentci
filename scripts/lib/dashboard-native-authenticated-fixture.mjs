import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {unavailableViews} from '../../apps/dashboard/lib/evidence-views.ts';

/** A source-owned queued fixture, independent of any runtime/public receipt. */
export function nativeAuthenticatedFixtureData(){
 const examples=JSON.parse(readFileSync(new URL('../../specs/api/drafts/model-review-examples.json',import.meta.url),'utf8'));
 const admission=structuredClone(examples.request),status=structuredClone(examples.statuses.queued);
 const expectedApiBody=JSON.stringify({admission,status,findings:[],views:unavailableViews(),evidence:'unavailable'});
 return {admission,status,expectedApiBody};
}
/** Recompute from trusted source; a coordinated receipt substitution cannot redefine success. */
export function nativeAuthenticatedExpectedResponse(){
 const {expectedApiBody}=nativeAuthenticatedFixtureData();
 return {sha256:createHash('sha256').update(expectedApiBody).digest('hex'),bytes:Buffer.byteLength(expectedApiBody)};
}
