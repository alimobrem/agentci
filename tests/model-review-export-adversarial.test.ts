import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {canonical,digest} from '../packages/review/engine.ts';
import {ModelReviewExportVerifier,modelReviewExportFrame,type ModelReviewExportItem,type ModelReviewExportFrame} from '../packages/reviewers/export.ts';
import {modelReviewExportFixture} from './helpers/model-review-export-fixture.ts';
// Rehash the outer chain so mutations exercise semantic integrity, not merely checksums.
function rechain(items:ModelReviewExportItem[]):ModelReviewExportFrame[]{
 const copy=structuredClone(items),header=copy.find(i=>i.type==='header');
 if(header?.type==='header'){const {snapshotDigest,...snapshot}=header.data;header.data.snapshotDigest=digest(canonical(snapshot));}
 let prior=`sha256:${'0'.repeat(64)}`;return copy.map((item,sequence)=>{
  if(item.type==='end'&&header?.type==='header'){item.data.snapshotDigest=header.data.snapshotDigest;item.data.lastContentDigest=prior;}
  const frame=modelReviewExportFrame(item,sequence,prior);prior=frame.digest;return frame;
 });
}
const items=()=>modelReviewExportFixture().frames.map(({type,data})=>({type,data})) as ModelReviewExportItem[];
async function verify(frames:unknown[],request=modelReviewExportFixture().request){const v=new ModelReviewExportVerifier(request);for(const frame of frames)await v.push(frame);return v.finish();}
test('complete partial exports preserve cancelled/failed evidence and queued missing roles without successful execution',async()=>{
 for(const state of ['cancelled','failed','queued'] as const){
  const source=items(),header=source[0]!;assert.equal(header.type,'header');if(header.type!=='header')throw Error();
  header.data.review.execution={state,cancelRequested:state==='cancelled',terminalDigest:state==='queued'?null:digest('terminal')};
  if(state==='queued'){header.data.retainedRoles=[];header.data.missingRoleIds=header.data.configuredRoles.map(r=>r.requestId);header.data.findings=[];header.data.reviewerCount=0;header.data.eventCount=0;source.splice(1,2);const end=source.at(-1)!;if(end.type==='end'){end.data.reviewerCount=0;end.data.eventCount=0;}}
  const result=await verify(rechain(source));assert.equal(result.complete,true);assert.equal(result.header.review.summary,null);assert.equal(result.header.review.execution.state,state);assert.equal(result.header.missingRoleIds.length,state==='queued'?2:1);
 }
});
test('no valid prefix or interrupted export can certify completion',async()=>{
 const f=modelReviewExportFixture();for(let count=0;count<f.frames.length;count++){const v=new ModelReviewExportVerifier(f.request);for(const frame of f.frames.slice(0,count))await v.push(frame);assert.throws(()=>v.finish());}
 const v=new ModelReviewExportVerifier(f.request);for(const frame of f.frames)await v.push(frame);assert.equal(v.finish().complete,true);
 await assert.rejects(v.push(f.frames.at(-1)));await assert.rejects(v.push(f.frames[0]));
});
test('rehashed exports reject omitted duplicate reordered and wrong-subject retained content',async t=>{
 const mutations:[string,(s:ModelReviewExportItem[])=>void][]=[
  ['missing reviewer',s=>s.splice(1,1)],['missing finding',s=>s.splice(2,1)],['duplicate reviewer',s=>s.splice(2,0,structuredClone(s[1]!))],['duplicate finding',s=>s.splice(3,0,structuredClone(s[2]!))],['reordered content',s=>{[s[1],s[2]]=[s[2]!,s[1]!];}],['duplicate header',s=>s.splice(1,0,structuredClone(s[0]!))],
  ['wrong reviewer identity',s=>{const r=s[1],h=s[0];if(r?.type==='reviewer'&&h?.type==='header'){r.data.result.requestId=randomUUID();r.data.digest=digest(canonical(r.data.result));h.data.retainedRoles[0]!.digest=r.data.digest;}}],
  ['wrong reviewer subject',s=>{const r=s[1],h=s[0];if(r?.type==='reviewer'&&h?.type==='header'){r.data.result.subject={...r.data.result.subject,headSha:'f'.repeat(40)};r.data.digest=digest(canonical(r.data.result));h.data.retainedRoles[0]!.digest=r.data.digest;}}],
  ['wrong ingest operation',s=>{const r=s[2],h=s[0];if(r?.type==='finding'&&h?.type==='header'){r.data.event.operationId=randomUUID();r.data.digest=digest(canonical(r.data.event));h.data.findings[0]!.lastDigest=r.data.digest;}}],
  ['missing configured role marker',s=>{const h=s[0];if(h?.type==='header')h.data.missingRoleIds=[];}],
  ['duplicate missing role marker',s=>{const h=s[0];if(h?.type==='header')h.data.missingRoleIds.push(h.data.missingRoleIds[0]!);} ],
  ['wrong retained result digest',s=>{const h=s[0];if(h?.type==='header')h.data.retainedRoles[0]!.digest=digest('wrong');}],
  ['incorrect manifest event count',s=>{const h=s[0];if(h?.type==='header')h.data.eventCount++;}],
  ['incorrect end event count',s=>{const e=s.at(-1);if(e?.type==='end')e.data.eventCount++;}],
  ['truncated captured history',s=>{const h=s[0];if(h?.type==='header'){h.data.findings[0]!.throughVersion++;h.data.eventCount++;}}],
  ['extra end field',s=>{const e=s.at(-1);if(e?.type==='end')(e.data as any).success=true;}],
 ];
 for(const [label,mutate] of mutations)await t.test(label,async()=>{const s=items();mutate(s);await assert.rejects(verify(rechain(s)));});
 const request=structuredClone(modelReviewExportFixture().request);request.subject.organizationId=randomUUID();await assert.rejects(verify(modelReviewExportFixture().frames,request));
});
test('raw envelope corruption and trailing frames fail independent of semantic content',async()=>{
 const original=modelReviewExportFixture().frames;
 for(const mutate of [(f:any[])=>f[1].sequence++,(f:any[])=>f[1].previousDigest=digest('wrong'),(f:any[])=>f[1].digest=digest('wrong'),(f:any[])=>f[1].extra=true,(f:any[])=>f.push(f[0])]){const f=structuredClone(original);mutate(f);await assert.rejects(verify(f));}
});
