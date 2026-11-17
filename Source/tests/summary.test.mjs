import test from 'node:test';import assert from 'node:assert/strict';
import {summarySource,summaryHash,currentSummary,validateSummaryResults} from '../public/summary-data.js';
import {summarize} from '../lib/summarize.mjs';
const note={id:'a',title:'Case structure',content:'Start with the design decision, then explain the research evidence that informed that decision.'};
test('summary cache invalidates source edits but survives media, topic and personal-note edits',()=>{
 const hash=summaryHash(note),cache={a:{hash,status:'ready'}};
 assert.ok(currentSummary(cache,{...note,images:['data:image/png;base64,aa'],category:'New',note:'My own interpretation'}));
 assert.equal(currentSummary(cache,{...note,content:note.content+' Changed.'}),null);
});
test('link-only, title-only, metadata and image-only materials cannot become text summaries',async()=>{
 for(const content of ['https://example.com','![](https://example.com/image.jpg)',note.title,'原文链接: https://example.com\n---\n\n---\n图片链接: https://example.com/image.jpg'])assert.equal(summarySource({...note,content}).useful,false);
 assert.equal((await summarize({items:[{id:'b',title:'A long invented title with no supporting body',content:''}]})).summaries[0].status,'insufficient');
});
test('summary grounding rejects unknown IDs, invented quotes, malformed translations and duplicate output',()=>{
 const item=summarySource(note),good={id:'a',status:'ready',zh:'方法：先展示设计决策，再解释研究依据。',en:'Method: lead with the decision, then explain its research evidence.',evidence:'Start with the design decision'};
 assert.equal(validateSummaryResults({summaries:[good,good,{...good,id:'b'},{...good,evidence:'not here'},{...good,en:''}]},[item]).length,1);
 assert.equal(validateSummaryResults({summaries:[{...good,evidence:'not here'}]},[item]).length,0);
});
import {cardLineProblem,evidenceOptions} from '../public/summary-data.js';
import {cleanSourceText,mediaFormat,clipSentence,previewText} from '../public/card-text.js';
test('card lines are one finished sentence that fits the card; nothing is trimmed to fit',()=>{
 assert.equal(cardLineProblem('提示词：让 AI 从三种屏幕尺寸检查界面。','zh'),'');
 assert.equal(cardLineProblem('提问：先用 AI 在 Figma 出整套 UI 再交给 Codex 是否更好，讨论在评论区。','zh'),'');
 assert.equal(cardLineProblem('Prompt: test three screen sizes, touch and a slow network.','en'),'');
 assert.equal(cardLineProblem('提示词：检查界面…','zh'),'ellipsis');
 assert.equal(cardLineProblem('提示词：检查界面','zh'),'not a finished sentence');
 assert.equal(cardLineProblem('这是一个非常非常长的中文句子，'.repeat(4)+'。','zh'),'too long');
 assert.equal(cardLineProblem('Method: test sizes. Then fix touch.','en'),'more than one sentence');
 assert.equal(cardLineProblem('The author describes a review prompt for interfaces.','en'),'describes the post instead of the takeaway');
 assert.equal(cardLineProblem('本文介绍了一个检查界面的提示词。','zh'),'describes the post instead of the takeaway');
});
test('card input drops provenance notes and the cut build-time excerpt, and the program decides the format',()=>{
 const x={id:'x1',title:'T',content:'Source: https://x.com/a/status/1\nAuthor: A (@a)\nPublished: 2026-10-29T12:00:00+00:00\nRecord type: Curated public-post summary, not a personal bookmark.\n\n---\n\nGenerate interaction experiments from rules and keep the ones you like.\n\nCurated source summary; not a verbatim transcript.\n\n## Short source excerpt\n\n> Made myself an interaction lab. It’s a system …\n\n---\n\n## Original media links\n\n- video: https://video.twimg.com/a.mp4\n\nText and metadata retrieved through FxTwitter. Full thread, linked pages and image contents not analyzed.'};
 const s=summarySource(x);
 assert.equal(s.format,'video');assert.ok(!/Curated|Short source excerpt/.test(s.content));assert.match(s.content,/^Post opening \(cut short in the source\): Made myself an interaction lab/m);assert.match(s.content,/Generate interaction experiments/);
 assert.equal(summarySource({...s}).format,'video','format survives the client to server hop');
 assert.equal(mediaFormat({content:'正文\n![Saved image](/collection/v1/images/a.webp)'}),'image');
 assert.equal(mediaFormat({content:'导出说明: 本篇为视频笔记'}),'video');
 assert.equal(mediaFormat({content:'just text'}),'text');
 assert.equal(cleanSourceText('A.\n\n## Short source excerpt\n\n> cut …\n\nB.'),'A.\n\nB.');
 assert.equal(previewText('姗姗来迟的教程～有不明白的可以评论区见#AI玩家 #Vibecoding玩家'),'姗姗来迟的教程～有不明白的可以评论区见');
 assert.equal(clipSentence('First sentence here. Second one is a little longer than the budget allows.',40).text,'First sentence here.');
});
test('a card must cite a supporting sentence, not a heading or label',()=>{
 const item=summarySource({id:'p',title:'Prompt share',content:'Here is the prompt I used.\n👉Prompt\nA minimalist character, head only, floating on an off-white background.'});
 const card={id:'p',status:'ready',zh:'提示词：生成极简风格的漂浮头像角色。',en:'Prompt: a minimalist floating head character.'};
 assert.equal(validateSummaryResults({summaries:[{...card,evidence:'👉Prompt'}]},[item]).length,0);
 assert.equal(validateSummaryResults({summaries:[{...card,evidence:'A minimalist character, head only, floating on an off-white background.'}]},[item]).length,1);
});
test('the post format is not a kind, and a label line is not evidence',()=>{
 assert.equal(cardLineProblem('视频：用规则生成交互实验。','zh'),'does not start with a kind from the list');
 assert.equal(cardLineProblem('视频教程：用规则生成交互实验。','zh'),'does not start with a kind from the list');
 assert.equal(cardLineProblem('招聘通知：洛杉矶道奇队招聘定量分析师。','zh'),'does not start with a kind from the list');
 assert.equal(cardLineProblem('Video: generate interaction experiments from rules.','en'),'does not start with a kind from the list');
 assert.equal(cardLineProblem('方法：用规则生成交互实验，按喜欢的示例沉淀偏好库。','zh'),'');
 const item=summarySource({id:'t',title:'Hiring',content:'我们在招人。\n目前开放这几个实习岗位：\n音频算法实习生、产品经理实习生、品牌市场实习生。'});
 const card={id:'t',status:'ready',zh:'招聘：Twiddle 招音频算法、产品和品牌市场实习生。',en:'Hiring: Twiddle seeks audio, product and brand interns.'};
 assert.equal(validateSummaryResults({summaries:[{...card,evidence:'目前开放这几个实习岗位：'}]},[item]).length,0);
 assert.equal(validateSummaryResults({summaries:[{...card,evidence:'音频算法实习生、产品经理实习生、品牌市场实习生。'}]},[item]).length,1);
});
test('readers never see the cut opening; the card writer does',()=>{
 const body='Summary sentence.\n\n## Short source excerpt\n\n> Good prompt to polish your app, enjoy. Test …';
 assert.equal(cleanSourceText(body),'Summary sentence.');
 assert.match(cleanSourceText(body,{keepOpening:true}),/Post opening \(cut short in the source\): Good prompt/);
});
test('a label line is quoted together with the content under it, as one exact span',()=>{
 const content='我们正在找队友。\n目前开放这几个实习岗位：\n🎧 音频算法实习生\n💡 产品经理实习生\n📣 品牌市场实习生\n如果你感兴趣，欢迎把简历发给我们。\n👉Prompt\nA minimalist character, head only, floating on an off-white background.\n活动 10.30–11.29 进行中。';
 const opts=evidenceOptions(content);
 assert.ok(opts.every(o=>content.includes(o)));
 const roles=opts.find(o=>o.includes('目前开放'));assert.match(roles,/品牌市场实习生/);assert.match(roles,/欢迎把简历发给我们。$/);
 assert.match(opts.find(o=>o.startsWith('👉Prompt')),/A minimalist character/);
 assert.ok(opts.some(o=>o.includes('10.30–11.29')),'a date is not a sentence end');
});
test('a question card says the discussion is in the comments',()=>{
 assert.equal(cardLineProblem('提问：先在 Figma 出整套 UI 再交给 Codex 是否更好？','zh').startsWith('question')||cardLineProblem('提问：先在 Figma 出整套 UI 再交给 Codex 是否更好？','zh')==='not a finished sentence',true);
 assert.equal(cardLineProblem('提问：先在 Figma 出整套 UI 再交给 Codex 是否更好，讨论在评论区。','zh'),'');
 assert.equal(cardLineProblem('Question: whether to design the UI in Figma before Codex.','en'),'question card does not point to the comments');
});
test('Chinese and English cards name the same kind from the list',()=>{
 const item=summarySource({id:'k',title:'K',content:'Vercel project cards can now show a metric you choose from several monitoring areas.'});
 const card={id:'k',status:'ready',zh:'案例：Vercel 项目卡片可显示自选的监控指标。',evidence:'Vercel project cards can now show a metric you choose from several monitoring areas.'};
 assert.equal(validateSummaryResults({summaries:[{...card,en:'Example: Vercel project cards show a metric you choose.'}]},[item]).length,1);
 assert.equal(validateSummaryResults({summaries:[{...card,en:'Tool: Vercel project cards show a metric you choose.'}]},[item]).length,0);
});
