import test from 'node:test';
import assert from 'node:assert/strict';
import {answerIssues,knowledgeRequest,userWords,validateKBOutput} from '../lib/knowledge-agent.mjs';
const source={id:'a',blockId:'a:source:0',kind:'source',quote:'先写负责的范围，再写有依据的成果。'};
const body={mode:'kb-answer',depth:'focused',language:'zh',currentTask:'帮我改写简历：负责部分界面设计，和团队一起完成用户调研。',evidence:[source],taskContext:{selectedIds:[],excludedIds:[],history:[{role:'assistant',text:'我完成了十次访谈。'}]}};
const good={status:'ready',outputKind:'copy',question:'',summary:'简历改写。',sections:[{heading:'',text:'负责部分界面设计，与团队共同完成用户调研。',sourceId:'a',use:'保留负责范围。'}],userClaims:[{claim:'负责部分界面设计',userQuote:'负责部分界面设计'},{claim:'与团队共同完成用户调研',userQuote:'和团队一起完成用户调研'}],references:[{evidenceId:'E0',part:'经历',how:'保留负责范围。'}],plan:['补充负责的页面。','确认后再写结果。'],missing:['负责的页面']};
test('facts must be quoted from user input, not an earlier assistant draft',()=>{
 assert.ok(!userWords(body).includes('十次访谈'));
 assert.deepEqual(answerIssues(good,body),[]);
 assert.ok(answerIssues({...good,userClaims:[{claim:'负责部分界面设计',userQuote:'我完成了十次访谈。'}]},body).length);
 assert.ok(answerIssues({...good,outputKind:'directions'},body).length);
 assert.ok(answerIssues({...good,sections:[{heading:'',text:'focused\n一些说明'}]},body).length);
});
test('independent audit repairs an unsupported user activity before delivery',async()=>{
 const oldFetch=globalThis.fetch,oldKey=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test-only-not-a-key';let calls=0;
 globalThis.fetch=async(_url,init)=>{
  const request=JSON.parse(init.body);calls++;let parsed;
  if(calls===1)parsed={...good,sections:[{heading:'',text:'负责界面设计，完成访谈。'}],userClaims:[]};
  if(calls===2){assert.equal(request.text.format.name,'folio_audit');assert.ok(JSON.parse(request.input).userFacts.includes('和团队一起'));parsed={issues:[{code:'user_fact',message:'The user did not say they conducted interviews.'}]};}
  if(calls===3){assert.ok(JSON.parse(request.input).correctionRequired.length);parsed=good;}
  if(calls===4)parsed={issues:[]};
  return new Response(JSON.stringify({model:'mock',output:[{content:[{type:'output_text',text:JSON.stringify(parsed)}]}]}),{status:200});
 };
 try{const r=await knowledgeRequest(body);assert.equal(calls,4);assert.match(r.draft,/共同完成用户调研/);assert.ok(!r.draft.includes('访谈'));assert.equal(r.quality.repaired,true);assert.equal(r.promptVersion,'folio-kb-0.8.8');}finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;}
});
test('unresolved audit issues block an unverified output rather than passing it through',async()=>{
 const oldFetch=globalThis.fetch,oldKey=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test-only-not-a-key';let calls=0;
 globalThis.fetch=async(_url,init)=>{calls++;const q=JSON.parse(init.body);const parsed=q.text.format.name==='folio_audit'?{issues:[{code:'user_fact',message:'Unsupported personal activity.'}]}:good;return new Response(JSON.stringify({model:'mock',output:[{content:[{type:'output_text',text:JSON.stringify(parsed)}]}]}));};
 try{const r=await knowledgeRequest(body);assert.equal(calls,4);assert.equal(r.draft,'');assert.equal(r.status,'no_match');assert.equal(r.quality.blocked,true);}finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;}
});
test('no-match never retains a draft simply because a reference is present',()=>{
 const r=validateKBOutput({status:'no_match',summary:'No relevant tutorial',draft:'invented API steps',recommendations:[{evidence:[source]}]},body);assert.equal(r.draft,'');assert.deepEqual(r.recommendations,[]);
});
test('latest explicit task is separated from the original goal; anchor matching uses body, not title',async()=>{
 const {latestRequest,anchoredBlocks}=await import('../lib/knowledge-agent.mjs');
 assert.equal(latestRequest({currentTask:'网站\n简历\n补充文字',taskContext:{goal:'网站'}}),'简历\n补充文字');
 assert.equal(latestRequest({currentTask:'网站',taskContext:{goal:'网站'}}),'网站');
 const blocks=[{id:'a',title:'Three.js 教程',text:'更多见视频'},{id:'b',text:'Three.js uses a camera path.'},{id:'c',text:'Figma colors.'}];
 assert.deepEqual(anchoredBlocks({blocks,anchorTerms:['Three.js']}).map(b=>b.id),['b']);
 assert.equal(anchoredBlocks({blocks}).length,3);
});


test('image-request scope disclosure is supplied by the program even when the model omits it', async()=>{
 const {discloseTextOnly}=await import('../lib/knowledge-agent.mjs');
 const zh=discloseTextOnly({summary:'建议暖中性色。',draft:'背景偏暖。'},{currentTask:'照截图配色',language:'zh'});
 assert.match(zh.summary,/尚未分析图片或视频/); assert.equal(zh.draft,'背景偏暖。');
 assert.match(discloseTextOnly({summary:'Use warm neutrals.'},{currentTask:'Use my screenshot colors',language:'en'}).summary,/have not been analyzed/);
 assert.equal(discloseTextOnly({summary:'改写。'},{currentTask:'改写简历',language:'zh'}).summary,'改写。');
});


test('copy preserves an explicitly partial responsibility',()=>{
 const issues=answerIssues({status:'ready',outputKind:'copy',sections:[{heading:'',text:'负责界面设计'}],plan:['补充模块','核对'],userClaims:[]},{depth:'focused',currentTask:'负责部分界面设计'});
 assert.ok(issues.some(x=>x.includes('partial scope')));
});


test('retrieval retains exact neighboring method text only inside the authorized source block',async()=>{
 const {expandEvidenceContext}=await import('../lib/knowledge-agent.mjs');
 const blocks=[{id:'a',blockId:'a:source:0',kind:'source',text:'先导出 glTF，再用 React Three Fiber 加载。滚动驱动相机路径。移动端降级到静态图。'},{id:'b',blockId:'b:source:0',kind:'source',text:'Unrelated private material.'}];
 const c={id:'a',blockId:'a:source:0',kind:'source',quote:'滚动驱动相机路径。'};
 const expanded=expandEvidenceContext(c,blocks);assert.equal(expanded.quote,blocks[0].text);assert.ok(!expanded.quote.includes('private'));
 assert.deepEqual(expandEvidenceContext({...c,id:'missing'},blocks),{...c,id:'missing'});
 const long={...blocks[0],text:'前'.repeat(2000)+'方法步骤'+'后'.repeat(2000)};
 const e=expandEvidenceContext({...c,quote:'方法步骤'},[long]);assert.ok(e.quote.length<=1600);assert.ok(long.text.includes(e.quote));assert.ok(e.quote.includes('方法步骤'));
});
