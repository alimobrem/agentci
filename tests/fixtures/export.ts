import {ComparisonAccumulator,type ExportHeader,type ExportItem} from '../../packages/evals/export.ts';
import type {ComparisonRecord} from '../../packages/evals/comparison.ts';
export async function* exportFixture(record:ComparisonRecord):AsyncGenerator<ExportItem>{
 const {apiVersion,kind,summary,units,...input}=record.comparison;
 const header:ExportHeader={...input,unitCount:units.length,snapshotDigest:record.digest},accumulator=new ComparisonAccumulator(header);yield {type:'header',data:header};
 for(const unit of units){const comparisons=accumulator.push(unit);yield {type:'unit',data:unit};for(const comparison of comparisons)yield {type:'comparison',data:comparison};}
 const final=accumulator.finish();for(const comparison of final.comparisons)yield {type:'comparison',data:comparison};yield {type:'summary',data:final.summary};
 const {digest,canonical}=await import('../../packages/review/engine.ts');yield {type:'end',data:{summaryDigest:digest(canonical(final.summary))}};
}
