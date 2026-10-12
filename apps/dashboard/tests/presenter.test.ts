import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ReviewDetail} from '../components/review-detail';
const examples=JSON.parse(await readFile(new URL('../../../specs/api/drafts/model-review-examples.json',import.meta.url),'utf8'));
test('single review presenter preserves exact identity, unknown coverage, synthetic notice and cancellation truth',()=>{const html=renderToStaticMarkup(createElement(ReviewDetail,{data:{admission:examples.request,status:{...examples.statuses.queued,execution:{...examples.statuses.queued.execution,cancelRequested:true}},findings:[],evidence:'unavailable'}}));for(const text of [examples.request.subject.repository,examples.request.subject.headSha,examples.request.subject.baseSha,examples.request.id,examples.request.profile.revision,'Unknown','Missing evidence does not establish success','live provider validation unverified','cleanup is not established'])assert.ok(html.includes(text),text);assert.ok(!html.includes('passed'));assert.match(html,/role="tablist"/);assert.match(html,/role="tab"/);});
test('completed refusal is not a clean review; exact role coverage remains visible',()=>{const html=renderToStaticMarkup(createElement(ReviewDetail,{data:{admission:examples.request,status:examples.statuses.completedWithRefusal,findings:[],evidence:'retained'}}));for(const text of ['completed','0/1 roles','security','refused','not a passing status'])assert.ok(html.includes(text),text);assert.ok(!html.includes('Review passed'));});
