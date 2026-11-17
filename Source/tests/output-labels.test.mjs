import {test} from 'node:test';
import assert from 'node:assert/strict';
import {outputLabel} from '../public/output-labels.js';
test('output labels follow user intent, not depth alone or reference/model wording',()=>{
 assert.equal(outputLabel('我收藏过哪些交互效果适合放在首页？',[],'focused')[0],'首页交互建议');
 assert.equal(outputLabel('Which saved interactions suit my homepage?',[],'focused')[1],'Homepage interaction ideas');
 assert.equal(outputLabel('怎么用 Three.js 做首屏滚动相机动画？',[],'focused')[0],'实施步骤');
 assert.equal(outputLabel('How do I write a resume entry?',[],'focused')[1],'Implementation steps');
 assert.equal(outputLabel('帮我写项目介绍，并说明参考了什么',[],'focused')[0],'文案草稿');
 assert.equal(outputLabel('帮我做个人网站',[],'explore')[0],'建议方向');
 assert.equal(outputLabel('这个是什么？',[{role:'assistant',text:'Write a draft'}],'focused')[0],'回答');
});
test('follow-up facts preserve output type; new task changes it; borrowed review is not a task',()=>{
 const goal='帮我写 Folio 案例页';
 const history=[{role:'assistant',draft:'怎么做网站'},{role:'user',text:'我负责信息架构和前端实现。'}];
 assert.equal(outputLabel(goal,history,'focused')[0],'文案草稿');
 history.push({role:'user',text:'我收藏过哪些交互效果适合放在首页？'});
 assert.equal(outputLabel(goal,history,'focused')[0],'首页交互建议');
 history.push({role:'user',text:'我确认这是真的：怎么做网站',borrowedReview:{kind:'fact'}});
 assert.equal(outputLabel(goal,history,'focused')[0],'首页交互建议');
 assert.equal(outputLabel(goal,history.slice(0,2),'focused')[0],'文案草稿');
});


test('the real evaluation resume request replaces the homepage interaction label',()=>{
 assert.deepEqual(outputLabel('我收藏过哪些交互效果适合放在首页？',[{role:'user',text:'帮我改这段简历经历：参与了学校选课系统的重设计项目，负责部分界面设计，和团队一起完成了用户调研。'}],'focused'),['文案草稿','Text draft']);
});
