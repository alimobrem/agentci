import test from 'node:test';import assert from 'node:assert/strict';
import{readFileSync}from'node:fs';import{parse,stringify}from'yaml';
import{evalSuite}from'./fixtures/evals.ts';
import{planComparison,suiteCatalog}from'../packages/evals/plan.ts';
const config=parse(readFileSync(new URL('../agentci.yaml',import.meta.url),'utf8'));
config.spec.specifications.include=['specs/**'];config.spec.evals.include=['evals/**'];
const fixture=()=>({'agentci.yaml':stringify(config),'specs/r.yaml':stringify({id:'REQ-001',title:'Behavior',type:'functional',status:'active',text:'Expected behavior.'}),'evals/suite.yaml':stringify(evalSuite()),'check.mjs':'process.exit(0)'});
const input=(before:Record<string,string>,after:Record<string,string>)=>({repository:'example/repo',base:{sha:'a'.repeat(40),files:before},head:{sha:'b'.repeat(40),files:after}});
test('changing or removing suite selectors cannot erase baseline assertions',()=>{
 const base=fixture(),head={...base};const hidden=structuredClone(config);hidden.spec.evals.include=['other/**'];head['agentci.yaml']=stringify(hidden);
 const plan=planComparison(input(base,head));assert.equal(plan.suites.length,1);assert.equal(plan.suiteChanges[0]!.kind,'removed');assert.deepEqual(plan.suiteChanges[0]!.removedScenarios,['safe-response']);
 const weakened=evalSuite({trials:{count:1,passRate:0,confidenceMethod:'wilson'}});head['agentci.yaml']=base['agentci.yaml'];head['evals/suite.yaml']=stringify(weakened);
 const modified=planComparison(input(base,head));assert.equal(modified.suiteChanges[0]!.kind,'modified');assert.equal(modified.suites[0]!.spec.trials.count,20);assert.equal(modified.suites[0]!.spec.trials.passRate,0.95);
});
test('spec changes select mapped suites and expose uncovered or unknown requirements',()=>{
 const base=fixture(),head={...base,'specs/r.yaml':stringify({requirements:[{id:'REQ-001',title:'Changed',type:'functional',status:'active',text:'Changed behavior.'},{id:'REQ-NEW',title:'New',type:'functional',status:'active',text:'New behavior.'}]})};
 const plan=planComparison(input(base,head));assert.equal(plan.suites.length,1);assert.deepEqual(plan.coverageGaps,['REQ-NEW']);
 const bad=evalSuite({requirements:['UNKNOWN']});head['evals/suite.yaml']=stringify(bad);assert.ok(planComparison(input(base,head)).suiteChanges.some(c=>c.kind==='modified'));
 const unknownBase={...base,'evals/suite.yaml':stringify(bad)};assert.ok(planComparison(input(unknownBase,head)).coverageGaps.includes('UNKNOWN'));
});
test('added suites and removed scenarios remain explicit; malformed and duplicated catalog data fail',()=>{
 const base=fixture(),head={...base,'evals/new.json':JSON.stringify(evalSuite({},'new-suite'))};
 assert.ok(planComparison(input(base,head)).suiteChanges.some(c=>c.kind==='added'&&c.suite==='new-suite'));
 assert.throws(()=>suiteCatalog({sha:'a'.repeat(40),files:{...base,'evals/duplicate.yaml':base['evals/suite.yaml']}}),/Duplicate/);
 assert.throws(()=>suiteCatalog({sha:'a'.repeat(40),files:{...base,'evals/suite.yaml':stringify({...evalSuite(),kind:'Typo'})}}),/Invalid/);
});
