import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import type {ReviewJob} from '../github/webhook.ts';
export class ReviewRecoveryLeaseLost extends Error{}
export interface ReviewAttempt {id:string;workflowId:string;runId:string;evalTaskQueue:string;token:string;job:ReviewJob}
/** Controller-only tracking; SQL leases fence recovery and never replace immutable review input. */
export class ReviewAttempts {
  constructor(private pool:Pool,private organizationId:string,private repository:string){}
  private scope="j.payload->>'repository'=$2 AND EXISTS(SELECT 1 FROM agentci_scope s WHERE s.id=1 AND s.repository=$2 AND s.organization_id=$3::uuid)";
  async ready(){await this.pool.query('SELECT id,workflow_id,run_id,eval_task_queue,lease_token,lease_until,closed_at,terminal_status FROM agentci_review_attempts LIMIT 0');}
  async track(id:string,workflowId:string,evalTaskQueue:string){
    const row=(await this.pool.query(`INSERT INTO agentci_review_attempts(id,workflow_id,eval_task_queue)
      SELECT j.id,$4,$5 FROM agentci_jobs j WHERE j.id=$1 AND ${this.scope}
      ON CONFLICT(id) DO NOTHING RETURNING id`,[id,this.repository,this.organizationId,workflowId,evalTaskQueue])).rows[0];
    if(!row){const existing=(await this.pool.query(`SELECT a.workflow_id,a.eval_task_queue FROM agentci_review_attempts a JOIN agentci_jobs j ON j.id=a.id WHERE a.id=$1 AND ${this.scope}`,[id,this.repository,this.organizationId])).rows[0];if(!existing||existing.workflow_id!==workflowId||existing.eval_task_queue!==evalTaskQueue)throw new Error('Review tracking identity conflict');}
  }
  async bindRun(id:string,runId:string){
    const row=(await this.pool.query(`UPDATE agentci_review_attempts a SET run_id=$4 FROM agentci_jobs j WHERE a.id=j.id AND a.id=$1 AND ${this.scope} AND (a.run_id IS NULL OR a.run_id=$4::uuid) AND a.closed_at IS NULL RETURNING a.id`,[id,this.repository,this.organizationId,runId])).rows[0];
    if(!row)throw new Error('Review run identity conflict');
  }
  async claim():Promise<ReviewAttempt|undefined>{
    const token=randomUUID(),rows=(await this.pool.query(`UPDATE agentci_review_attempts a SET lease_token=$4,lease_until=clock_timestamp()+interval '120 seconds'
      WHERE $1::uuid IS NULL AND a.id IN(SELECT a.id FROM agentci_review_attempts a JOIN agentci_jobs j ON j.id=a.id WHERE a.closed_at IS NULL AND a.run_id IS NOT NULL AND j.dispatched_at IS NOT NULL AND (a.lease_until IS NULL OR a.lease_until<clock_timestamp()) AND ${this.scope} ORDER BY a.created_at LIMIT 1 FOR UPDATE OF a SKIP LOCKED)
      RETURNING a.id,a.workflow_id,a.run_id,a.eval_task_queue`,[null,this.repository,this.organizationId,token])).rows;
    const row=rows[0];if(!row)return undefined;
    const job=(await this.pool.query('SELECT payload FROM agentci_jobs WHERE id=$1',[row.id])).rows[0].payload as ReviewJob;
    return {id:row.id,workflowId:row.workflow_id,runId:row.run_id,evalTaskQueue:row.eval_task_queue,token,job};
  }
  async renew(entry:ReviewAttempt){await this.write(entry,"lease_until=clock_timestamp()+interval '120 seconds'");}
  async release(entry:ReviewAttempt){await this.write(entry,"lease_token=NULL,lease_until=clock_timestamp()+interval '10 seconds'");}
  async close(entry:ReviewAttempt,status:string){await this.write(entry,'closed_at=clock_timestamp(),terminal_status=$5,lease_token=NULL,lease_until=NULL',[status]);}
  private async write(entry:ReviewAttempt,changes:string,extra:unknown[]=[]){
    const r=await this.pool.query(`UPDATE agentci_review_attempts a SET ${changes} FROM agentci_jobs j WHERE a.id=j.id AND a.id=$1 AND ${this.scope} AND a.lease_token=$4 AND a.lease_until>clock_timestamp() AND a.closed_at IS NULL`,[entry.id,this.repository,this.organizationId,entry.token,...extra]);if(!r.rowCount)throw new ReviewRecoveryLeaseLost('Review recovery lease lost');
  }
}
