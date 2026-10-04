import {minimatch} from 'minimatch';
import {parseYaml} from '../project/index.ts';
import {analyze,requirementImpact} from '../review/engine.ts';
import type {ReviewInput,Snapshot} from '../review/types.ts';
import {safeEvalPath,selectSuites,suiteRevision,validateEvalSuite,type EvalSuite} from './contracts.ts';

export interface CatalogEntry {path:string;suite:EvalSuite}
/** Repository manifests are parsed as data; engine configurations and test source are never imported. */
export function suiteCatalog(snapshot:Snapshot):CatalogEntry[] {
  const project=parseYaml(snapshot.files['agentci.yaml']??'') as {spec?:{evals?:{include?:unknown}}};
  const patterns=project?.spec?.evals?.include;
  if(!Array.isArray(patterns)||patterns.some(p=>typeof p!=='string'||!safeEvalPath(p,true)))throw new Error('Invalid eval catalog selectors');
  const entries:CatalogEntry[]=[],ids=new Set<string>();
  for(const path of Object.keys(snapshot.files).sort()){
    if(!patterns.some(p=>minimatch(path,p,{dot:true,nonegate:true,nocomment:true}))||! /\.(?:ya?ml|json)$/i.test(path))continue;
    const value=/\.json$/i.test(path)?JSON.parse(snapshot.files[path]!):parseYaml(snapshot.files[path]!);
    if(!value||typeof value!=='object'||Array.isArray(value))continue;
    if(!('kind' in value&&value.kind==='EvalSuite')&&!('apiVersion' in value&&value.apiVersion==='agentci.io/v1alpha1'))continue;
    const suite=validateEvalSuite(value);
    if(ids.has(suite.metadata.id))throw new Error('Duplicate suite identity across catalog files');
    ids.add(suite.metadata.id);entries.push({path,suite});
  }
  return entries;
}
export interface SuiteChange {suite:string;kind:'added'|'removed'|'modified';baseRevision?:string;headRevision?:string;removedScenarios:string[];addedScenarios:string[]}
export function planComparison(input:ReviewInput) {
  const analysis=analyze(input),requirements=requirementImpact(input),base=suiteCatalog(input.base),head=suiteCatalog(input.head);
  const changes:SuiteChange[]=[];
  for(const id of [...new Set([...base,...head].map(e=>e.suite.metadata.id))].sort()){
    const b=base.find(e=>e.suite.metadata.id===id)?.suite,h=head.find(e=>e.suite.metadata.id===id)?.suite;
    const baseRevision=b?suiteRevision(b):undefined,headRevision=h?suiteRevision(h):undefined;
    if(baseRevision===headRevision)continue;
    changes.push({suite:id,kind:!b?'added':!h?'removed':'modified',...(baseRevision?{baseRevision}:{}),...(headRevision?{headRevision}:{}),removedScenarios:b?.spec.scenarios.filter(s=>!h?.spec.scenarios.some(x=>x.id===s.id)).map(s=>s.id)??[],addedScenarios:h?.spec.scenarios.filter(s=>!b?.spec.scenarios.some(x=>x.id===s.id)).map(s=>s.id)??[]});
  }
  const impact={changes:analysis.changes,requirementIds:requirements.changed};
  const selected=selectSuites(base.map(e=>e.suite),impact),newSuites=selectSuites(head.filter(e=>!base.some(b=>b.suite.metadata.id===e.suite.metadata.id)).map(e=>e.suite),impact).suites;
  const suites=[...new Map([...selected.suites,...base.filter(e=>changes.some(c=>c.suite===e.suite.metadata.id)).map(e=>e.suite),...newSuites].map(s=>[s.metadata.id,s])).values()].sort((a,b)=>a.metadata.id.localeCompare(b.metadata.id));
  const coverageGaps=[...new Set([...requirements.changed.filter(id=>!suites.some(s=>s.spec.requirements.includes(id))),...[...base,...head].flatMap(e=>e.suite.spec.requirements.filter(id=>!requirements.known.includes(id)))])].sort();
  return {analysis,suites,suiteChanges:changes,coverageGaps,selectionGaps:selected.selectionGaps,baseSha:input.base.sha,headSha:input.head.sha};
}
