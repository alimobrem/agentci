import type {Pool} from 'pg';
import {captureIntent,validateIntentRecord,type IntentRecord} from '../review/intent.ts';
import {canonical} from '../review/engine.ts';
import type {Snapshot} from '../review/types.ts';
import type {EvidenceRecord} from './postgres.ts';
export async function retainIntent(pool:Pool,organizationId:string,repository:string,evidence:EvidenceRecord,head:Snapshot):Promise<IntentRecord|undefined>{
 const subject={organizationId,repository,pullRequest:evidence.evidence.subject.pullRequest,baseSha:evidence.analysis.baseSha,headSha:evidence.analysis.headSha};
 if(evidence.evidence.organizationId!==organizationId||evidence.analysis.repository!==repository)throw Error('intent-identity-mismatch');
 const record=captureIntent(evidence.id,subject,head);if(!record)return;
 const result=await pool.query('INSERT INTO agentci_review_intents(review_id,organization_id,repository,digest,record) VALUES($1,$2,$3,$4,$5) ON CONFLICT(review_id) DO NOTHING RETURNING record,digest',[record.reviewId,organizationId,repository,record.digest,record]);
 const row=result.rows[0]??(await pool.query('SELECT record,digest FROM agentci_review_intents WHERE review_id=$1 AND organization_id=$2 AND repository=$3',[record.reviewId,organizationId,repository])).rows[0];
 const retained=validateIntentRecord(row?.record,{...subject,reviewId:evidence.id,digest:row?.digest});
 // Retrying after a software upgrade preserves the original capture producer/version and digest.
 // Every immutable source byte and declaration value must still match; no replacement occurs.
 if(retained.summary!==record.summary||retained.classification!==record.classification||canonical(retained.source)!==canonical(record.source))throw Error('Immutable intent conflict');
 return retained;
}
