import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {knowledgeRequest} from '../lib/knowledge-agent.mjs';
import {chunks,sourceView} from '../public/knowledge.js';
import {ADOBE_ID} from '../public/topic-correction.js';
const data=JSON.parse(await readFile('public/collection/v1/library.json','utf8'));
const adobe=data.items.find(x=>x.id===ADOBE_ID);
const items=[adobe,...data.items.filter(x=>/零基础自制Agent|Twiddle 招人|分享两天vibecoding/.test(x.title)).slice(0,4)];
const blocks=chunks(items),runs=[];
const topics=[{id:'career',name:'职业发展'},{id:'interaction',name:'交互原型'},{id:'web',name:'网站制作'}];
for(const language of ['zh','en']){
 const proposed=await knowledgeRequest({mode:'kb-topics',blocks,topics,language});
 const evidence=proposed.topics.flatMap(t=>t.evidence);
 const taxonomy=await knowledgeRequest({mode:'kb-taxonomy',topics:proposed.topics,approvedTopics:topics,evidence,inventory:items.map(x=>({id:x.id,title:x.title,excerpt:sourceView(x).body.slice(0,500)})),language});
 const assigned=await knowledgeRequest({mode:'kb-assign',topics,blocks,language});
 const row={language,items:items.map(x=>({id:x.id,title:x.title})),proposed,taxonomy,assigned};runs.push(row);
 console.log(language,JSON.stringify({representatives:taxonomy.topics.map(t=>({name:t.name,ids:t.evidence.map(e=>e.id)})),assignments:assigned.assignments.map(a=>({id:a.id,topicId:a.topicId,reason:a.reason}))}));
}
// Counterexample fixture: a tutorial can mention Adobe/recruitment without becoming a job advertisement.
const counter=[{id:'tutorial',blockId:'tutorial:source:0',kind:'source',text:'Adobe XD tutorial: build a recruitment-site prototype. Draw two artboards, link the Apply button to the form, and set a tap transition. Preview and test keyboard navigation. This teaches interface prototyping; it is not a job opening.'}];
runs.push({counterexample:await knowledgeRequest({mode:'kb-assign',topics,blocks:counter,language:'en'})});
await mkdir('test-output/classification',{recursive:true});await writeFile('test-output/classification/live.json',JSON.stringify(runs,null,2));
console.log('Saved full classification outputs');

for(const run of runs.filter(x=>x.language)){assert.equal(run.assigned.assignments.find(a=>a.id===ADOBE_ID)?.topicId,'career');assert.ok(run.taxonomy.topics.every(t=>t.name==='职业发展'||t.evidence.every(e=>e.id!==ADOBE_ID)));}
assert.equal(runs.at(-1).counterexample.assignments[0]?.topicId,'interaction');
console.log('PASS bilingual hiring classification, no interaction representative, tutorial counterexample');
