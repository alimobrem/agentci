import {createEvalComparison,type ComparisonInput,type ComparisonUnit,type ComparisonSummary} from './comparison.ts';
import {canonical,digest} from '../review/engine.ts';
import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';import {Ajv} from 'ajv';import type {FormatsPlugin} from 'ajv-formats';
const ajv=new Ajv({strict:true,allErrors:true});(createRequire(import.meta.url)('ajv-formats') as FormatsPlugin)(ajv);
const frameShape=ajv.compile(JSON.parse(readFileSync(new URL('./json/eval-export-frame.schema.json',import.meta.url),'utf8')));
export const MAX_EXPORT_FRAME_BYTES=64*1024*1024;
export interface ExportHeader extends Omit<ComparisonInput,'units'> {unitCount:number;snapshotDigest:string}
export interface ExportSummary extends Omit<ComparisonSummary,'comparisons'> {unitCount:number;comparisonCount:number}
export type ExportItem={type:'header';data:ExportHeader}|{type:'unit';data:ComparisonUnit}|{type:'comparison';data:ComparisonSummary['comparisons'][number]}|{type:'summary';data:ExportSummary}|{type:'end';data:{summaryDigest:string}};
export type ExportFrame=ExportItem&{sequence:number;previousDigest:string;digest:string};
export interface ExportIdentity {organizationId:string;reviewId:string;attemptId:string;repository:string;pullRequest:number;baseSha:string;headSha:string}
export class ExportIdentityMismatch extends Error {}
const key=(u:ComparisonUnit)=>JSON.stringify([u.suite,u.model??null]);
/** One baseline/head group in memory; bounded identity/gap sets retain no trial results. */
export class ComparisonAccumulator {
  private input:Omit<ComparisonInput,'units'>;
  private group:ComparisonUnit[]=[];private groupKey?:string;private closed=new Set<string>();
  private ids=new Set<string>();private slots=new Set<string>();private suites=new Set<string>();private gaps=new Set<string>();
  private count=0;private comparisons=0;private running=false;private queued=false;private cancelled=false;
  private error=false;private insufficient=false;private failed=false;private finalized=false;
  constructor(public header:ExportHeader){
    const {unitCount,snapshotDigest,...input}=header;
    if(!Number.isSafeInteger(unitCount)||unitCount<0||unitCount>10000||!/^sha256:[a-f0-9]{64}$/.test(snapshotDigest))throw new Error('Invalid export header');
    createEvalComparison({...input,units:[]});this.input=structuredClone(input);
  }
  private flush(){
    if(!this.group.length)return [];
    const summary=createEvalComparison({...this.input,suiteChanges:this.input.suiteChanges.filter(c=>c.suite===this.group[0]!.suite),coverageGaps:[],selectionGaps:[],units:this.group}).summary;
    for(const gap of summary.executionGaps)this.gaps.add(gap);
    const results=summary.comparisons;this.comparisons+=results.length;if(results.some(c=>c.regressions.length))this.failed=true;
    this.closed.add(this.groupKey!);this.group=[];return results;
  }
  push(unit:ComparisonUnit):ComparisonSummary['comparisons']{
    if(this.finalized||this.count>=this.header.unitCount)throw new Error('Unexpected export unit');
    // This validates all planned result identity/threshold invariants without retaining prior runs.
    createEvalComparison({...this.input,suiteChanges:this.input.suiteChanges.filter(c=>c.suite===unit.suite),coverageGaps:[],selectionGaps:[],units:[unit]});
    const slot=JSON.stringify([key(unit),unit.side]);if(this.ids.has(unit.id)||this.slots.has(slot))throw new Error('Duplicate export unit');
    const next=key(unit),comparisons=this.groupKey!==undefined&&next!==this.groupKey?this.flush():[];
    if(this.closed.has(next))throw new Error('Noncontiguous export group');
    this.groupKey=next;this.group.push(structuredClone(unit));this.ids.add(unit.id);this.slots.add(slot);this.suites.add(unit.suite);this.count++;
    this.running ||= unit.status==='running';this.queued ||= unit.status==='queued';this.cancelled ||= unit.status==='cancelled';
    this.error ||= unit.result?.status==='error';this.insufficient ||= unit.result?.status==='insufficient';this.failed ||= unit.result?.status==='failed';
    return comparisons;
  }
  finish():{comparisons:ComparisonSummary['comparisons'];summary:ExportSummary}{
    if(this.finalized||this.count!==this.header.unitCount)throw new Error('Incomplete export');
    this.finalized=true;const comparisons=this.flush();
    for(const change of this.input.suiteChanges)if(!this.suites.has(change.suite))this.gaps.add(`missing-suite-unit:${change.suite}`);
    const state:ComparisonSummary['state']=this.input.cancelRequested||this.cancelled?'cancelled':this.running?'running':this.queued?'queued':'completed';
    const outcome:ComparisonSummary['outcome']=state==='cancelled'?'insufficient':state!=='completed'?'pending':this.error?'error':this.input.coverageGaps.length||this.input.selectionGaps.length||this.gaps.size||this.insufficient?'insufficient':!this.count?'no-evals':this.failed?'failed':'passed';
    return {comparisons,summary:{state,outcome,executionGaps:[...this.gaps].sort(),unitCount:this.count,comparisonCount:this.comparisons}};
  }
}
export function exportFrame(item:ExportItem,sequence:number,previousDigest:string):ExportFrame{
  const content={...item,sequence,previousDigest};return {...content,digest:digest(canonical(content))};
}
export function validateExportFrame(value:unknown,sequence:number,previousDigest:string):ExportFrame{
  const frame=value as ExportFrame;
  if(!frameShape(frame)||frame.sequence!==sequence||frame.previousDigest!==previousDigest)throw new Error('Invalid export frame identity');
  const {digest:hash,...content}=frame;if(hash!==digest(canonical(content)))throw new Error('Export frame digest mismatch');
  return frame;
}
/** Shared semantic/hash verifier for agent clients and controller Check publication. */
export class EvalExportVerifier {
  private sequence=0;private previous='sha256:'+'0'.repeat(64);private accumulator?:ComparisonAccumulator;
  private observed=0;private summary?:ExportSummary;private receivedSummary=false;private comparisons:unknown[]=[];
  private header?:ExportHeader;ended=false;
  constructor(private id:string,private expected:ExportIdentity){this.expected={...expected};}
  push(value:unknown):ExportFrame{
    if(this.ended)throw new Error('Unexpected data after export end');
    const frame=validateExportFrame(value,this.sequence++,this.previous);this.previous=frame.digest;
    if(frame.type==='header'){
      if(this.accumulator||this.sequence!==1)throw new Error('Unexpected export header');
      const h=frame.data,s=h.subject,e=this.expected;
      if(h.id!==this.id||h.organizationId!==e.organizationId||h.reviewId!==e.reviewId||h.attemptId!==e.attemptId||s.repository!==e.repository||s.pullRequest!==e.pullRequest||s.baseSha!==e.baseSha||s.headSha!==e.headSha)throw new ExportIdentityMismatch('Export identity mismatch');
      this.header=structuredClone(h);this.accumulator=new ComparisonAccumulator(this.header);
      if(!h.unitCount){const final=this.accumulator.finish();this.summary=final.summary;this.comparisons.push(...final.comparisons);}
    }else if(frame.type==='unit'){
      if(!this.accumulator||this.summary||this.comparisons.length)throw new Error('Unexpected export unit');
      this.comparisons.push(...this.accumulator.push(frame.data));
      if(++this.observed===this.accumulator.header.unitCount){const final=this.accumulator.finish();this.summary=final.summary;this.comparisons.push(...final.comparisons);}
    }else if(frame.type==='comparison'){
      if(!this.comparisons.length||canonical(frame.data)!==canonical(this.comparisons.shift()))throw new Error('Export comparison mismatch');
    }else if(frame.type==='summary'){
      if(!this.summary||this.receivedSummary||this.comparisons.length||canonical(frame.data)!==canonical(this.summary))throw new Error('Export summary mismatch');this.receivedSummary=true;
    }else{
      if(!this.summary||!this.receivedSummary||frame.data.summaryDigest!==digest(canonical(this.summary)))throw new Error('Export terminal digest mismatch');this.ended=true;
    }
    return frame;
  }
  finish():{header:ExportHeader;summary:ExportSummary;endDigest:string}{
    if(!this.ended||!this.header||!this.summary||!this.receivedSummary)throw new Error('Incomplete export');
    return {header:this.header,summary:this.summary,endDigest:this.previous};
  }
}
/** The first trusted header anchors the chain to its exact scoped storage snapshot. */
export async function* frameExport(items:AsyncIterable<ExportItem>):AsyncGenerator<ExportFrame>{
  let sequence=0,previous='sha256:'+'0'.repeat(64);
  for await(const item of items){const frame=exportFrame(item,sequence,previous);validateExportFrame(frame,sequence++,previous);previous=frame.digest;yield frame;}
}
