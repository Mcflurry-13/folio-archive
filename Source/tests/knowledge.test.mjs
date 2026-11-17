import test from 'node:test';import assert from 'node:assert/strict';import {sourceView,chunks,batches,makeBundle,validateBundle} from '../public/knowledge.js';import {validateKBOutput} from '../lib/knowledge-agent.mjs';import {spawnSync} from 'node:child_process';import {mkdtempSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
test('metadata and tags are not source evidence',()=>{const x={id:'1',title:'Title',content:'# Title\n原文链接: https://example.com\n---\n#作品集 #设计\n---\n图片链接: https://example.com/a.png'};assert.equal(sourceView(x).body,'');assert.equal(chunks([x]).length,0);assert.equal(sourceView({...x,note:'My reason'}).status,'user-note');});
test('all 100 sources and late long-text evidence survive batching',()=>{const xs=Array.from({length:100},(_,i)=>({id:String(i),title:'t',content:'project narrative '+i}));assert.equal(new Set(batches(chunks(xs)).flat().map(x=>x.id)).size,100);assert.ok(chunks([{id:'long',content:'x'.repeat(9000)+'END EVIDENCE'}]).some(b=>b.text.includes('END EVIDENCE')));});
test('saved AI output is not independent source',()=>{assert.equal(chunks([{id:'a',content:'invented fact',note:'在“找灵感”中生成，含 AI 建议。'}]).length,0);});
test('reject fabricated quotes and wrong evidence identity',()=>{const b={mode:'kb-search',blocks:[{id:'a',blockId:'a:source:0',kind:'source',text:'A coherent narrative.'}]};const ok={id:'a',blockId:'a:source:0',kind:'source',quote:'coherent narrative',use:'story',limitation:''};assert.equal(validateKBOutput({candidates:[ok,{...ok,id:'b'},{...ok,quote:'invented fact'}]},b).candidates.length,1);});
test('CLI reads only selected authorized records',()=>{const task={goal:'case page',selectedIds:['a'],excludedIds:[],confirmedDirections:'',rejectedDirections:'no 3D'};const b=makeBundle(task,[{id:'a',title:'A',content:'source evidence'},{id:'b',title:'B',content:'private'}],{recommendations:[],missing:[]});assert.equal(b.materials.length,1);assert.throws(()=>validateBundle({...b,allowedIds:['b']}));const dir=mkdtempSync(join(tmpdir(),'folio-cli-')),file=join(dir,'bundle.json');writeFileSync(file,JSON.stringify(b));const good=spawnSync(process.execPath,['cli/folio.mjs','read','--bundle',file,'--id','a'],{encoding:'utf8'});assert.equal(good.status,0);const bad=spawnSync(process.execPath,['cli/folio.mjs','read','--bundle',file,'--id','b'],{encoding:'utf8'});assert.equal(bad.status,1);assert.match(bad.stderr,/outside/);});
test('v0.7 answer: draft kept only with verified references, one per note, three at most',()=>{
 const ev=id=>({id,blockId:id+':source:0',kind:'source',quote:'先写范围再写判断'});const body={mode:'kb-answer',evidence:['a','b','c','d'].map(ev)};
 const rec=id=>({title:'第一句',advice:'照这个顺序写',tradeoff:'',evidence:[ev(id)]});
 const ok=validateKBOutput({status:'ready',summary:'改写后的经历',draft:'负责【待补充：页面】的重设计',recommendations:[rec('a'),rec('a'),rec('b'),rec('c'),rec('d')],missing:[],nextStep:''},body);
 assert.equal(ok.recommendations.length,3);assert.deepEqual(ok.recommendations.map(r=>r.evidence[0].id),['a','b','c']);assert.match(ok.draft,/待补充/);
 const fake=validateKBOutput({status:'ready',summary:'x',draft:'invented',recommendations:[{...rec('a'),evidence:[{...ev('a'),quote:'杜撰的原文'}]}],missing:[],nextStep:''},body);
 assert.equal(fake.status,'no_match');assert.equal(fake.draft,'');
});
test('v0.7 answer: the model explanation for an image request survives no_match',()=>{
 const r=validateKBOutput({status:'no_match',summary:'Folio 只读收藏里的文字，没有看过这些图片。',draft:'',recommendations:[],missing:[],nextStep:'把色值粘贴给我。'},{mode:'kb-answer',evidence:[]});
 assert.equal(r.status,'no_match');assert.match(r.summary,/没有看过这些图片/);assert.equal(r.draft,'');
});
test('bundle carries the current draft and rejects a malformed one',()=>{
 const task={goal:'g',selectedIds:['a'],excludedIds:[],confirmedDirections:'',rejectedDirections:''};
 const b=makeBundle(task,[{id:'a',title:'A',content:'source evidence'}],{draft:'草稿 【待补充：结果】',recommendations:[],missing:[]});
 assert.equal(b.draft,'草稿 【待补充：结果】');assert.throws(()=>validateBundle({...b,draft:42}));
});
test('reference numbers and copied sentences in the draft are flagged when the user never said them',async()=>{
 const {borrowedFromReferences}=await import('../lib/knowledge-agent.mjs');
 const refs=[{id:'r',quote:'独立负责结算流程重设计，将步骤从五步减到三步，可用性测试中完成率从 62% 提升到 88%。'}];
 const user='参与了学校选课系统的重设计项目，负责部分界面设计。';
 const flags=borrowedFromReferences('负责选课系统界面重设计，可用性测试中完成率从 62% 提升到 88%。',user,refs);
 assert.ok(flags.some(f=>f.text==='62%'));assert.ok(flags.some(f=>f.text.includes('可用性测试中完成率从')));assert.ok(flags.every(f=>f.id==='r'));
 assert.equal(borrowedFromReferences('负责选课系统【待补充：哪几个页面】的界面重设计。',user,refs).length,0);
 assert.equal(borrowedFromReferences('完成率从 62% 提升到 88%',user+'完成率从 62% 提升到 88%',refs).length,0);
});
test('answer carries plan steps, depth reaches the model payload, nextStep mirrors the first step',()=>{
 const ev={id:'a',blockId:'a:source:0',kind:'source',quote:'先写范围再写判断'};
 const r=validateKBOutput({status:'ready',summary:'s',draft:'d',plan:['补上页面名称','再试第二个方向','交给 coding agent','多余'],recommendations:[{title:'t',advice:'a',tradeoff:'',evidence:[ev]}],missing:[]},{mode:'kb-answer',evidence:[ev],currentTask:'x'});
 assert.equal(r.plan.length,3);assert.equal(r.nextStep,'补上页面名称');assert.deepEqual(r.borrowed,[]);
});
