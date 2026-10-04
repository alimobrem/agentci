import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {evalSuite} from '../fixtures/evals.ts';
import {runIsolated} from '../../packages/evals/runner.ts';
import {normalizeTrial} from '../../packages/evals/adapters.ts';
const image=process.env.AGENTCI_TEST_ENGINES_IMAGE;
test('real optional UBI engines: Promptfoo and DeepEval passing assertions, regressions and infrastructure errors',{skip:!image,timeout:120000},async()=>{
  const containers=()=>execFileSync('docker',['ps','-aq','--filter','label=agentci.purpose=eval-runner'],{encoding:'utf8'}).trim();
  const before=containers();
  const promptfoo=evalSuite({runner:{adapter:'promptfoo',command:['promptfoo','eval','-c','evals/promptfoo.yaml'],report:'result.jsonl',timeoutMs:30000},scenarios:[{id:'greeting',selector:'0:0'}]});
  const config="prompts: ['greet']\nproviders: ['exec:node provider.mjs']\ntests:\n  - assert:\n      - type: equals\n        value: hello\n";
  // Exec providers run relative to the config directory, as documented by Promptfoo.
  const provider="import{readFileSync}from'node:fs';console.log(readFileSync('../response.txt','utf8'));";
  for(const [response,expected] of [['hello','passed'],['different','failed']] as const){
    const raw=await runIsolated({sha:'a'.repeat(40),files:{'evals/promptfoo.yaml':config,'evals/provider.mjs':provider,'response.txt':response}},promptfoo,{image:image!});
    assert.equal(raw.status,'completed');assert.equal(raw.exitCode,expected==='passed'?0:100);
    assert.equal(normalizeTrial(promptfoo,raw).results.greeting!.status,expected);
  }
  const absent=await runIsolated({sha:'a'.repeat(40),files:{'evals/promptfoo.yaml':config}},promptfoo,{image:image!});
  assert.equal(absent.exitCode,100);assert.equal(normalizeTrial(promptfoo,absent).results.greeting!.status,'error');
  const deepeval=evalSuite({runner:{adapter:'deepeval',command:['python','-m','pytest','-q','evals/test_example.py'],report:'junit.xml',timeoutMs:30000},scenarios:[{id:'greeting',selector:'evals.test_example.test_greeting'}]});
  for(const [response,expected] of [['hello','passed'],['different','failed']] as const){
    const code=`from pathlib import Path\nfrom deepeval import assert_test\nfrom deepeval.test_case import LLMTestCase\nfrom deepeval.metrics import ExactMatchMetric\ndef test_greeting():\n    assert_test(LLMTestCase(input='greet',actual_output=Path('response.txt').read_text(),expected_output='hello'),[ExactMatchMetric()],run_async=False)\n`;
    const raw=await runIsolated({sha:'b'.repeat(40),files:{'evals/test_example.py':code,'response.txt':response}},deepeval,{image:image!});
    assert.equal(raw.status,'completed');assert.equal(raw.exitCode,expected==='passed'?0:1);
    assert.equal(normalizeTrial(deepeval,raw).results.greeting!.status,expected);
  }
  const broken=await runIsolated({sha:'b'.repeat(40),files:{'evals/test_example.py':'import agentci_missing_test_dependency\n'}},deepeval,{image:image!});
  assert.equal(broken.exitCode,2);assert.equal(normalizeTrial(deepeval,broken).error,'pytest-execution-error');
  assert.equal(containers(),before,'engine containers must be removed after success, regression and infrastructure error');
});
