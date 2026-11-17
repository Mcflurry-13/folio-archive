import test from 'node:test';import assert from 'node:assert/strict';
import {enforceTopicPurpose,recruitmentIds} from '../lib/topic-purpose.mjs';
const evidence={id:'ad',kind:'source',quote:'AI interaction research'};
const body={blocks:[{id:'ad',kind:'source',text:'我们团队招实习生啦！岗位是交互系统研究，欢迎申请。'}],topics:[{id:'i',name:'Interactive prototypes'},{id:'c',name:'Career development'}]};
test('hiring purpose controls representatives and assignments after evidence validation',()=>{
 const r=enforceTopicPurpose({topics:[{id:'i',name:'Interactive prototypes',evidence:[evidence,{id:'tutorial',quote:'Build it'}]},{id:'c',name:'Career development',evidence:[]}]},body);
 assert.deepEqual(r.topics[0].evidence,[{id:'tutorial',quote:'Build it'}]);assert.deepEqual(r.topics[1].evidence,[evidence]);
 assert.equal(enforceTopicPurpose({assignments:[{id:'ad',topicId:'i',evidence}]},body).assignments[0].topicId,'c');
 assert.equal(enforceTopicPurpose({assignments:[{id:'ad',topicId:'i',evidence}]},{...body,topics:body.topics.slice(0,1)}).assignments.length,0);
});
test('whole-post inventory survives an interaction-only quote; user notes and technology keywords do not classify',()=>{
 assert.ok(recruitmentIds({inventory:[{id:'ad',excerpt:body.blocks[0].text}]}).has('ad'));
 assert.equal(recruitmentIds({blocks:[{...body.blocks[0],kind:'user_note'}]}).size,0);
 assert.equal(recruitmentIds({blocks:[{id:'tutorial',kind:'source',text:'Adobe XD tutorial: build a recruitment-site prototype, connect the Apply button and preview transitions.'}]}).size,0);
 assert.ok(recruitmentIds({blocks:[{id:'ad',kind:'source',text:"We're hiring research interns. Apply with a CV. You will build interactive AI agents."}]}).has('ad'));
});
