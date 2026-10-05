import {safePath,validateRelease,type Release} from './delivery.ts';
import {reusableEvidence,type EvidenceRecord,type EvidenceInvalidation} from './evidence-reuse.ts';
export interface ClosureProof {path:string;sha256:string}
export interface ConsolidatedClosure {
 milestone:string;version:string;sourceCommit:string;releaseUrl:string;
 requirementAudit:ClosureProof;retrospective:ClosureProof;
 demo:{deliveredAt:string;successEvidenceId:string;failureEvidenceId:string};
 gates:{id:string;evidenceIds:string[]}[];
 limitations:string[];
}
export function validateConsolidatedClosure(release:Release,closure:ConsolidatedClosure,records:EvidenceRecord[],invalidations:EvidenceInvalidation[]=[]){
 validateRelease(release,true);
 if(!closure||closure.milestone!==release.milestone||closure.version!==release.version||closure.sourceCommit!==release.sourceCommit||closure.releaseUrl!==`https://github.com/alimobrem/agentci/releases/tag/v${release.version}`)throw new Error('Closure release identity mismatch');
 for(const proof of [closure.requirementAudit,closure.retrospective])if(!proof||!safePath(proof.path)||! /^(?:releases|docs|delivery\/acceptance)\//.test(proof.path)||! /\.(json|md)$/.test(proof.path)||!/^[a-f0-9]{64}$/.test(proof.sha256))throw new Error('Closure audit/retrospective proof missing');
 if(!Array.isArray(closure.limitations)||closure.limitations.some(item=>typeof item!=='string'||!item.trim()))throw new Error('Closure limitations must be explicit');
 if(!Array.isArray(closure.gates)||closure.gates.length!==release.gates.length||new Set(closure.gates.map(g=>g.id)).size!==closure.gates.length)throw new Error('Closure gate mapping incomplete');
 const accepted=(id:string,coverage:string)=>{
  const record=records.find(record=>record.id===id);
  if(!record||record.sourceCommit!==release.sourceCommit||!record.coverage.includes(coverage)||reusableEvidence(record,records,invalidations)?.id!==id)throw new Error(`Closure requires current accepted evidence for ${coverage}`);
  return record;
 };
 const used=new Map<string,EvidenceRecord>();
 for(const gate of release.gates){
  const mapped=closure.gates.find(value=>value.id===gate.id);
  if(!mapped||!Array.isArray(mapped.evidenceIds)||new Set(mapped.evidenceIds).size!==mapped.evidenceIds.length)throw new Error('Closure gate mapping incomplete');
  if(gate.id==='closure'||gate.status==='inapplicable'){
   if(mapped.evidenceIds.length)throw new Error('Closure cannot recursively attest itself or claim inapplicable evidence');
  }else{
   if(!mapped.evidenceIds.length)throw new Error(`Missing closure evidence for ${gate.id}`);
   for(const id of mapped.evidenceIds)used.set(id,accepted(id,`gate:${gate.id}`));
  }
 }
 if(!closure.demo||!Number.isFinite(Date.parse(closure.demo.deliveredAt)))throw new Error('Delivered success/failure demo required');
 for(const [id,coverage] of [[closure.demo.successEvidenceId,'demo:success'],[closure.demo.failureEvidenceId,'demo:failure']] as const)used.set(id,accepted(id,coverage));
 return [...used.values()];
}
