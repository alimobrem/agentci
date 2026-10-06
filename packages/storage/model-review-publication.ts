import type {Pool} from 'pg';
import {canonical} from '../review/engine.ts';
import type {ReviewSubject} from '../reviewers/context.ts';
import type {ModelReviewCheckSource} from '../github/model-review-check.ts';
import {ModelReviewReads} from './model-review-reads.ts';
import {Store} from './postgres.ts';

/** Shared controller lock plus fresh scoped reads. The lock covers GitHub writes,
 * but is not a distributed transaction with GitHub or an external writer fence. */
export function modelReviewPublicationSource(pool:Pool,scope:{organizationId:string;repository:string}):ModelReviewCheckSource{
 const store=new Store(pool,scope.organizationId,scope.repository),reads=new ModelReviewReads(pool,scope);
 return {
  withPublicationLock:(key,operation)=>store.withPublicationLock(key,operation),
  async olderIds(subject:ReviewSubject,ids:string[],thanId:string){
   if(subject.organizationId!==scope.organizationId||subject.repository!==scope.repository)throw Error('model-review-publication-scope');
   if(ids.length>1000||ids.some(id=>!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)))throw Error('model-review-publication-inventory');
   if(!ids.length)return [];
   const result=await pool.query(`SELECT older.id FROM agentci_review_admissions older
    JOIN agentci_review_admissions newer USING(organization_id,repository)
    WHERE older.organization_id=$1 AND older.repository=$2 AND older.id=ANY($3::uuid[]) AND newer.id=$4
    AND older.request->'subject'=$5::jsonb AND newer.request->'subject'=$5::jsonb
    AND (older.created_at,older.id)<(newer.created_at,newer.id)`,[scope.organizationId,scope.repository,ids,thanId,canonical(subject)]);
   return result.rows.map(row=>row.id as string);
  },
  async latest(subject:ReviewSubject){
   if(subject.organizationId!==scope.organizationId||subject.repository!==scope.repository)throw Error('model-review-publication-scope');
   const result=await pool.query(`SELECT id FROM agentci_review_admissions
    WHERE organization_id=$1 AND repository=$2 AND request->'subject'=$3::jsonb
    ORDER BY created_at DESC,id DESC LIMIT 1`,[scope.organizationId,scope.repository,canonical(subject)]);
   if(!result.rows[0])return undefined;
   return reads.status(result.rows[0].id);
  },
 };
}
