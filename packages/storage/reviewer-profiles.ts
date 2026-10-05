import type {Pool,PoolClient} from 'pg';
import {canonical} from '../review/engine.ts';
import {validateReviewerProfile} from '../reviewers/profile.ts';
export class ReviewerProfileConflict extends Error {constructor(){super('reviewer-profile-conflict');}}
export class ReviewerProfileUnavailable extends Error {constructor(){super('reviewer-profile-unavailable');}}
export class ReviewerProfileRevoked extends Error {constructor(){super('reviewer-profile-revoked');}}
const fail=():never=>{throw new ReviewerProfileConflict();};
/** Operator-only registry. Put cannot replace a revision or resurrect a revoked
 * profile. Old revisions remain readable for evidence; execution uses resolve.
 * Transport authentication and provider credentials are outside this store.
 */
export class ReviewerProfileStore {
 private scope:{organizationId:string;repository:string};
 constructor(private pool:Pool,scope:{organizationId:string;repository:string}){
  if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(scope.organizationId)||typeof scope.repository!=='string'||scope.repository.length>256||!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(scope.repository))fail();
  this.scope={organizationId:scope.organizationId.toLowerCase(),repository:scope.repository};
 }
 private key(id:string,revision:string){if(typeof id!=='string'||!/^[A-Za-z0-9._-]{1,128}$/.test(id)||typeof revision!=='string'||!/^sha256:[a-f0-9]{64}$/.test(revision))fail();return [this.scope.organizationId,this.scope.repository,id,revision];}
 private async query(text:string,values:unknown[]){
  let client:PoolClient;try{client=await this.pool.connect();}catch{throw new ReviewerProfileUnavailable();}
  let broken=false;try{await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='10s'");const result=await client.query(text,values);await client.query('COMMIT');return result;}
  catch{try{await client.query('ROLLBACK');}catch{broken=true;}throw new ReviewerProfileUnavailable();}finally{client.release(broken);}
 }
 private decode(row:any){try{const valid=validateReviewerProfile(row.profile);if(valid.profile.id!==row.id||valid.revision!==row.revision)fail();return {...valid,revoked:row.revoked_at!==null};}catch{return fail();}}
 async get(id:string,revision:string){const rows=(await this.query('SELECT id,revision,profile,revoked_at FROM agentci_reviewer_profiles WHERE organization_id=$1 AND repository=$2 AND id=$3 AND revision=$4',this.key(id,revision))).rows;return rows[0]?this.decode(rows[0]):undefined;}
 async put(value:unknown){
  let valid:ReturnType<typeof validateReviewerProfile>;try{valid=validateReviewerProfile(value);}catch{return fail();}
  const {profile,revision}=valid;
  await this.query('INSERT INTO agentci_reviewer_profiles(organization_id,repository,id,revision,profile) VALUES($1,$2,$3,$4,$5) ON CONFLICT(organization_id,repository,id,revision) DO NOTHING',[...this.key(profile.id,revision),profile]);
  const stored=await this.get(profile.id,revision);if(!stored||canonical(stored.profile)!==canonical(profile))return fail();return stored;
 }
 async resolve(id:string,revision:string){const stored=await this.get(id,revision);if(!stored)return fail();if(stored.revoked)throw new ReviewerProfileRevoked();return stored;}
 async revoke(id:string,revision:string){const rows=(await this.query('UPDATE agentci_reviewer_profiles SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE organization_id=$1 AND repository=$2 AND id=$3 AND revision=$4 RETURNING id,revision,profile,revoked_at',this.key(id,revision))).rows;if(!rows[0])fail();return this.decode(rows[0]);}
}
