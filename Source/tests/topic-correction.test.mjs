import test from 'node:test';
import assert from 'node:assert/strict';
import {resetSamplePreclassification,ADOBE_ID} from '../public/topic-correction.js';
const seed={id:ADOBE_ID,title:'Adobe recruitment',content:'Hiring',category:'未分类',note:'',images:[]};
const old={...seed,category:'职业发展'};
const other={id:'other',category:'未分类',note:'Keep this note'};
test('fresh sample stays unclassified without creating topics or correction metadata',()=>{
 const items=[seed,other],k={};const r=resetSamplePreclassification(items,k,[seed]);
 assert.equal(r.changed,false);assert.equal(r.items,items);assert.equal(r.knowledge,k);
});
test('untouched legacy seed is restored once with a backup; other records and draft are untouched',()=>{
 const k={draft:[{id:'career',name:'职业发展',evidence:[]}]};const before=structuredClone(k);
 const r=resetSamplePreclassification([old,other],k,[seed]);assert.equal(r.changed,true);assert.deepEqual(r.items,[seed,other]);assert.equal(r.items[1],other);assert.deepEqual(k,before);assert.deepEqual(r.knowledge.draft,k.draft);
 assert.deepEqual(Object.values(r.knowledge.corrections)[0].itemBefore,old);
 assert.equal(resetSamplePreclassification([old,other],r.knowledge,[seed]).changed,false);
});
test('manual edits, registered categories, confirmed runs, ambiguous history and deletion are preserved',()=>{
 for(const [items,k,cats] of [
  [[],{},[]],[[{...old,note:'My note'}],{},[]],[[{...old,content:'Edited'}],{},[]],[[{...old,category:'Custom'}],{},[]],
  [[old],{},['职业发展']],[[old],{organization:{rows:[]}},[]],[[old],{undo:[{id:ADOBE_ID}]},[]],[[old],{confirmedTopics:[{id:'c'}]},[]],[[old],{assignments:[{id:ADOBE_ID}]},[]],
  [[old,{...other,category:'My topic'}],{},[]],[[old],{corrections:{'adobe-career-20261115':{itemBefore:{...seed,category:'交互原型'}}}},[]]
 ])assert.equal(resetSamplePreclassification(items,k,[seed],cats).changed,false);
});
test('tracked old automatic correction from unsorted may be reversed without discarding its backup',()=>{
 const k={corrections:{'adobe-career-20261115':{itemBefore:seed}}};const r=resetSamplePreclassification([old],k,[seed]);
 assert.equal(r.items[0].category,'未分类');assert.deepEqual(r.knowledge.corrections['adobe-career-20261115'],k.corrections['adobe-career-20261115']);
});
