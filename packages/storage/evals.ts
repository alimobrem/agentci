import {UnsupportedEvalSource,verifyReproductionEvalInputs} from '../evals/source.ts';
import {Pool,type PoolClient} from 'pg';
import {randomUUID} from 'node:crypto';
import {canonical,digest} from '../review/engine.ts';
import type {Snapshot} from '../review/types.ts';
import {validateEvalSuite,validateEvalRun,safeEvalPath,type EvalSuite,type EvalRun} from '../evals/contracts.ts';
import {projectEvalInputs,snapshotInputs,protectedEvalInput,validateRunnerPolicy} from '../evals/runner.ts';
import {baselineHarness} from '../evals/harness.ts';
import {validateTrialCheckpoint,type TrialCheckpoint} from '../evals/execution.ts';
import {aggregateScenario,combinedStatus} from '../evals/statistics.ts';
import type {SuiteChange} from '../evals/plan.ts';
import {createEvalComparison,comparisonRecord,type ComparisonRecord,type ComparisonUnit} from '../evals/comparison.ts';
import {ComparisonAccumulator,type ExportHeader,type ExportItem} from '../evals/export.ts';

type Side='base'|'head';
export type RunnerIdentity={runnerImage:string;runnerProvider?:never}|{runnerProvider:{id:string;revision:string};runnerImage?:never};
export interface EvalUnitDefinition {suite:EvalSuite;side:Side;assertionSide:Side;model?:string;runner:RunnerIdentity;executionLimits?:{engine:'docker'|'podman';memoryMb:number;cpus:number;pids:number;maxTrials:number}}
export interface EvalPlan {suiteChanges:SuiteChange[];coverageGaps:string[];selectionGaps:string[]}
type Inputs=Record<Side,{snapshot:Snapshot;omitted:string[]}>;
export interface EvalUnit {id:string;jobId:string;definition:EvalUnitDefinition;inputs:Inputs;status:string;cancelRequested:boolean;result?:EvalRun}
export class EvalLeaseLost extends Error {}
export class ImmutableEvalConflict extends Error {}
const uuid=(value:string)=>/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
export function definition(value:EvalUnitDefinition):EvalUnitDefinition {
  if(!value||Object.keys(value).some(k=>!['suite','side','assertionSide','model','runner','executionLimits'].includes(k))||!['base','head'].includes(value.side)||!['base','head'].includes(value.assertionSide))throw new Error('Invalid eval unit definition');
  const suite=validateEvalSuite(value.suite),runner=value.runner;
  if(suite.spec.models?.length&&!value.model||value.model!==undefined&&!suite.spec.models?.includes(value.model))throw new Error('Invalid unit model variant');
  if(!runner||typeof runner!=='object')throw new Error('Invalid runner identity');
  if(Object.keys(runner).join(',')==='runnerImage'){
    validateRunnerPolicy({image:runner.runnerImage!});if(suite.spec.runner.adapter==='http')throw new Error('HTTP unit requires provider provenance');
  }else if(Object.keys(runner).join(',')==='runnerProvider'){
    const provider=runner.runnerProvider;
    if(!provider||Object.keys(provider).some(k=>!['id','revision'].includes(k))||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(provider.id)||!/^sha256:[a-f0-9]{64}$/.test(provider.revision)||suite.spec.runner.adapter!=='http'||suite.spec.runner.provider!==provider.id)throw new Error('Invalid HTTP unit provenance');
  }else throw new Error('Unit requires exactly one runner identity');
  if(value.executionLimits){
    const cap=value.executionLimits;
    if(!runner.runnerImage||Object.keys(cap).sort().join(',')!=='cpus,engine,maxTrials,memoryMb,pids'||!Number.isSafeInteger(cap.maxTrials)||cap.maxTrials<suite.spec.trials.count||cap.maxTrials>1000)throw new Error('Invalid unit execution limits');
    validateRunnerPolicy({image:runner.runnerImage,engine:cap.engine,memoryMb:cap.memoryMb,cpus:cap.cpus,pids:cap.pids});
  }
  return structuredClone({...value,suite});
}
export function validateInputs(inputs:Inputs):void {
  for(const side of ['base','head'] as const){
    snapshotInputs(inputs[side].snapshot);
    const omitted=inputs[side].omitted;
    if(!Array.isArray(omitted)||omitted.length>10000||new Set(omitted).size!==omitted.length||omitted.some(path=>typeof path!=='string'||!safeEvalPath(path)||!protectedEvalInput(path)||Object.hasOwn(inputs[side].snapshot.files,path)))throw new Error('Invalid omitted eval input provenance');
  }
}
const leaseSeconds=(seconds:number)=>{if(!Number.isSafeInteger(seconds)||seconds<1||seconds>300)throw new Error('Invalid eval lease duration');return seconds;};

/** Storage for the credential-free evaluator. Every query is constrained to this deployment's scope. */
export class EvalStore {
  constructor(public pool:Pool,public organizationId:string,public repository:string) {}
  async ready():Promise<void> {
    const row=(await this.pool.query('SELECT organization_id,repository FROM agentci_scope WHERE id=1')).rows[0];
    if(row?.organization_id!==this.organizationId.toLowerCase()||row?.repository!==this.repository)throw new Error('Eval database belongs to another deployment scope');
    await this.pool.query('SELECT id FROM agentci_eval_jobs LIMIT 0');
    await this.pool.query('SELECT id FROM agentci_eval_units LIMIT 0');
    await this.pool.query('SELECT unit_id FROM agentci_eval_trials LIMIT 0');
  }
  private scope='j.repository=$2 AND EXISTS(SELECT 1 FROM agentci_scope s WHERE s.id=1 AND s.repository=$2 AND s.organization_id=$3::uuid)';
  async stage(reviewId:string,attemptKey:string,base:Snapshot,head:Snapshot,units:EvalUnitDefinition[],plan:EvalPlan):Promise<{id:string;unitIds:string[]}> {
    await this.ready();
    if(!uuid(reviewId)||!uuid(attemptKey)||base.sha===head.sha||units.length>10000)throw new Error('Invalid eval job identity or unit count');
    if(!plan||Object.keys(plan).some(k=>!['suiteChanges','coverageGaps','selectionGaps'].includes(k))||!['suiteChanges','coverageGaps','selectionGaps'].every(k=>Array.isArray(plan[k as keyof EvalPlan])))throw new Error('Invalid eval plan');
    const definitions=units.map(definition),keys=definitions.map(u=>`${u.suite.metadata.id}\0${u.model??''}\0${u.side}`);
    if(new Set(keys).size!==keys.length)throw new Error('Duplicate eval unit');
    if(Buffer.byteLength(JSON.stringify({definitions,plan}))>16*1024*1024)throw new Error('Eval plan exceeds storage limit');
    for(const unit of definitions){
      const assertions=unit.assertionSide==='base'?base:head,subject=unit.side==='base'?base:head;
      const harness=baselineHarness(unit.suite,assertions,subject),projected=projectEvalInputs(harness.snapshot);
      if(harness.paths.some(path=>projected.omitted.includes(path)))throw new Error('Baseline harness includes a protected input');
    }
    const b=projectEvalInputs(base),h=projectEvalInputs(head),inputs:Inputs={base:{snapshot:b.snapshot,omitted:b.omitted},head:{snapshot:h.snapshot,omitted:h.omitted}};
    const storedPlan={...structuredClone(plan),units:definitions},client=await this.pool.connect();
    try{
      await client.query('BEGIN');
      const review=(await client.query('SELECT pull_request,base_sha,head_sha,digest,analysis FROM agentci_reviews WHERE id=$1 AND repository=$2 AND (evidence->>\'organizationId\')::uuid=$3::uuid',[reviewId,this.repository,this.organizationId])).rows[0];
      if(!review||review.base_sha!==base.sha||review.head_sha!==head.sha||digest(canonical(review.analysis))!==review.digest)throw new Error('Eval job requires matching immutable review evidence');
      const payload={reviewId,attemptKey,repository:this.repository,pullRequest:review.pull_request,inputs,plan:storedPlan},hash=digest(canonical(payload)),id=randomUUID();
      const inserted=await client.query(`INSERT INTO agentci_eval_jobs(id,review_id,attempt_key,repository,pull_request,base_sha,head_sha,digest,inputs,plan)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(review_id,attempt_key) DO NOTHING RETURNING id,digest`,[id,reviewId,attemptKey,this.repository,review.pull_request,base.sha,head.sha,hash,inputs,storedPlan]);
      const row=inserted.rows[0]??(await client.query('SELECT id,digest FROM agentci_eval_jobs WHERE review_id=$1 AND attempt_key=$2',[reviewId,attemptKey])).rows[0];
      if(row.digest!==hash)throw new ImmutableEvalConflict('Attempt key reused with different eval inputs');
      if(inserted.rowCount)for(const unit of definitions)await client.query('INSERT INTO agentci_eval_units(id,job_id,suite_id,model_key,side,definition,digest) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),id,unit.suite.metadata.id,unit.model??'',unit.side,unit,digest(canonical(unit))]);
      const rows=(await client.query('SELECT id FROM agentci_eval_units WHERE job_id=$1 ORDER BY suite_id,model_key,side',[row.id])).rows;
      await client.query('COMMIT');return {id:row.id,unitIds:rows.map(r=>r.id)};
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  async unit(id:string,connection:Pool|PoolClient=this.pool):Promise<EvalUnit|undefined> {
    const row=(await connection.query(`SELECT u.*,j.inputs,j.plan,j.review_id,to_jsonb(j)->'source' AS source,j.attempt_key,j.repository,j.pull_request,j.digest AS job_digest,j.cancel_requested FROM agentci_eval_units u JOIN agentci_eval_jobs j ON j.id=u.job_id WHERE u.id=$1 AND ${this.scope}`,[id,this.repository,this.organizationId])).rows[0];
    if(!row)return undefined;
    const def=definition(row.definition);validateInputs(row.inputs);
    const source=row.source==null?null:verifyReproductionEvalInputs(row.source,this.organizationId,row.attempt_key,row.inputs,row.plan,def);
    if(source&&row.review_id!==null||!source&&!row.review_id)throw Error('Eval source authority mismatch');
    const authority=source?{source}:{reviewId:row.review_id};
    if(digest(canonical(def))!==row.digest||digest(canonical({...authority,attemptKey:row.attempt_key,repository:row.repository,pullRequest:row.pull_request,inputs:row.inputs,plan:row.plan}))!==row.job_digest||!row.plan.units.some((value:unknown)=>canonical(value)===canonical(def)))throw new Error('Eval input integrity mismatch');
    const result=row.result?validateEvalRun(row.result):undefined;
    if(result&&digest(canonical(result))!==row.result_digest)throw new Error('Eval result integrity mismatch');
    return {id:row.id,jobId:row.job_id,definition:def,inputs:row.inputs,status:row.status,cancelRequested:row.cancel_requested,...(result?{result}:{})};
  }
  /** A consistent evidence snapshot; projected source, lease tokens and operator secrets never leave storage. */
  async comparison(id:string):Promise<ComparisonRecord|undefined> {
    if(!uuid(id))throw new Error('Invalid comparison UUID');
    const client=await this.pool.connect();
    try{
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const job=(await client.query(`SELECT j.* FROM agentci_eval_jobs j WHERE j.id=$1 AND ${this.scope}`,[id,this.repository,this.organizationId])).rows[0];
      if(!job){await client.query('COMMIT');return undefined;}
      if(job.source!=null)throw new UnsupportedEvalSource();
      validateInputs(job.inputs);
      if(digest(canonical({reviewId:job.review_id,attemptKey:job.attempt_key,repository:job.repository,pullRequest:job.pull_request,inputs:job.inputs,plan:job.plan}))!==job.digest)throw new Error('Eval job integrity mismatch');
      const ids=(await client.query('SELECT id FROM agentci_eval_units WHERE job_id=$1 ORDER BY suite_id,model_key,side',[id])).rows.map(row=>row.id as string);
      if(!Array.isArray(job.plan.units)||ids.length!==job.plan.units.length)throw new Error('Eval planned unit coverage mismatch');
      const units:ComparisonUnit[]=[];
      for(const unitId of ids){
        const unit=await this.unit(unitId,client);if(!unit||unit.jobId!==job.id)throw new Error('Eval unit identity mismatch');
        const def=unit.definition,assertions=unit.inputs[def.assertionSide].snapshot,subject=unit.inputs[def.side].snapshot;
        const harness=baselineHarness(def.suite,assertions,subject);
        units.push({id:unitId,suite:def.suite.metadata.id,revision:harness.revision,side:def.side,assertionSide:def.assertionSide,...(def.model===undefined?{}:{model:def.model}),trials:def.suite.spec.trials.count,passRate:def.suite.spec.trials.passRate,maxCriticalFailures:def.suite.spec.trials.maxCriticalFailures??0,scenarioIds:def.suite.spec.scenarios.map(s=>s.id),...def.runner,status:unit.status as ComparisonUnit['status'],...(unit.result?{result:unit.result}:{})});
      }
      const record=comparisonRecord(createEvalComparison({id:job.id,reviewId:job.review_id,attemptId:job.attempt_key,organizationId:this.organizationId,subject:{repository:this.repository,pullRequest:job.pull_request,baseSha:job.base_sha,headSha:job.head_sha},cancelRequested:job.cancel_requested,units,suiteChanges:job.plan.suiteChanges,coverageGaps:job.plan.coverageGaps,selectionGaps:job.plan.selectionGaps}));
      await client.query('COMMIT');return record;
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  /** A single repeatable-read snapshot, streamed one unit/group at a time; cancellation closes its transaction. */
  async *exportComparison(id:string,signal?:AbortSignal):AsyncGenerator<ExportItem>{
    if(!uuid(id))throw new Error('Invalid comparison UUID');
    const client=await this.pool.connect();let active=false;
    try{
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      active=true;
      await client.query("SET LOCAL statement_timeout='10s'");
      await client.query("SET LOCAL idle_in_transaction_session_timeout='30s'");
      const job=(await client.query(`SELECT j.* FROM agentci_eval_jobs j WHERE j.id=$1 AND ${this.scope}`,[id,this.repository,this.organizationId])).rows[0];
      if(!job){await client.query('COMMIT');active=false;return;}
      if(job.source!=null)throw new UnsupportedEvalSource();
      validateInputs(job.inputs);
      if(digest(canonical({reviewId:job.review_id,attemptKey:job.attempt_key,repository:job.repository,pullRequest:job.pull_request,inputs:job.inputs,plan:job.plan}))!==job.digest)throw new Error('Eval job integrity mismatch');
      const metadata=(await client.query('SELECT id,status,digest,result_digest FROM agentci_eval_units WHERE job_id=$1 ORDER BY suite_id,model_key,side',[id])).rows;
      if(!Array.isArray(job.plan.units)||metadata.length!==job.plan.units.length||metadata.length>10000)throw new Error('Eval planned unit coverage mismatch');
      const definitions=new Set(job.plan.units.map((u:EvalUnitDefinition)=>digest(canonical(definition(u)))));
      if(definitions.size!==metadata.length)throw new Error('Duplicate planned eval definition');
      const header:ExportHeader={id:job.id,reviewId:job.review_id,attemptId:job.attempt_key,organizationId:this.organizationId,subject:{repository:this.repository,pullRequest:job.pull_request,baseSha:job.base_sha,headSha:job.head_sha},cancelRequested:job.cancel_requested,unitCount:metadata.length,snapshotDigest:digest(canonical({job:job.digest,cancelRequested:job.cancel_requested,units:metadata})),suiteChanges:job.plan.suiteChanges,coverageGaps:job.plan.coverageGaps,selectionGaps:job.plan.selectionGaps};
      const accumulator=new ComparisonAccumulator(header);yield {type:'header',data:header};
      for(const meta of metadata){
        if(signal?.aborted)throw new Error('Export cancelled');
        const row=(await client.query('SELECT * FROM agentci_eval_units WHERE id=$1 AND job_id=$2',[meta.id,id])).rows[0];
        if(!row||!definitions.has(row.digest)||digest(canonical(row.definition))!==row.digest)throw new Error('Eval definition integrity mismatch');
        const def=definition(row.definition),harness=baselineHarness(def.suite,job.inputs[def.assertionSide].snapshot,job.inputs[def.side].snapshot);
        const result=row.result?validateEvalRun(row.result):undefined;
        if(result&&digest(canonical(result))!==row.result_digest)throw new Error('Eval result integrity mismatch');
        const unit:ComparisonUnit={id:row.id,suite:def.suite.metadata.id,revision:harness.revision,side:def.side,assertionSide:def.assertionSide,...(def.model===undefined?{}:{model:def.model}),trials:def.suite.spec.trials.count,passRate:def.suite.spec.trials.passRate,maxCriticalFailures:def.suite.spec.trials.maxCriticalFailures??0,scenarioIds:def.suite.spec.scenarios.map(s=>s.id),...def.runner,status:row.status,...(result?{result}:{})};
        const comparisons=accumulator.push(unit);yield {type:'unit',data:unit};
        for(const comparison of comparisons)yield {type:'comparison',data:comparison};
      }
      const final=accumulator.finish();for(const comparison of final.comparisons)yield {type:'comparison',data:comparison};
      yield {type:'summary',data:final.summary};
      if(signal?.aborted)throw new Error('Export cancelled');
      await client.query('COMMIT');active=false;yield {type:'end',data:{summaryDigest:digest(canonical(final.summary))}};
    }finally{
      let destroyed=false;if(active){try{await client.query('ROLLBACK');}catch{client.release(true);destroyed=true;}}
      if(!destroyed)client.release();
    }
  }
  async claim(id:string,seconds=30):Promise<string|undefined> {
    leaseSeconds(seconds);const token=randomUUID();
    const row=(await this.pool.query(`UPDATE agentci_eval_units u SET status='running',lease_token=$4,lease_until=clock_timestamp()+($5*interval '1 second')
      FROM agentci_eval_jobs j WHERE j.id=u.job_id AND u.id=$1 AND ${this.scope} AND NOT j.cancel_requested
      AND u.status IN('queued','running') AND (u.lease_until IS NULL OR u.lease_until<clock_timestamp()) RETURNING u.id`,[id,this.repository,this.organizationId,token,seconds])).rows[0];
    return row?token:undefined;
  }
  async renew(id:string,token:string,seconds=30):Promise<void> {
    leaseSeconds(seconds);
    const updated=await this.pool.query(`UPDATE agentci_eval_units u SET lease_until=clock_timestamp()+($5*interval '1 second') FROM agentci_eval_jobs j
      WHERE j.id=u.job_id AND u.id=$1 AND ${this.scope} AND NOT j.cancel_requested AND u.status='running' AND u.lease_token=$4 AND u.lease_until>clock_timestamp()`,[id,this.repository,this.organizationId,token,seconds]);
    if(!updated.rowCount)throw new EvalLeaseLost('Eval execution lease lost');
  }
  async leaseState(id:string):Promise<{status:string;token:string|null;live:boolean;cancelRequested:boolean}|undefined> {
    const row=(await this.pool.query(`SELECT u.status,u.lease_token AS token,COALESCE(u.lease_until>clock_timestamp(),false) AS live,j.cancel_requested AS "cancelRequested"
      FROM agentci_eval_units u JOIN agentci_eval_jobs j ON j.id=u.job_id WHERE u.id=$1 AND ${this.scope}`,[id,this.repository,this.organizationId])).rows[0];
    return row;
  }
  async release(id:string,token:string,cancelled=false):Promise<void> {
    const updated=await this.pool.query(`UPDATE agentci_eval_units u SET status=$5,lease_token=NULL,lease_until=NULL FROM agentci_eval_jobs j
      WHERE j.id=u.job_id AND u.id=$1 AND ${this.scope} AND NOT j.cancel_requested AND u.status='running' AND u.lease_token=$4 AND u.lease_until>clock_timestamp()`,[id,this.repository,this.organizationId,token,cancelled?'cancelled':'queued']);
    if(!updated.rowCount)throw new EvalLeaseLost('Eval execution lease lost');
  }
  private async fenced(id:string,token:string,client:PoolClient):Promise<EvalUnitDefinition> {
    const row=(await client.query(`SELECT u.definition,u.digest FROM agentci_eval_units u JOIN agentci_eval_jobs j ON j.id=u.job_id
      WHERE u.id=$1 AND ${this.scope} AND NOT j.cancel_requested AND u.status='running' AND u.lease_token=$4 AND u.lease_until>clock_timestamp() FOR UPDATE OF u`,[id,this.repository,this.organizationId,token])).rows[0];
    if(!row)throw new EvalLeaseLost('Eval execution lease lost');
    const def=definition(row.definition);if(digest(canonical(def))!==row.digest)throw new Error('Eval definition integrity mismatch');return def;
  }
  /** Serialize daemon cleanup with lease takeover; no new owner can create containers during this action. */
  async withLease<T>(id:string,token:string,action:()=>Promise<T>):Promise<T> {
    const client=await this.pool.connect();
    try{
      await client.query('BEGIN');await this.fenced(id,token,client);
      const result=await action();await this.fenced(id,token,client);
      await client.query('COMMIT');return result;
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  async trial(id:string,index:number):Promise<TrialCheckpoint|undefined> {
    if(!Number.isSafeInteger(index)||index<0||index>=1000)throw new Error('Invalid trial index');
    const row=(await this.pool.query(`SELECT t.checkpoint,t.digest,u.definition FROM agentci_eval_trials t JOIN agentci_eval_units u ON u.id=t.unit_id JOIN agentci_eval_jobs j ON j.id=u.job_id WHERE t.unit_id=$1 AND ${this.scope} AND t.trial=$4`,[id,this.repository,this.organizationId,index])).rows[0];
    if(!row)return undefined;
    const checkpoint=validateTrialCheckpoint(definition(row.definition).suite,row.checkpoint);
    if(digest(canonical(checkpoint))!==row.digest)throw new Error('Trial checkpoint integrity mismatch');return checkpoint;
  }
  async recordTrial(id:string,token:string,index:number,value:TrialCheckpoint):Promise<void> {
    const client=await this.pool.connect();
    try{
      await client.query('BEGIN');const def=await this.fenced(id,token,client);
      if(!Number.isSafeInteger(index)||index<0||index>=def.suite.spec.trials.count)throw new Error('Invalid trial index');
      const checkpoint=validateTrialCheckpoint(def.suite,value),hash=digest(canonical(checkpoint));
      const inserted=await client.query(`INSERT INTO agentci_eval_trials(unit_id,trial,checkpoint,digest) SELECT id,$3,$4,$5 FROM agentci_eval_units WHERE id=$1 AND lease_token=$2 AND lease_until>clock_timestamp() AND status='running'
        ON CONFLICT(unit_id,trial) DO NOTHING RETURNING digest`,[id,token,index,checkpoint,hash]);
      if(!inserted.rowCount){
        await this.fenced(id,token,client);
        const row=(await client.query('SELECT digest FROM agentci_eval_trials WHERE unit_id=$1 AND trial=$2',[id,index])).rows[0];
        if(!row||row.digest!==hash)throw new ImmutableEvalConflict('Trial observation is immutable');
      }
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  async complete(id:string,token:string,value:EvalRun):Promise<EvalRun> {
    const run=validateEvalRun(value),existing=await this.unit(id);
    if(existing?.result){if(canonical({...existing.result,artifacts:[]})!==canonical({...run,artifacts:[]})||(run.artifacts.length&&canonical(run.artifacts)!==canonical(existing.result.artifacts)))throw new ImmutableEvalConflict('Completed eval result is immutable');return existing.result;}
    const client=await this.pool.connect();
    try{
      await client.query('BEGIN');const def=await this.fenced(id,token,client),unit=await this.unit(id,client);
      if(!unit)throw new Error('Missing eval unit');
      const rows=(await client.query('SELECT trial,checkpoint,digest FROM agentci_eval_trials WHERE unit_id=$1 ORDER BY trial',[id])).rows;
      if(rows.length!==def.suite.spec.trials.count||rows.some((r,i)=>r.trial!==i))throw new Error('Cannot complete missing eval trials');
      const trials=rows.map(row=>{const checkpoint=validateTrialCheckpoint(def.suite,row.checkpoint);if(digest(canonical(checkpoint))!==row.digest)throw new Error('Trial integrity mismatch');return {index:row.trial,...checkpoint};});
      const subject=unit.inputs[def.side],assertions=unit.inputs[def.assertionSide],harness=baselineHarness(def.suite,assertions.snapshot,subject.snapshot);
      const scenarios=def.suite.spec.scenarios.map(s=>aggregateScenario(def.suite,s.id,trials.map(t=>t.results[s.id]!)));
      const expected=validateEvalRun({apiVersion:'agentci.io/v1alpha1',kind:'EvalRun',id,suite:def.suite.metadata.id,revision:harness.revision,subject:{repository:this.repository,gitSha:subject.snapshot.sha,assertionGitSha:assertions.snapshot.sha,inputDigest:digest(canonical(harness.snapshot.files)),omittedInputs:subject.omitted},...def.runner,...(def.model===undefined?{}:{model:def.model}),trials:def.suite.spec.trials.count,status:combinedStatus(scenarios),scenarios,artifacts:[]});
      if(canonical({...run,artifacts:[]})!==canonical(expected))throw new ImmutableEvalConflict('Result contradicts stored inputs or observations');
      const artifact={digest:digest(canonical(trials)),mediaType:'application/json',uri:`urn:agentci:eval-trials:${id}`};
      if(run.artifacts.length&&canonical(run.artifacts)!==canonical([artifact]))throw new ImmutableEvalConflict('Result artifact is not the retained trial record');
      const result=validateEvalRun({...expected,artifacts:[artifact]});
      const updated=await client.query(`UPDATE agentci_eval_units SET status='completed',result=$3,result_digest=$4,completed_at=clock_timestamp(),lease_token=NULL,lease_until=NULL
        WHERE id=$1 AND lease_token=$2 AND lease_until>clock_timestamp() AND status='running'`,[id,token,result,digest(canonical(result))]);
      if(!updated.rowCount)throw new EvalLeaseLost('Eval execution lease lost');
      await client.query('COMMIT');return result;
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  async recoveryPlan(attemptId:string):Promise<{id:string;reviewId:string;unitIds:string[];completedUnitIds:string[];subject:{repository:string;pullRequest:number;baseSha:string;headSha:string}}|undefined>{
    const row=(await this.pool.query(`SELECT j.id,j.review_id,j.repository,j.pull_request,j.base_sha,j.head_sha FROM agentci_eval_jobs j WHERE j.attempt_key=$1 AND j.review_id IS NOT NULL AND ${this.scope}`,[attemptId,this.repository,this.organizationId])).rows[0];
    if(!row)return undefined;
    const metadata=(await this.pool.query('SELECT id,status FROM agentci_eval_units WHERE job_id=$1 ORDER BY id LIMIT 10001',[row.id])).rows,ids=metadata.map(r=>r.id as string);if(ids.length>10000)throw new Error('Recovery unit limit exceeded');
    return {id:row.id,reviewId:row.review_id,unitIds:ids,completedUnitIds:metadata.filter(r=>r.status==='completed').map(r=>r.id as string),subject:{repository:row.repository,pullRequest:row.pull_request,baseSha:row.base_sha,headSha:row.head_sha}};
  }
  async cancel(jobId:string):Promise<void> {
    const client=await this.pool.connect();
    try{
      await client.query('BEGIN');
      const row=(await client.query(`UPDATE agentci_eval_jobs j SET cancel_requested=true WHERE id=$1 AND ${this.scope} RETURNING id`,[jobId,this.repository,this.organizationId])).rows[0];
      if(!row)throw new Error('Unknown scoped eval job');
      await client.query(`UPDATE agentci_eval_units SET status='cancelled',lease_token=NULL,lease_until=NULL WHERE job_id=$1 AND status IN('queued','running')`,[jobId]);
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
}
