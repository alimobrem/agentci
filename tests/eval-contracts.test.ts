import test from 'node:test';import assert from 'node:assert/strict';
import {validateEvalSuite,validateEvalRun,suiteRevision,selectSuites,safeEvalPath,type EvalRun,type EvalClass} from '../packages/evals/contracts.ts';
import {evalSuite} from './fixtures/evals.ts';
test('eval contract is strict, immutable and preserves explicit argv including repeated args',()=>{
  const suite=evalSuite();suite.spec.runner.command=['node','-e','same','same'];
  const copy=validateEvalSuite(suite);assert.deepEqual(copy,suite);copy.metadata.id='other';assert.equal(suite.metadata.id,'behavior');
  assert.match(suiteRevision(suite),/^sha256:[a-f0-9]{64}$/);assert.equal(suiteRevision(suite),suiteRevision(structuredClone(suite)));
  assert.throws(()=>validateEvalSuite({...suite,token:'secret'}),/Invalid/);
  assert.throws(()=>validateEvalSuite({...suite,spec:{...suite.spec,trials:{...suite.spec.trials,count:0}}}),/Invalid/);
  assert.throws(()=>validateEvalSuite({...suite,spec:{...suite.spec,trials:{...suite.spec.trials,passRate:1.1}}}),/Invalid/);
});
test('eval manifests reject duplicate scenarios, escaping paths and ambiguous exit-code assertions',()=>{
  const suite=evalSuite();suite.spec.scenarios.push({...suite.spec.scenarios[0]!,critical:false});assert.throws(()=>validateEvalSuite(suite),/Duplicate/);
  for(const path of ['../secret','/etc/passwd','C:/secret','x\\secret','!safe','a//b','a/./b'])assert.equal(safeEvalPath(path,true),false,path);
  assert.throws(()=>validateEvalSuite(evalSuite({impact:{categories:[],include:['../secret']}})),/Unsafe/);
  assert.throws(()=>validateEvalSuite(evalSuite({scenarios:[{id:'one'},{id:'two'}]})),/exactly one/);
  assert.throws(()=>validateEvalSuite(evalSuite({runner:{adapter:'native',command:['node','check.mjs'],timeoutMs:1000}})),/structured/);
  assert.throws(()=>validateEvalSuite(evalSuite({runner:{adapter:'pytest',command:['python','-m','pytest'],report:'../../report.xml',timeoutMs:1000}})),/Unsafe/);
});
test('critical safety suites default to zero violations and cannot loosen that threshold',()=>{
  assert.equal(validateEvalSuite(evalSuite({class:'safety'})).spec.trials.maxCriticalFailures,undefined);
  assert.throws(()=>validateEvalSuite(evalSuite({class:'safety',trials:{count:20,passRate:0.95,confidenceMethod:'wilson',maxCriticalFailures:1}})),/cannot tolerate/);
});
test('impact selection includes required tool, model, permission and implementation classes and reports gaps',()=>{
  const suite=(id:string,cl:EvalClass,extra={})=>evalSuite({class:cl,impact:{categories:[],include:[]},...extra},id);
  const catalog=[evalSuite(),suite('contract','contract'),suite('tool','tool-use'),suite('policy','policy'),suite('adversarial','adversarial'),suite('safety','safety'),suite('representative','golden',{representative:true,models:['a','b']}),suite('unit','unit'),suite('regression','regression')];
  const selected=(category:string)=>selectSuites(catalog,{changes:[{path:'changed/file',categories:[category]}],requirementIds:[]}).suites.map(s=>s.metadata.id);
  assert.deepEqual(selected('tool'),['contract','tool']);assert.deepEqual(selected('model'),['representative']);assert.deepEqual(selected('permission'),['adversarial','policy','safety']);assert.deepEqual(selected('source'),['regression','unit']);
  assert.deepEqual(selectSuites(catalog,{changes:[{path:'prompts/system.md',categories:['prompt']}],requirementIds:[]}).suites.map(s=>s.metadata.id),['behavior']);
  const spec=selectSuites(catalog,{changes:[{path:'specs/r.yaml',categories:['specification']}],requirementIds:['REQ-001','REQ-MISSING']});assert.equal(spec.suites.length,catalog.length);assert.deepEqual(spec.coverageGaps,['REQ-MISSING']);
  assert.throws(()=>selectSuites([evalSuite(),evalSuite()],{changes:[],requirementIds:[]}),/Duplicate suite/);
  assert.throws(()=>selectSuites(catalog,{changes:[{path:'../secret',categories:[]}],requirementIds:[]}),/Unsafe/);
});
test('normalized results cannot hide infrastructure errors, skipped trials, count or identity contradictions',()=>{
  const result:EvalRun={apiVersion:'agentci.io/v1alpha1',kind:'EvalRun',id:'00000000-0000-4000-8000-000000000001',suite:'behavior',revision:suiteRevision(evalSuite()),subject:{repository:'example/repo',gitSha:'a'.repeat(40)},trials:20,status:'passed',scenarios:[{id:'safe-response',passed:20,failed:0,errors:0,skipped:0,criticalFailures:0,status:'passed',passRate:1}],artifacts:[]};
  assert.deepEqual(validateEvalRun(result),result);
  const mutate=(change:Record<string,unknown>)=>({...result,scenarios:[{...result.scenarios[0]!,...change}]});
  assert.throws(()=>validateEvalRun(mutate({passed:19,skipped:1})),/Incomplete/);
  assert.throws(()=>validateEvalRun(mutate({passed:19,errors:1,status:'failed'})),/Infrastructure/);
  assert.throws(()=>validateEvalRun(mutate({passed:19,failed:1,passRate:1})),/pass rate/);
  assert.throws(()=>validateEvalRun(mutate({passed:21})),/counts/);
  assert.throws(()=>validateEvalRun({...result,subject:{...result.subject,gitSha:'main'}}),/Invalid/);
});
test('model-impact selection reports missing representative suites and incomplete model matrices',()=>{
  const impact={changes:[{path:'models/route.json',categories:['model']}],requirementIds:[]};
  assert.deepEqual(selectSuites([evalSuite()],impact).selectionGaps,['missing-representative-suite']);
  assert.deepEqual(selectSuites([evalSuite({representative:true})],impact).selectionGaps,['missing-model-matrix:behavior']);
  assert.deepEqual(selectSuites([evalSuite({representative:true,models:['a','b']})],impact).selectionGaps,[]);
});
