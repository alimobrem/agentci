import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { canonical, digest } from '../review/engine.ts';
import type { ReviewJob } from '../github/webhook.ts';
import type { Analysis } from '../review/types.ts';
import { validateDocument } from '../schemas/index.ts';
import { VERSION } from '../version.ts';

export interface EvidenceRecord { id: string; digest: string; evidence: any; analysis: Analysis }
export class DeliveryConflict extends Error {}
export class Store {
  constructor(public pool: Pool, public organizationId: string, public repository: string) {}
  async ready() {
    await this.pool.query('INSERT INTO agentci_scope(id,organization_id,repository) VALUES(1,$1,$2) ON CONFLICT DO NOTHING', [this.organizationId, this.repository]);
    const row = (await this.pool.query('SELECT organization_id,repository FROM agentci_scope WHERE id=1')).rows[0];
    if (row?.organization_id !== this.organizationId || row?.repository !== this.repository) throw new Error('Database belongs to another deployment scope');
  }
  async recordDelivery(id: string, hash: string, job: ReviewJob | null): Promise<'accepted' | 'duplicate'> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query('INSERT INTO agentci_deliveries(id, digest) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id', [id, hash]);
      if (!inserted.rowCount) {
        const row = await client.query('SELECT digest FROM agentci_deliveries WHERE id=$1', [id]);
        if (row.rows[0]?.digest !== hash) throw new DeliveryConflict('Delivery ID reused with different bytes');
        await client.query('COMMIT'); return 'duplicate';
      }
      if (job) await client.query('INSERT INTO agentci_jobs(id,payload) VALUES($1,$2)', [id, job]);
      await client.query('COMMIT'); return 'accepted';
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  async pending(): Promise<{ id: string; payload: ReviewJob }[]> {
    // A short dispatch lease survives dispatcher death. Temporal workflow IDs fence duplicate starts.
    const result = await this.pool.query(`UPDATE agentci_jobs SET lease_until=now()+interval '30 seconds'
      WHERE id IN (SELECT id FROM agentci_jobs WHERE dispatched_at IS NULL AND (lease_until IS NULL OR lease_until<now()) ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED)
      RETURNING id,payload`);
    return result.rows;
  }
  async dispatched(id: string) { await this.pool.query('UPDATE agentci_jobs SET dispatched_at=now() WHERE id=$1', [id]); }
  async withPublicationLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    let locked = false, destroyed = false;
    try {
      const result = await client.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired', [key]);
      if (!result.rows[0]?.acquired) throw new Error('Publication is busy; retry');
      locked = true;
      return await operation();
    } finally {
      if (locked) {
        try { await client.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [key]); }
        catch { client.release(true); destroyed = true; }
      }
      if (!destroyed) client.release();
    }
  }
  async save(analysis: Analysis, pullRequest: number): Promise<EvidenceRecord> {
    if (analysis.repository !== this.repository) throw new Error('Repository access mismatch');
    if (!Number.isSafeInteger(pullRequest) || pullRequest < 1) throw new Error('Invalid PR number');
    const hash = digest(canonical(analysis));
    const id = randomUUID();
    const evidence = { schemaVersion: 'v1alpha1', id, organizationId: this.organizationId, kind: 'PullRequest', version: 1,
      createdAt: new Date().toISOString(), subject: { gitSha: analysis.headSha, pullRequest },
      claim: { sourceType: 'static-analysis', confidence: 1, verificationStatus: 'verified', producer: { name: 'agentci', version: VERSION } },
      artifacts: [{ uri: `urn:agentci:analysis:${id}`, digest: hash, mediaType: 'application/json' }], edges: [] };
    if (!validateDocument('evidence', evidence).valid) throw new Error('Invalid evidence record');
    const inserted = await this.pool.query(`INSERT INTO agentci_reviews(id,repository,pull_request,base_sha,head_sha,digest,evidence,analysis) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT(repository,pull_request,base_sha,head_sha) DO NOTHING RETURNING id,digest,evidence,analysis`, [id, analysis.repository, pullRequest, analysis.baseSha, analysis.headSha, hash, evidence, analysis]);
    const record = inserted.rows[0] ?? (await this.pool.query('SELECT id,digest,evidence,analysis FROM agentci_reviews WHERE repository=$1 AND pull_request=$2 AND base_sha=$3 AND head_sha=$4', [analysis.repository, pullRequest, analysis.baseSha, analysis.headSha])).rows[0];
    if (record.digest !== hash) throw new Error('Immutable evidence conflict');
    return record;
  }
  async evidence(id: string): Promise<EvidenceRecord | undefined> {
    const result = await this.pool.query('SELECT id,digest,evidence,analysis FROM agentci_reviews WHERE id=$1 AND repository=$2', [id, this.repository]);
    const record = result.rows[0];
    if (record && (record.evidence.organizationId !== this.organizationId || digest(canonical(record.analysis)) !== record.digest)) throw new Error('Evidence integrity/scope mismatch');
    return record;
  }
}
