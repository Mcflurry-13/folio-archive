import test from 'node:test';import assert from 'node:assert/strict';
import {reviewInput,validateReview,reviewEvidence,attachReviewEvidence} from '../lib/topic-review.mjs';
const topics=[{id:'web',name:'网站制作',purpose:'构建网站',rule:'网站布局'},{id:'career',name:'职业发展',purpose:'招聘',rule:'职业机会'}];
const note={id:'n',title:'Build a personal website',source:'A practical guide to layout and hierarchy.',user_note:''};
const why={zh:'正文说明页面布局方法，适合网站制作。',en:'The source explains page layout, fitting website building.'};
const input={notes:[note],topics};
const c={topicId:'web',reason:why,evidenceKind:'source',quote:'guide to layout and hierarchy'};
test('review scope is bounded and discards unrelated fields',()=>{assert.deepEqual(reviewInput({...input,secret:'ignored'}),input);assert.throws(()=>reviewInput({...input,notes:Array(5).fill(note)}));assert.throws(()=>reviewInput({...input,notes:[note,note]}));});
test('suggestions require existing topic, exact same-note evidence, bilingual reason; cap and dedupe',()=>{
 const results=validateReview({results:[{id:'n',candidates:[{...c,topicId:'invented'},{...c,quote:'made up fact'},c,c,{...c,evidenceKind:'title',quote:'personal website',topicId:'career'}]}]},input);
 assert.equal(results[0].candidates.length,1);assert.equal(results[0].candidates[0].topicId,'web');assert.equal(results[0].candidates[0].evidenceKind,'source');
 assert.equal(validateReview({results:[{id:'another',candidates:[c]}]},input)[0].candidates.length,0);
});
test('title-only suggestions remain labelled title, and no-fit is not padded',()=>{const i={notes:[{...note,source:''}],topics};const r=validateReview({results:[{id:'n',candidates:[c,{...c,evidenceKind:'title',quote:'personal website'}]}]},i);assert.equal(r[0].candidates.length,1);assert.equal(r[0].candidates[0].evidenceKind,'title');assert.equal(validateReview({results:[]},i)[0].candidates.length,0);});
test('recruitment guard corrects purpose without weakening exact source verification',()=>{const n={...note,source:'We are hiring summer interns. Apply with your resume.'};const r=validateReview({results:[{id:'n',candidates:[{...c,quote:'We are hiring summer interns.'}]}]},{notes:[n],topics});assert.equal(r[0].candidates[0].topicId,'career');assert.match(r[0].candidates[0].reason.en,/career/);});

test('evidence IDs attach exact source text and reject a different note',()=>{const notes=[note,{...note,id:'other'}];const options=reviewEvidence({notes,topics});const good=options.find(x=>x.id==='n'&&x.kind==='source');const bad=options.find(x=>x.id==='other');const r=attachReviewEvidence({results:[{id:'n',candidates:[{topicId:'web',reason:why,evidenceId:good.evidenceId},{topicId:'career',reason:why,evidenceId:bad.evidenceId}]}]},options);assert.equal(r.results[0].candidates.length,1);assert.equal(r.results[0].candidates[0].quote,note.source);assert.equal(validateReview(r,input)[0].candidates.length,1);});
