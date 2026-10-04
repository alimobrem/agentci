import {minimatch} from 'minimatch';
import {parseYaml} from '../project/index.ts';
import {canonical,digest} from '../review/engine.ts';
import type {Snapshot} from '../review/types.ts';
import {safeEvalPath,suiteRevision,type EvalSuite} from './contracts.ts';

/** Freeze assertions independently from the subject; never infer subject source from command argv. */
export function baselineHarness(suite:EvalSuite,assertions:Snapshot,subject:Snapshot):{snapshot:Snapshot;revision:string;paths:string[]} {
  if(!/^[a-f0-9]{40}$/.test(assertions.sha))throw new Error('Exact assertion commit required');
  let patterns:string[]=[];
  if(assertions.files['agentci.yaml']){
    const project=parseYaml(assertions.files['agentci.yaml']) as {spec?:{evals?:{include?:unknown}}};
    const includes=project?.spec?.evals?.include;
    if(!Array.isArray(includes)||includes.some(p=>typeof p!=='string'||!safeEvalPath(p,true)))throw new Error('Invalid baseline eval selectors');
    patterns=includes;
  }
  const paths=[...new Set([...Object.keys(assertions.files).filter(path=>patterns.some(pattern=>minimatch(path,pattern,{dot:true,nonegate:true,nocomment:true}))),...(suite.spec.runner.harness??[])])].sort();
  if(paths.some(path=>!safeEvalPath(path)||assertions.files[path]===undefined))throw new Error('Missing or unsafe baseline harness input');
  const files={...subject.files};
  // Newly introduced assertion files in the baseline namespace must not affect an existing comparison.
  for(const path of Object.keys(files))if(patterns.some(pattern=>minimatch(path,pattern,{dot:true,nonegate:true,nocomment:true}))&&!paths.includes(path))delete files[path];
  for(const path of paths)Object.defineProperty(files,path,{value:assertions.files[path]!,enumerable:true,writable:true,configurable:true});
  const revision=digest(canonical({manifest:suiteRevision(suite),inputs:paths.map(path=>({path,digest:digest(assertions.files[path]!)}))}));
  return {snapshot:{sha:subject.sha,files},revision,paths};
}
