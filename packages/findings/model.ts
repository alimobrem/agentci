import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {Ajv} from 'ajv';
import type {FormatsPlugin} from 'ajv-formats';
import {canonical,digest} from '../review/engine.ts';
import {buildReviewContext,type ReviewSubject} from '../reviewers/context.ts';
import {validateReviewerResult} from '../reviewers/result.ts';
const ajv=new Ajv({strict:true});const formats:FormatsPlugin=createRequire(import.meta.url)('ajv-formats');formats(ajv);
export const findingProposalSchema=JSON.parse(readFileSync(new URL('./json/finding-proposals.schema.json',import.meta.url),'utf8'));
const proposalValid=ajv.compile(findingProposalSchema);
const findingValid=ajv.compile(JSON.parse(readFileSync(new URL('./json/model-finding.schema.json',import.meta.url),'utf8')));
export type FindingState='proposed'|'deduplicated'|'reproduction-pending'|'confirmed'|'unconfirmed'|'false-positive'|'resolved';
export interface FindingReference {side:'base'|'head';path:string;digest:string;startLine:number;endLine:number}
export interface FindingProposal {category:'specification'|'correctness'|'architecture'|'security'|'adversarial'|'test-coverage'|'reliability';severity:'low'|'medium'|'high'|'critical';claim:string;evidence:FindingReference[]}
export interface ModelFinding extends FindingProposal {
 schemaVersion:'v1alpha1';id:string;subject:ReviewSubject;mode:'synthetic'|'external';
 sources:{requestId:string;attemptId:string;provider:string;model:string;reviewerResultDigest:string;originalClaim:string}[];
 state:FindingState;version:number;
 disposition:null|{kind:'reproduction'|'operator';evidenceDigest:string;reason:string;outcome:'reproduced'|'not-reproduced'|'error'|'false-positive'|'resolved'};
}
const fail=():never=>{throw new Error('invalid-model-finding');};
const normalizedClaim=(value:string)=>value.normalize('NFC').replace(/\s+/gu,' ').trim();
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
const sortedReferences=(refs:FindingReference[])=>[...refs].sort((a,b)=>compare(canonical(a),canonical(b)));
function identity(value:Pick<ModelFinding,'subject'|'mode'|'category'|'claim'|'evidence'>){return digest(canonical({subject:value.subject,mode:value.mode,category:value.category,claim:value.claim,evidence:value.evidence}));}
function bounded(value:unknown){
 let nodes=0;const visit=(v:unknown,depth:number)=>{if(++nodes>50000||depth>32)fail();if(v===null||typeof v==='boolean'||typeof v==='string'||typeof v==='number'&&Number.isFinite(v))return;if(!v||typeof v!=='object')return fail();if(Array.isArray(v)){if(Object.keys(v).length!==v.length)fail();}else if(![Object.prototype,null].includes(Object.getPrototypeOf(v)))fail();for(const x of Object.values(v))visit(x,depth+1);};visit(value,0);if(Buffer.byteLength(JSON.stringify(value))>2097152)fail();
}
/** Structural integrity only. Authorize the writer and verify referenced evidence
 * before using a stored finding. Hashes do not authenticate model or operator data. */
export function validateModelFinding(value:unknown,expected:ReviewSubject):ModelFinding{
 try{
  bounded(value);if(!findingValid(value))fail();const f=value as ModelFinding;
  if(canonical(f.subject)!==canonical(expected)||f.subject.baseSha===f.subject.headSha||!f.claim||f.claim!==normalizedClaim(f.claim)||f.id!==identity(f))fail();
  if(canonical(f.evidence)!==canonical(sortedReferences(f.evidence))||new Set(f.evidence.map(e=>canonical(e))).size!==f.evidence.length)fail();
  for(const r of f.evidence)if(r.startLine>r.endLine||/[\\:\x00-\x1f\x7f]/.test(r.path)||r.path.split('/').some(p=>!p||p==='.'||p==='..'))fail();
  if(new Set(f.sources.map(s=>canonical([s.requestId,s.attemptId,s.originalClaim]))).size!==f.sources.length)fail();
  for(const source of f.sources)if(normalizedClaim(source.originalClaim)!==f.claim||f.sources.some(s=>s.requestId===source.requestId&&s.attemptId===source.attemptId&&(s.reviewerResultDigest!==source.reviewerResultDigest||s.provider!==source.provider||s.model!==source.model)))fail();
  if(f.state==='proposed'&&(f.version!==0||f.disposition!==null)||f.state!=='proposed'&&f.version<1)fail();
  if(['deduplicated','reproduction-pending'].includes(f.state)&&f.disposition!==null)fail();
  if(f.state==='confirmed'&&(f.disposition?.kind!=='reproduction'||f.disposition.outcome!=='reproduced'))fail();
  if(f.state==='unconfirmed'&&(f.disposition?.kind!=='reproduction'||!['not-reproduced','error'].includes(f.disposition.outcome)))fail();
  if(f.state==='false-positive'&&(f.disposition?.kind!=='operator'||f.disposition.outcome!=='false-positive'))fail();
  if(f.state==='resolved'&&(f.disposition?.kind!=='operator'||f.disposition.outcome!=='resolved'))fail();
  return structuredClone(f);
 }catch{return fail();}
}
/** Input must be a controller-authenticated retained reviewer result and its exact
 * selected snapshot context. Repository/model output cannot supply source identity. */
export function findingsFromReviewer(value:unknown,subject:ReviewSubject,documents:unknown):ModelFinding[]{
 const context=buildReviewContext(subject,documents),result=validateReviewerResult(value,context.subject);
 if(result.contextDigest!==context.digest)fail();
 if(result.status!=='completed')return [];
 const findings=findingsFromRetainedReviewer(result,context.subject);
 for(const finding of findings)for(const ref of finding.evidence){
  const doc=context.documents.find(d=>d.side===ref.side&&d.path===ref.path&&d.kind!=='diff');
  if(!doc||doc.digest!==ref.digest||ref.startLine>ref.endLine||ref.endLine>doc.content.split('\n').length)fail();
 }
 return findings;
}
/** Structural projection from authenticated retained results. This checks proposal
 * identity, not the underlying source bytes. Ingestion still requires the full
 * context checks above; export uses this only to bind retained provenance. */
export function findingsFromRetainedReviewer(value:unknown,subject:ReviewSubject):ModelFinding[]{
 const result=validateReviewerResult(value,subject);if(result.status!=='completed')return [];
 const output=result.proposal!.output;if(!proposalValid(output))fail();
 return (output as unknown as {findings:FindingProposal[]}).findings.map(proposal=>{
  const claim=normalizedClaim(proposal.claim);if(!claim)fail();
  const evidence=sortedReferences(proposal.evidence);
  const f={schemaVersion:'v1alpha1' as const,subject:subject,mode:result.mode,...proposal,claim,evidence,
   sources:[{requestId:result.requestId,attemptId:result.attemptId,provider:result.provider,model:result.model,reviewerResultDigest:digest(canonical(result)),originalClaim:proposal.claim}],state:'proposed' as const,version:0,disposition:null};
  return validateModelFinding({...f,id:identity(f)},subject);
 });
}
/** Exact duplicate aggregation only; similar prose or changed evidence stays separate. */
export function deduplicateFindings(values:readonly ModelFinding[],subject:ReviewSubject):ModelFinding[]{
 if(!Array.isArray(values)||values.length>64)fail();const groups=new Map<string,ModelFinding>();const rank=['low','medium','high','critical'];
 for(const value of values){const f=validateModelFinding(value,subject);if(f.state!=='proposed')fail();const prior=groups.get(f.id);
  if(!prior){groups.set(f.id,{...f,state:'deduplicated',version:1});continue;}
  for(const source of f.sources){const contributors=prior.sources.filter(s=>s.requestId===source.requestId&&s.attemptId===source.attemptId);if(contributors.some(s=>s.reviewerResultDigest!==source.reviewerResultDigest||s.provider!==source.provider||s.model!==source.model))fail();const existing=contributors.find(s=>s.originalClaim===source.originalClaim);if(!existing)prior.sources.push(source);}
  if(rank.indexOf(f.severity)>rank.indexOf(prior.severity))prior.severity=f.severity;
 }
 return [...groups.values()].sort((a,b)=>compare(a.id,b.id)).map(f=>{f.sources.sort((a,b)=>compare(canonical([a.requestId,a.attemptId,a.originalClaim]),canonical([b.requestId,b.attemptId,b.originalClaim])));return validateModelFinding(f,subject);});
}

/** Additional reviewer evidence cannot establish or erase a reproduction result.
 * Pending reproduction pins a finding version; retry ingestion after it settles.
 */
export function mergeFindingEvidence(value:ModelFinding,incomingValue:ModelFinding):ModelFinding{
 const before=validateModelFinding(value,value.subject),incoming=validateModelFinding(incomingValue,before.subject);
 if(before.id!==incoming.id||before.state==='proposed'||before.state==='reproduction-pending'||incoming.state!=='deduplicated'||incoming.version!==1||before.version>=10000)fail();
 const proposed=(f:ModelFinding):ModelFinding=>({...f,state:'proposed',version:0,disposition:null});
 const merged=deduplicateFindings([proposed(before),proposed(incoming)],before.subject)[0];
 if(!merged||merged.id!==before.id)fail();
 return validateModelFinding({...merged!,state:before.state,disposition:before.disposition,version:before.version+1},before.subject);
}
