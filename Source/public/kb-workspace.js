import {newOrganization,planKey,organizationPreview,organizationReviewKey} from './organization-run.js';
import {createRuleEditor} from './rule-editor.js';
import {outputLabel} from './output-labels.js';
import {topicText,topicSource,topicSignature,translationsComplete,setTopicText,attachTranslations,representativeNotes,knownTopicName} from './topic-localization.js';
import {sourceView,chunks,batches,fingerprint,makeBundle,inTopicScope} from './knowledge.js';
import {mediaFormat,clipSentence,previewText,sourceMeta,isLowDetailImage} from './card-text.js';
export function createKnowledgeWorkspace(c,initial={}){
 const {L}=c;const h=(tag,attrs,...children)=>c.h(tag,attrs,...children.flat(Infinity).filter(x=>x!==null&&x!==undefined&&x!==false));let planExpanded=false;let saved=initial.tasks||{},knowledge=initial.knowledge||{},running=false,stop=false,progress='',error='',result=saved.result||null;
 let task=saved.task||{id:crypto.randomUUID(),revision:0,goal:'',constraints:'',preferences:'',confirmedDirections:'',rejectedDirections:'',unresolvedQuestions:'',selectedIds:[],excludedIds:[],scopeIds:null,history:[]};
 let orgAnalysis=null;let reviewSaving=false,reviewLoading=false;let reviewMessage='';
 let sessionRun=0;let host,orgHost;let proposal=knowledge.draft||[],assignments=knowledge.assignments||[],snapshot=knowledge.snapshot||{},orgReviewed=knowledge.reviewed||0;
 let resumePlan=!!proposal.length&&!knowledge.organization&&!knowledge.confirmedTopics?.length;
 const lang=()=>L('zh','en');
 const localized=(t,key)=>topicText(t,key,lang());
 let translating=false,translationError='',translationAttempt='',localizationBackedUp=false;
 async function backupLocalization(){if(localizationBackedUp)return;if(!c.read||!await c.read('knowledgeLocalizationBackup'))await c.write('knowledgeLocalizationBackup',{...structuredClone(knowledge),draft:structuredClone(proposal),assignments:structuredClone(assignments),snapshot:structuredClone(snapshot),reviewed:orgReviewed});localizationBackedUp=true;}
 async function ensureTranslations(force=false){
  if(translating||running||resumePlan)return;
  const all=[...proposal,...(knowledge.confirmedTopics||[])];
  const missing=[...new Map(all.filter(t=>t.name?.trim()&&!translationsComplete(t)).map(t=>[topicSignature(t),t])).values()].slice(0,12);
  if(!missing.length)return;const signature=JSON.stringify(missing.map(topicSignature));if(!force&&signature===translationAttempt)return;
  translationAttempt=signature;translating=true;translationError='';drawOrg();
  try{
   await backupLocalization();
   const input=missing.map((t,i)=>({id:'translation-'+i,...topicSource(t)}));
   const response=await c.request({mode:'kb-translate-topics',topics:input});
   let applied=0;
   for(let i=0;i<missing.length;i++){
    const translated=response.topics?.find(t=>t.id===input[i].id);if(!translated)continue;
    for(const current of [...proposal,...(knowledge.confirmedTopics||[])])if(topicSignature(current)===topicSignature(input[i])){const updated=attachTranslations(current,translated);if(translationsComplete(updated)){current.translations=updated.translations;applied++;}}
   }
   await persistK();c.topicsChanged?.();
   if(!applied||[...proposal,...(knowledge.confirmedTopics||[])].some(t=>t.name?.trim()&&!translationsComplete(t)))translationError=L('部分分类翻译未完成，原有分类已保留。','Some translations are incomplete. Original topics are preserved.');
  }catch(e){translationError=L('分类翻译暂未完成：','Topic translation is not ready: ')+e.message;}
  finally{translating=false;drawOrg();}
 }
 async function editTopic(t,key,value){if(running||reviewSaving||reviewLoading)return;const editedLanguage=lang();await backupLocalization();setTopicText(t,key,value,editedLanguage);await persistK();drawOrg();}
 // Reference notes as a dealt hand of covers. One note is shown at a time beside the hand;
 // choosing a card swaps the panel in place (no redraw). Classification evidence is no longer shown
 // (user decision 2026-11-12); it stays stored in knowledge.draft / confirmedTopics.
 const dealt=new Set(),activeRef=new Map();let fanWatcher=null;
 function watchFan(node,key){
  if(dealt.has(key)||typeof IntersectionObserver==='undefined'){node.classList.add('is-dealt','is-settled');dealt.add(key);return;}
  // is-settled drops the deal stagger so later hover and press answer at once.
  fanWatcher=fanWatcher||new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){const el=e.target;el.classList.add('is-dealt');dealt.add(el.dataset.fanKey);fanWatcher.unobserve(el);setTimeout(()=>el.classList.add('is-settled'),500+70*el.children.length);}},{threshold:.6});
  node.dataset.fanKey=key;fanWatcher.observe(node);
 }
 const REF_MAX=3;
 const cjkHeavy=s=>(s.match(/[\u3400-\u9fff\u3040-\u30ff]/g)||[]).length>s.length*.3;
 const siteName=x=>{try{const host=new URL(x.url).hostname.replace(/^www\./,'');return /(^|\.)(x|twitter)\.com$/.test(host)?'X':/(xiaohongshu|xhslink)\.com$/.test(host)?L('小红书','RedNote'):host;}catch{return '';}};
 function representativeList(t){
  // AI-cited notes first, then other notes already filed under this topic, three at most.
  const notes=representativeNotes(t.evidence);const members=c.items().filter(x=>t.name&&x.category===t.name);
  for(const x of members){if(notes.length>=REF_MAX)break;if(!notes.some(g=>g.id===x.id))notes.push({id:x.id,evidence:[]});}
  if(!notes.length)return null;
  const key=t.id||t.name,n=notes.length;if(!notes.some(g=>g.id===activeRef.get(key)))activeRef.set(key,notes[0].id);
  const cards=[],panels=[],titles=[];let swiped=false,fan=null;
  // pile[slot] = note index; slot 0 is the front-left place. A click raises a card where it lies; a swipe deals the next card forward from underneath.
  let pile=notes.map((g,i)=>i);{const a=notes.findIndex(g=>g.id===activeRef.get(key));if(a>0)pile=[...pile.slice(a),...pile.slice(0,a)];}
  // The chosen card sits in front at full size; the others tuck behind it and show an edge. Card, text and the opened note always share one id.
  // Cards sit side by side with a slight overlap, in pile order. Each step is wide enough that every card keeps a visible strip on both sides, whatever its proportion.
  // The chosen card rises above its neighbours where it lies; cards further from it sit lower in the stack.
  const layout=()=>{if(!fan)return;const ai=notes.findIndex(g=>g.id===activeRef.get(key)),as=pile.indexOf(ai);const ars=pile.map(i=>+cards[i].style.getPropertyValue('--ar')||1);const xa=[0];for(let s=1;s<n;s++)xa[s]=xa[s-1]+Math.max(0,ars[s-1]-ars[s]);
   notes.forEach((g,i)=>{const on=i===ai,slot=pile.indexOf(i);const st=cards[i].style;st.setProperty('--r',slot);st.setProperty('--k',slot-(n-1)/2);st.setProperty('--xa',xa[slot].toFixed(3));st.setProperty('--z',on?20:10-Math.abs(slot-as));st.setProperty('--lift',on?'-8px':'0px');cards[i].setAttribute('aria-pressed',String(on));cards[i].setAttribute('aria-label',(on?L('打开：','Open: '):L('显示：','Show: '))+titles[i]);panels[i].hidden=!on;});
   const reach=order=>{const r=order.map(i=>+cards[i].style.getPropertyValue('--ar')||1);let x=0;for(let k=1;k<n;k++)x+=Math.max(0,r[k-1]-r[k]);return x+r[n-1];};
   fan.style.setProperty('--fw',Math.max(...pile.map((_,k)=>reach([...pile.slice(k),...pile.slice(0,k)]))).toFixed(3));};
  const select=id=>{activeRef.set(key,id);layout();};
  const slotOf=()=>pile.indexOf(notes.findIndex(g=>g.id===activeRef.get(key)));
  // swipe or sideways scroll: the next card in the pile comes to the front, the cards before it go to the back
  const deal=d=>{const k=(slotOf()+d+n)%n;pile=[...pile.slice(k),...pile.slice(0,k)];select(notes[pile[0]].id);};
  // arrow keys: move to the neighbouring card in place, like a click
  const step=d=>select(notes[pile[(slotOf()+d+n)%n]].id);
  notes.forEach((group,i)=>{
   const x=c.items().find(x=>x.id===group.id);const title=x?.title||group.id;titles.push(title);const cover=x&&c.coverOf?c.coverOf(x):'';const active=activeRef.get(key)===group.id;
   const body=x?previewText(sourceView(x).body):'';const {author,date}=x?sourceMeta(x,L,c.language?.()||(L('zh','en'))):{};const format=x?mediaFormat(x):'text';
   const summary=x&&c.summaryOf?c.summaryOf(x):'';const full=summary||body;const clip=clipSentence(full);
   const card=h('button',{type:'button',class:'ref-card','aria-pressed':String(active),style:`--i:${i};--r:${i};--ar:${cover?1.333:.96}`,onclick:e=>{if(swiped){swiped=false;e.preventDefault();return;}if(activeRef.get(key)===group.id)c.openItem(group.id);else select(group.id);}});
   // No usable picture: a small card says who wrote it, when, and what kind of post it is. The takeaway sits beside the hand, so nothing is repeated.
   const doc=state=>{card.classList.remove('is-loading');card.classList.add('is-doc');card.style.setProperty('--ar','.96');
    const kind=state==='failed'?L('图片未能加载','Image did not load'):state==='blank'?L('视频帖 · 封面无画面','Video post · blank cover'):format==='video'?L('视频帖','Video post'):body?L('文字帖','Text post'):L('只有链接','Link only');
    card.replaceChildren(h('span',{class:'ref-doc-author'},author||siteName(x||{})||L('未知作者','Unknown author')),h('span',{class:'ref-doc-site'},[author?siteName(x||{}):'',date].filter(Boolean).join(' · ')),h('span',{class:'ref-doc-kind'},kind));layout();};
   if(cover){card.classList.add('is-loading');const img=new Image();img.alt='';img.decoding='async';img.referrerPolicy='no-referrer';img.onload=()=>{if(format==='video'&&isLowDetailImage(img))return doc('blank');card.classList.remove('is-loading');const ar=img.naturalWidth&&img.naturalHeight?img.naturalWidth/img.naturalHeight:1.333;card.style.setProperty('--ar',Math.min(1.6,Math.max(.75,ar)).toFixed(3));layout();};img.onerror=()=>doc('failed');img.src=cover;card.append(img);}
   else doc('none');
   cards.push(card);
   const text=h('span',{class:'ref-copy-text'},clip.text);
   const more=clip.clipped?h('button',{type:'button',class:'link ref-more','aria-expanded':'false',onclick:()=>{const open=more.getAttribute('aria-expanded')!=='true';more.setAttribute('aria-expanded',String(open));text.textContent=open?clipSentence(full,cjkHeavy(full)?600:1200).text:clip.text;more.textContent=open?L('收起','Show less'):L('展开','Show more');}},L('展开','Show more')):null;
   const info=[author,siteName(x||{}),date,n>1?`${i+1} / ${n}`:''].filter(Boolean).join(' · ');
   const panel=h('div',{class:'topic-reference'},button(title,()=>c.openItem(group.id)),
    full?h('p',{class:'ref-copy'},summary?h('span',{class:'reading-label',title:L('AI 摘要','AI summary')},'AI'):null,text):h('p',{class:'ref-copy is-empty'},L('只保存了链接，没有正文。打开详情查看原帖。','Link only, no saved text. Open the note for the original post.')),
    format==='video'?h('p',{class:'ref-video-note'},L('视频帖 · Folio 只读了文字','Video post · Folio read only the text')):null,
    info||more?h('p',{class:'ref-meta'},info?h('span',{},info):null,more):null,
   );
   panel.hidden=!active;panels.push(panel);
  });
  fan=h('div',{class:'ref-fan',role:'group','aria-label':L('参考收藏，左右滑动或用方向键切换','Reference notes. Swipe or use arrow keys to switch'),style:`--n:${n}`},...cards);
  if(n>1){
   // Browse by swiping the hand: touch or mouse drag, a sideways trackpad scroll, or arrow keys. No written hint, no dots.
   let startX=null,wheelAt=0,wheelSum=0;
   fan.addEventListener('pointerdown',e=>{startX=e.clientX;swiped=false;});
   fan.addEventListener('pointerup',e=>{if(startX===null)return;const dx=e.clientX-startX;startX=null;if(Math.abs(dx)>24){swiped=true;deal(dx<0?1:-1);setTimeout(()=>{swiped=false;},0);}});
   fan.addEventListener('pointercancel',()=>{startX=null;});
   fan.addEventListener('wheel',e=>{if(Math.abs(e.deltaX)<=Math.abs(e.deltaY))return;e.preventDefault();const now=Date.now();if(now-wheelAt<320)return;wheelSum+=e.deltaX;if(Math.abs(wheelSum)>30){deal(wheelSum>0?1:-1);wheelSum=0;wheelAt=now;}},{passive:false});
   fan.addEventListener('keydown',e=>{if(e.key!=='ArrowRight'&&e.key!=='ArrowLeft')return;e.preventDefault();step(e.key==='ArrowRight'?1:-1);cards[notes.findIndex(g=>g.id===activeRef.get(key))].focus();});
  }
  layout();
  watchFan(fan,key+':'+notes.map(g=>g.id).join(','));
  return h('section',{class:'topic-references'},h('h4',{},L(`参考收藏 · ${n} 篇`,`Reference notes · ${n}`),members.length&&c.showTopic?h('button',{type:'button',class:'link ref-all',onclick:()=>c.showTopic(t.name)},L(`管理全部 ${members.length} 篇`,`Manage all ${members.length}`)):null),
   h('div',{class:'ref-stage'},h('div',{class:'ref-hand'},fan),h('div',{class:'ref-panels'},...panels)));
 }
 const persist=()=>c.write('taskSessions',{task,result,updatedAt:new Date().toISOString()});
 const persistK=()=>c.write('knowledge',{...knowledge,draft:proposal,assignments,snapshot,reviewed:orgReviewed});
 const button=(text,fn,primary=false)=>h('button',{type:'button','aria-label':text,class:primary?'primary':'ghost',onclick:e=>{if(running&&!/停止|Stop/.test(text))return;return fn(e);}},text);
 function download(name,data){const u=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=h('a',{href:u,download:name});a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
 const field=(label,key,rows=2)=>{const input=h('textarea',{rows,value:task[key]||'','aria-label':label,disabled:running,onchange:async e=>{task[key]=e.target.value;task.revision++;await persist();}});return h('label',{class:'field'},label,input);};
 const context=()=>({...task,scopeIds:undefined,history:(task.history||[]).slice(-8)});
 const pool=()=>c.retrievalItems().filter(x=>(task.scopeIds===null||task.scopeIds.includes(x.id))&&!task.excludedIds.includes(x.id));
 async function request(stage,data){return c.request({mode:'kb-'+stage,taskContext:context(),...data});}
 async function search(follow=''){
 if(running)return;error='';if(!task.goal.trim()){error=L('先写下你要完成的任务。','Describe your task first.');draw();return;}
 running=true;progress=L('理解当前任务…','Understanding your task…');draw();if(follow){task.history=[...(task.history||[]),{role:'user',text:follow}];task.revision++;await persist();}stop=false;const run=++sessionRun;const version=task.revision;const available=pool();const input={currentTask:task.goal+(follow?'\n'+follow:'')};
 progress=L('理解当前任务…','Understanding your task…');draw();let evidence=[];let completed=0;let total=0;
 try{const plan=await request('plan',{...input,topicCatalog:[...new Set(available.flatMap(x=>x.topics))]});if(plan.status==='clarify'){result={status:'clarify',question:plan.question,summary:plan.question,draft:'',recommendations:[],missing:[],goal:task.goal};task.history=[...(task.history||[]),{role:'assistant',text:plan.question}];return;}
 const source=inTopicScope(available,plan.topicScope);
 const all=chunks(source);
 input.coverage={authorizedCount:source.length,textCount:new Set(all.map(x=>x.id)).size};
 if(plan.topicScope?.mode && plan.topicScope.mode!=='unrestricted' && !source.length){
  const summary=L('在指定主题和当前资料范围内没有找到收藏。','No saves match those topics in the current collection.');
  result={status:'no_match',summary,recommendations:[],goal:task.goal};task.history.push({role:'assistant',text:summary});return;
 }
 const depth=plan.depth||'';input.outputKind=plan.outputKind||'';input.anchorTerms=plan.anchorTerms||[];const bs=batches(all);total=bs.length;
 for(let i=0;i<bs.length;i++){if(stop)break;progress=L(`检索资料 ${i+1}/${bs.length} 批`,`Searching batch ${i+1}/${bs.length}`);draw();const r=await request('search',{...input,depth,questions:plan.questions,blocks:bs[i]});evidence.push(...r.candidates);completed++;}
 if(stop){error=L('已停止，未生成新的建议。此前任务保留。','Stopped. Previous task remains; no new recommendations generated.');return;}
 // Keep evidence IDs and exact quotes, deduplicate repeated chunks.
 evidence=[...new Map(evidence.map(e=>[e.blockId+'|'+e.quote,e])).values()];
 const reviewed=await request('review',{...input,depth,evidence,questions:plan.questions});evidence=reviewed.evidence;
 progress=L('结合依据形成建议…','Combining evidence…');draw();
 const response=await request('answer',{...input,depth,questions:plan.questions,evidence,coverage:{...input.coverage,readCount:new Set(all.map(b=>b.id)).size,completedBatches:completed,totalBatches:bs.length,missingText:source.length-new Set(all.map(b=>b.id)).size}});
 if(run!==sessionRun||task.revision!==version)throw Error(L('任务已改变，请重新检索。','Task changed; run search again.'));
 knowledge.usesById=knowledge.usesById||{};for(const e of evidence){const uses=knowledge.usesById[e.id]||[];knowledge.usesById[e.id]=[...uses.filter(u=>u.taskId!==task.id),{taskId:task.id,goal:task.goal,use:e.use||'',kind:'AI suggested use',hash:fingerprint(source.find(x=>x.id===e.id)||{})}].slice(-10);}await persistK();
 result={...response,depth,questions:plan.questions,coverage:{total:source.length,read:new Set(all.map(b=>b.id)).size,completed},sourceHashes:Object.fromEntries(source.map(x=>[x.id,fingerprint(x)])),goal:task.goal,follow};task.history=[...(task.history||[]),{role:'assistant',text:response.question||response.summary,draft:response.draft||'',depth,missing:response.missing}];await persist();
 }catch(e){error=L(`本次未完成（已读 ${completed}/${total} 批）：`,`Not completed (${completed}/${total} batches): `)+e.message;}finally{running=false;progress='';await persist();draw();}
 }
 // ---- Conversation view (2026-11-12; reply format folio-kb-0.7, 2026-11-13) ----
 // Each reply: one sentence, the draft (the deliverable itself), up to three saves that shaped it, an iteration plan.
 // Constraints, preferences, confirmed/rejected directions and open questions are agent-design material
 // (system card, journal). They still travel in taskContext and the bundle; the UI no longer asks for them.
 let draft='';
 const noteOf=id=>c.items().find(x=>x.id===id);
 const outputTitle=(depth=result?.depth,history=task.history)=>L(...outputLabel(task.goal,history||[],depth));
 const rejectedTitles=()=>task.rejectedDirections.split('\n').filter(Boolean);
 async function newChat(){if(running)return;if(task.goal.trim()&&!await c.confirm(L('开始新对话？','Start a new chat?'),L('替换当前对话','Replace current chat'),{detail:L('目前只保存一个对话。当前产出和对话会被替换，收藏不会改变。可先导出资料包。','Only one chat is stored. This replaces its outputs and conversation; saved materials stay. Export a hand-off first if needed.')}))return;task={id:crypto.randomUUID(),revision:0,goal:'',constraints:'',preferences:'',confirmedDirections:'',rejectedDirections:'',unresolvedQuestions:'',selectedIds:[],excludedIds:[],scopeIds:task.scopeIds,history:[]};result=null;error='';draft='';await persist();draw();}
 async function send(text){if(running)return;const v=String(text??draft).trim();if(!v){error=L('先写下你要完成的任务。','Describe your task first.');draw();return;}draft='';
  if(!task.goal.trim()){task.goal=v;task.revision++;await persist();await search();}else await search(v);}
 // Placeholders the model leaves for facts only the user knows are highlighted, never filled.
 const GAP=/(【待补充[^】]*】|\[TODO:[^\]]*\])/;
 const withGaps=text=>String(text||'').split(GAP).map((p,i)=>i%2?h('mark',{class:'kb-gap'},p):p);
 async function copy(text,btn){const label=btn.textContent;try{await navigator.clipboard.writeText(text);btn.textContent=L('已复制','Copied');}catch{btn.textContent=L('请手动选择复制','Select to copy');}setTimeout(()=>{btn.textContent=label;},1600);}
 // One row per saved note. v0.7 replies carry one note per reference (part + how);
 // older replies may cite several notes per recommendation, then the search-stage use text is shown.
 function refRows(r){const out=[];const seen=new Set();for(const rec of r?.recommendations||[]){const single=(rec.evidence||[]).length===1;for(const e of rec.evidence||[]){if(seen.has(e.id))continue;seen.add(e.id);out.push({id:e.id,kind:e.kind,part:rec.title,how:single?rec.advice:(e.use||e.quote)});}}return out.slice(0,3);}
 function planSteps(r=result){return [...new Set((r?.plan?.length?r.plan:r?.nextStep?[r.nextStep]:[]).filter(Boolean))].slice(0,3);}
 const reviewedBorrow=b=>(task.history||[]).findLast(t=>t.borrowedReview?.draft===result?.draft&&t.borrowedReview?.text===b.text&&t.borrowedReview?.id===b.id);
 const pendingBorrowed=()=> (result?.borrowed||[]).filter(b=>!reviewedBorrow(b));
 async function reviewBorrow(b,kind){if(running)return;error='';const text=kind==='fact'?L('我确认这是我的事实：','I confirm this is a fact about me: ')+b.text:L('这段仅作为方法参考，不代表我的经历：','Use this only as a reference method, not my experience: ')+b.text;task.history.push({role:'user',text,borrowedReview:{draft:result.draft,text:b.text,id:b.id,kind}});task.revision++;await persist();draw();}
 function borrowedPanel(){if(!result.borrowed?.length)return null;return h('section',{class:'kb-borrowed', 'aria-label':L('核对引用内容','Review borrowed content')},h('h4',{},L('这些内容需要你核对','Please review these passages')),h('p',{class:'fine'},L('来自收藏，尚不能作为你的个人事实。','These appear in saved references and are not established facts about you.')),...result.borrowed.map(b=>{const reviewed=reviewedBorrow(b);return h('div',{class:'borrowed-row'},h('blockquote',{},b.text),h('button',{type:'button',class:'link',onclick:()=>c.openItem(b.id)},noteOf(b.id)?.title||L('查看来源','View source')),reviewed?h('p',{class:'fine',role:'status'},reviewed.borrowedReview.kind==='fact'?L('已确认是我的事实','Confirmed as my fact'):L('已确认仅作方法参考','Confirmed as a reference method')):h('div',{class:'notice-actions'},button(L('仅作方法参考','Reference method only'),()=>reviewBorrow(b,'method')),button(L('这是我的事实','This is my fact'),()=>reviewBorrow(b,'fact')),button(L('需要改写','Needs revision'),()=>{draft=L('请改写回答中这段，不能作为我的经历：','Revise this passage; it is not my experience: ')+b.text;draw();host.querySelector('textarea')?.focus();})));}));}
 async function setExcluded(id,on){if(running)return;task.excludedIds=on?[...new Set([...task.excludedIds,id])]:task.excludedIds.filter(v=>v!==id);if(on)task.selectedIds=task.selectedIds.filter(v=>v!==id);task.revision++;await persist();draw();}
 // Plain Markdown brief for a coding agent: task, current draft, plan, each ticked reference with its link and how to use it.
 function briefMarkdown(includeNotes=true){
  const selected=c.items().filter(x=>task.selectedIds.includes(x.id)&&!task.excludedIds.includes(x.id));
  const rows=refRows(result).filter(r=>includeNotes||r.kind!=='user_note');
  const out=[L('# 任务','# Task'),task.goal,(task.history||[]).filter(t=>t.role==='user').map(t=>'- '+t.text).join('\n')];
  if(task.constraints)out.push(L('## 限制','## Constraints'),task.constraints);
  if(rejectedTitles().length)out.push(L('## 不要的方向','## Rejected directions'),rejectedTitles().map(t=>'- '+t).join('\n'));
  if(result?.draft)out.push('## '+outputTitle()+L('（AI 建议）',' (AI suggestion)'),result.draft);
  if(result?.missing?.length)out.push(L('## 待补充','## Missing facts'),result.missing.map(x=>'- '+x).join('\n'));
  const steps=planSteps();if(steps.length)out.push(L('## 迭代方案','## Iteration plan'),steps.map((s,i)=>`${i+1}. ${s}`).join('\n'));
  out.push(L(`## 参考资料（${selected.length} 篇）`,`## References (${selected.length})`));
  for(const x of selected){const v=sourceView(x);const use=rows.filter(r=>r.id===x.id);out.push('### '+x.title,[x.url?L('链接：','Link: ')+x.url:'',...use.map(u=>L('用在：','Applies to: ')+u.part+'\n'+L('怎么用：','How to use: ')+u.how),includeNotes&&v.note?L('我的笔记：','My note: ')+v.note:''].filter(Boolean).join('\n'),v.body?L('原文节选：\n','Source excerpt:\n')+v.body.slice(0,1200):'');}
  out.push(L('> 参考资料是别人的收藏笔记，只能当作方法参考，不能当作我的项目事实。产出里的【待补充】需要我本人提供，不要猜。','> References are other people’s saved notes. Use them as methods, never as facts about my project. Placeholders in the output need my own facts; do not guess them.'));
  return out.filter(Boolean).join('\n\n');
 }
 function exportBundle(){
 if(pendingBorrowed().length){error=L('先核对产出下方的引用内容，再导出。','Review the borrowed passages below the output before exporting.');draw();host.querySelector('.kb-borrowed')?.scrollIntoView({block:'center'});return;}
 const selected=c.items().filter(x=>task.selectedIds.includes(x.id)&&!task.excludedIds.includes(x.id));
 if(result?.goal&&result.goal!==task.goal){error=L('目标已改变，请更新建议后导出。','Goal changed; update recommendations before exporting.');draw();return;}
 if(!selected.length){error=L('先勾选要带走的参考资料。','Tick the references to take along first.');draw();return;}
 if(selected.some(x=>result?.sourceHashes?.[x.id]&&result.sourceHashes[x.id]!==fingerprint(x))){error=L('所选资料已修改，请重新检索后导出。','Selected sources changed; search again before exporting.');draw();return;}
 const include=h('input',{type:'checkbox',checked:true});const bundle=()=>({...makeBundle(task,c.items(),result,include.checked),plan:planSteps(),userMessages:(task.history||[]).filter(t=>t.role==='user').map(t=>t.text),borrowedReview:(result.borrowed||[]).filter(b=>selected.some(x=>x.id===b.id)).map(b=>reviewedBorrow(b)?.borrowedReview).filter(Boolean)});
 const pre=h('pre',{class:'kb-brief',tabindex:'0'},briefMarkdown(true));include.onchange=()=>{pre.textContent=briefMarkdown(include.checked);};
 const copyBtn=button(L('复制为 Markdown','Copy as Markdown'),()=>copy(pre.textContent,copyBtn));
 const d=h('dialog',{class:'modal kb-export'},h('div',{class:'dialog-inner'},h('h2',{},L('交给 coding agent','Hand off to a coding agent')),h('p',{},L(`包含当前产出、迭代方案和你勾选的 ${selected.length} 篇资料。`,`Contains the current output, the iteration plan and the ${selected.length} references you ticked.`)),pre,h('label',{class:'kb-include'},include,L('包含我的笔记','Include my notes')),h('p',{class:'fine'},L('这是只读快照，不会自动连接编程工具；已复制或下载的内容无法远程撤回。JSON 资料包可用 node cli/folio.mjs context --bundle 读取。','Read-only snapshot. No automatic connection; copied or downloaded content cannot be revoked. The JSON bundle is read with node cli/folio.mjs context --bundle.')),h('div',{class:'notice-actions'},button(L('取消','Cancel'),()=>d.close()),copyBtn,button(L('确认下载','Confirm download'),()=>{download('folio-task.json',bundle());d.close();},true))));document.body.append(d);d.addEventListener('close',()=>d.remove());d.showModal();
 }
 function bubble(role,...children){return h('div',{class:'chat-msg is-'+role},...children);}
 function draftBlock(text,{current=true,depth=result?.depth,history=task.history}={}){
  const copyBtn=h('button',{type:'button',class:'chip'},L('复制','Copy'));copyBtn.onclick=()=>copy(text,copyBtn);
  return h('section',{class:'kb-draft'+(depth==='explore'?' is-explore':' is-focused')+(current?'':' is-old')},h('div',{class:'kb-draft-head'},h('h4',{},outputTitle(depth,history)),copyBtn),h('div',{class:'kb-draft-text'},...withGaps(text)));
 }
 function resultCard(){
  const rows=refRows(result),shown=rows.filter(r=>!task.excludedIds.includes(r.id)),excluded=rows.filter(r=>task.excludedIds.includes(r.id));const steps=planSteps();
  return bubble('agent',h('p',{class:'chat-text'},result.summary||result.question),result.question&&result.question!==result.summary?h('p',{class:'chat-question'},result.question):null,
   result.draft?draftBlock(result.draft):null,
   borrowedPanel(),
   shown.length?h('section',{class:'kb-refs'},h('h4',{},L(`参考了 ${shown.length} 篇收藏`,`Shaped by ${shown.length} saves`)),
    h('ul',{class:'kb-materials'},...shown.map(r=>{const x=noteOf(r.id);const title=x?.title||r.id;const cover=x&&c.coverOf?c.coverOf(x):'';
     const thumb=h('button',{type:'button',class:'kb-thumb'+(cover?'':' is-text'),tabindex:'-1','aria-hidden':'true',onclick:()=>c.openItem(r.id)});
     if(cover){const img=new Image();img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';img.onerror=()=>{img.remove();thumb.classList.add('is-text');};img.src=cover;thumb.append(img);}
     return h('li',{class:'kb-material kb-reference-picks '+(c.topicTone?.(x?.category)||'topic-neutral')},thumb,
      h('div',{class:'kb-material-body'},h('button',{type:'button',class:'kb-material-title',onclick:()=>c.openItem(r.id)},title),
       h('p',{},r.part?h('span',{class:'kb-part'},r.part):null,r.how),
       h('div',{class:'kb-material-foot'},x?.url?h('a',{class:'kb-source-link',href:x.url,target:'_blank',rel:'noopener noreferrer'},L('原文链接','Source link')):null,
        h('button',{type:'button',class:'link kb-exclude','aria-label':L('不要这篇：','Not this one: ')+title,onclick:()=>setExcluded(r.id,true)},L('不要这篇','Not this one')))),
      h('label',{class:'kb-pick',title:L('加入资料包','Add to hand-off')},h('input',{type:'checkbox','aria-label':L('加入资料包：','Add to hand-off: ')+title,disabled:running,checked:task.selectedIds.includes(r.id),onchange:async ev=>{task.selectedIds=ev.target.checked?[...new Set([...task.selectedIds,r.id])]:task.selectedIds.filter(v=>v!==r.id);task.revision++;await persist();draw();}})));}))):null,
   steps.length||excluded.length?h('section',{class:'kb-plan'},h('h4',{},L('迭代方案','Iteration plan')),steps.length?h('ol',{},...steps.map(s=>h('li',{},s))):null,
    result.missing?.length?h('p',{class:'kb-missing'},L('待补充：','Still needed: '),result.missing.join(L('；','; '))):null,
    excluded.length?h('p',{class:'fine'},L('已排除，下一轮不再使用：','Excluded from later rounds: '),...excluded.map((r,i)=>[i?L('、',', '):'',noteOf(r.id)?.title||r.id,' ',h('button',{type:'button',class:'link',onclick:()=>setExcluded(r.id,false)},L('恢复','Restore'))])):null):null,
   result.coverage?h('p',{class:'chat-meta'},L(`检索了 ${result.coverage.total} 条收藏中 ${result.coverage.read} 条的文字 · 引用 ${shown.length} 篇 · 图片和视频未分析`,`Searched text from ${result.coverage.read} of ${result.coverage.total} saves · cited ${shown.length} · images and video not analysed`)):null);
 }
 const STARTERS=()=>[[L('帮我做个人网站','Help me build my personal website'),true],[L('我收藏过哪些交互效果适合放在首页？','Which saved interactions suit my homepage?'),true],[L('找网页配色思路','Find color ideas for my website'),true],[L('修改一段简历经历','Rework a resume entry'),false]];
 function draw(){if(!host)return;const previous=host.querySelector('.chat-thread');const oldScroll=previous?.scrollTop||0;const stickToEnd=!previous||previous.scrollHeight-previous.scrollTop-previous.clientHeight<60||running;const activeLabel=host.contains(document.activeElement)?document.activeElement?.getAttribute('aria-label'):null;const scope=pool(),started=!!task.goal.trim(),picked=task.selectedIds.filter(id=>!task.excludedIds.includes(id)).length;
  const thread=h('div',{class:'chat-thread',tabindex:'0',role:'region','aria-label':L('对话记录','Conversation history')});
  if(!started){
   thread.append(h('div',{class:'chat-empty'},h('h2',{},scope.length?L('想做什么？','What are you working on?'):L('先添加一些收藏','Add your first saves')),h('p',{},!scope.length?L('先导入收藏，再让 Folio 结合内容帮助你完成任务。','Import some saves so Folio has references to use for your task.'):L('写下任务，或直接粘贴你正在改的内容。我会结合收藏，给出建议、步骤或文案，并说明参考了什么。','Describe a task, or paste what you are editing. I use your saves to offer directions, steps or writing, and show the references behind them.')),
    !scope.length?button(L('导入我的收藏','Import my saves'),c.openImporter,true):null,scope.length?h('div',{class:'chat-starters'},...STARTERS().map(([q,now])=>button(q,()=>{if(running)return;if(now){send(q);return;}draft=L('我想修改简历里的这段经历，请改写，并告诉我参考了哪些收藏：\n\n（把你的原文粘贴在这里）','Rework this resume entry and show which saves you used:\n\n(paste your text here)');draw();host.querySelector('.chat-composer textarea')?.focus();}))):null));
  }else{
   const history=task.history||[];let at=-1;if(result)for(let i=history.length-1;i>=0;i--)if(history[i].role==='assistant'&&history[i].text===(result.question||result.summary)){at=i;break;}
   thread.append(bubble('user',h('p',{class:'chat-text'},task.goal)));
   history.forEach((t,i)=>{if(i===at)thread.append(resultCard());else if(t.role==='user')thread.append(bubble('user',h('p',{class:'chat-text'},t.text)));else thread.append(bubble('agent',h('p',{class:'chat-text'},t.text),t.draft?h('details',{class:'kb-old-draft'},h('summary',{},L('查看这轮回答','View this response')),draftBlock(t.draft,{current:false,depth:t.depth,history:history.slice(0,i)})):null));});
   if(result&&at<0&&!running)thread.append(resultCard());
   if(running)thread.append(bubble('agent',h('p',{class:'chat-text chat-progress',role:'status'},progress||L('处理中…','Working…')),button(L('本批结束后停止','Stop after this batch'),()=>{stop=true;})));
  }
  if(error)thread.append(h('div',{class:'kb-error',role:'alert'},h('p',{},error),started&&!running&&!result?button(L('重试','Retry'),()=>search()):null));
  const area=h('textarea',{rows:1,name:started?'follow':'goal',disabled:running,value:draft,'aria-label':started?L('补充材料或调整需求','Add information or adjust your request'):L('我想完成什么','What I want to accomplish'),placeholder:started?L('补充事实，或说哪里要改…','Add facts or request a change…'):L('写下任务，或粘贴要修改的内容…','Describe a task, or paste your draft…'),
   oninput:e=>{draft=e.target.value;e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight+2,220)+'px';},
   onkeydown:e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send(e.target.value);}}});
  host.replaceChildren(
   h('header',{class:'chat-head'},h('h1',{},'Folio Agent'),h('div',{class:'chat-head-actions'},started?button(L('新对话','New chat'),newChat):null,
    result?.recommendations?.length?h('button',{type:'button',class:'primary','aria-label':L('准备开发资料包','Prepare development bundle'),onclick:()=>{if(!running)exportBundle();}},L(`交给 coding agent${picked?` · ${picked} 篇`:''}`,`Hand off${picked?` · ${picked}`:''}`)):null)),
   thread,
   scope.length?h('form',{class:'chat-composer',onsubmit:e=>{e.preventDefault();send(area.value);}},area,
    h('button',{type:'submit',class:'primary chat-send',disabled:running,'aria-label':started?L('继续这个任务','Continue task'):L('找参考并提出建议','Find references and suggestions')},L('发送','Send'))):null,
   h('p',{class:'chat-scope fine'},L(`可检索 ${scope.length} 条收藏的文字、笔记和主题。`,`Searching ${scope.length} saves by text, notes and topics.`),task.scopeIds!==null?h('button',{type:'button',class:'link',onclick:async()=>{if(running)return;task.scopeIds=null;task.revision++;await persist();draw();}},L('改回全部收藏','Use all saves')):null));
  queueMicrotask(()=>{thread.scrollTop=stickToEnd?thread.scrollHeight:oldScroll;if(activeLabel){const target=[...host.querySelectorAll('[aria-label]')].find(n=>n.getAttribute('aria-label')===activeLabel);(target||host.querySelector('textarea'))?.focus({preventScroll:true});}const ta=host.querySelector('.chat-composer textarea');if(ta&&draft){ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight+2,220)+'px';}if(running)host.querySelector('.chat-progress')?.scrollIntoView({block:'nearest'});});
 }
 async function propose(){if(running||reviewSaving)return;resumePlan=false;running=true;stop=false;error='';knowledge.organization=null;const source=c.items();snapshot=Object.fromEntries(source.map(x=>[x.id,fingerprint(x)]));let proposals=[];let evidence=[];orgReviewed=0;orgAnalysis={total:source.length,count:0,phase:'reading',status:'running'};drawOrg();queueMicrotask(()=>orgHost?.querySelector('.org-progress')?.scrollIntoView({block:'start',behavior:'instant'}));
 const approvedTopics=knowledge.confirmedTopics||[];
 try{const blocks=chunks(source),bs=batches(blocks);const noText=source.length-new Set(blocks.map(b=>b.id)).size;orgAnalysis.noText=noText;orgAnalysis.count=noText;for(let i=0;i<bs.length;i++){if(stop)break;progress=L(`正在阅读收藏 · ${orgReviewed} / ${source.length} 篇`,`Reading saves · ${orgReviewed} / ${source.length}`);drawOrg();const r=await request('topics',{blocks:bs[i],topics:approvedTopics});proposals.push(...r.topics);evidence.push(...r.topics.flatMap(t=>t.evidence));orgReviewed=new Set(bs.slice(0,i+1).flat().map(b=>b.id).filter(id=>!bs.slice(i+1).flat().some(b=>b.id===id))).size;orgAnalysis.count=orgReviewed+noText;drawOrg();}
 if(stop){orgAnalysis.status='stopped';return;}orgAnalysis.phase='planning';drawOrg();const r=await request('taxonomy',{topics:proposals,approvedTopics,evidence,inventory:source.map(x=>({id:x.id,title:x.title,excerpt:sourceView(x).body.slice(0,500)})),coverage:{authorizedCount:source.length,readCount:new Set(chunks(source).map(b=>b.id)).size}});proposal=r.topics;assignments=[];knowledge={...knowledge,organization:null};orgAnalysis.status='ready';await persistK();
 }catch(e){error=e.message;orgAnalysis.status='error';}finally{running=false;progress='';drawOrg();}}
 async function allocate(){planExpanded=false;
 if(running||reviewSaving||reviewLoading||!proposal.length)return;
 error='';reviewMessage='';assignments=[];orgAnalysis=null;
 const source=structuredClone(c.items());const run=newOrganization(source,proposal);
 run.previewOnly=true;run.status='preparing';run.rows=source.map(item=>({id:item.id,title:item.title,status:'pending',reason:'preparing',baseFingerprint:fingerprint(item)}));
 knowledge.organization=run;knowledge.confirmedTopics=structuredClone(proposal);knowledge.undo=[];
 await persistK();drawOrg();queueMicrotask(()=>orgHost?.querySelector('.org-progress')?.scrollIntoView({block:'start',behavior:'instant'}));
 }
 async function resumePreparation(){const run=knowledge.organization;if(!run||reviewLoading)return;run.reviewPaused=false;for(const row of run.rows)if(row.review?.status==='error')delete row.review;await persistK();suggestPending();}
 function reviewKey(item){return organizationReviewKey(item,proposal);}
 async function suggestPending(){
 const run=knowledge.organization;if(running||reviewSaving||translating||reviewLoading||!run||run.reviewPaused||run.planKey!==planKey(proposal))return;
 for(const item of c.items())if(run.ids.includes(item.id)&&!run.rows.some(r=>r.id===item.id))run.rows.push({id:item.id,title:item.title,status:'pending',reason:'preparing',baseFingerprint:fingerprint(item)});
 const pending=()=>run.rows.filter(r=>r.status==='pending').map(row=>({row,item:c.items().find(x=>x.id===row.id)})).filter(({row,item})=>item&&(row.review?.key!==reviewKey(item)||(row.review.status==='ready'&&!row.review.candidates.length&&!['folio-topic-review-2','folio-topic-review-3'].includes(row.review.version))));
 if(!pending().length)return;reviewLoading=true;drawOrg();
 try{while(!running&&!reviewSaving&&knowledge.organization===run&&!run.reviewPaused&&run.planKey===planKey(proposal)){
 const group=[];let size=0;for(const x of pending().slice(0,4)){const v=sourceView(x.item);const note={id:x.item.id,title:String(x.item.title||'').slice(0,500),source:v.body.slice(0,60000),user_note:v.note.slice(0,60000)};const n=JSON.stringify(note).length;if(group.length&&size+n>130000)break;size+=n;group.push({...x,key:reviewKey(x.item),note,partial:v.body.length>60000||v.note.length>60000});}
 if(!group.length)break;
 let response,failed=false;try{response=await c.request({mode:'kb-review-topics',notes:group.map(x=>x.note),topics:proposal.map(t=>({id:t.id,name:t.name,purpose:t.purpose||'',rule:t.rule||''}))});}catch{failed=true;}
 if(running||reviewSaving||knowledge.organization!==run||run.planKey!==planKey(proposal))break;
 for(const {row,item,key,partial} of group){const now=c.items().find(x=>x.id===item.id);if(row.status!=='pending')continue;if(!now||reviewKey(now)!==key||(row.baseFingerprint&&fingerprint(now)!==row.baseFingerprint)){row.status='changed';continue;}
 const result=response?.results?.find(x=>x.id===row.id);row.review={key,version:response?.version||'folio-topic-review-3',status:failed||!result?'error':'ready',partial,candidates:(result?.candidates||[]).filter(x=>proposal.some(t=>t.id===x.topicId)).slice(0,1),message:result?.message||null};}
 if(failed||group.some(x=>x.row.review?.status==='error'))run.reviewPaused=true;await persistK();drawOrg();if(run.reviewPaused)break;
 }}finally{if(organizationPreview(run,c.items(),proposal).settled)run.status='complete';reviewLoading=false;await persistK();drawOrg();}
 }
 function reviewSelection(row,item){
 if(!item)return '';const key=reviewKey(item);
 if(row.reviewChoice?.key===key)return proposal.some(t=>t.id===row.reviewChoice.topicId)?row.reviewChoice.topicId:'';
 return row.review?.key===key&&row.review.status==='ready'?row.review.candidates.find(c=>proposal.some(t=>t.id===c.topicId))?.topicId||'':'';
 }
 async function chooseReview(row,item,topicId){
 if(reviewSaving||running||!item)return;
 row.reviewChoice={key:reviewKey(item),topicId};reviewMessage='';await persistK();drawOrg();
 }
 async function confirmReviewBatch(selected,expectedRun){
 if(running||reviewSaving||reviewLoading||knowledge.organization!==expectedRun||!organizationPreview(expectedRun,c.items(),proposal).settled)return;
 const valid=selected.flatMap(s=>{const row=expectedRun.rows.find(r=>r.id===s.id),item=c.items().find(x=>x.id===s.id),topic=proposal.find(t=>t.id===s.topicId);return row?.status==='pending'&&item&&topic&&reviewKey(item)===s.key?[{row,item,topic}]:[];});
 if(!valid.length&&selected.length){reviewMessage=L('内容已变化，请检查当前选择后再采用。','The saves changed. Check your selections before applying.');drawOrg();return;}
 reviewSaving=true;reviewMessage='';drawOrg();
 try{
 const undo=valid.map(({item,topic})=>({id:item.id,before:item.category,after:topic.name}));
 if(undo.length)await c.apply(new Map(undo.map(x=>[x.id,x.after])));
 knowledge.undo=[...(knowledge.undo||[]),...undo];
 for(const {row,topic} of valid){row.status='saved';row.topicId=topic.id;row.resolvedBy='user';delete row.reviewChoice;}
 expectedRun.previewConfirmed=true;expectedRun.status='complete';await persistK();const skipped=selected.length-valid.length;
 reviewMessage=L(`已采用 ${valid.length} 篇${skipped?`；${skipped} 篇内容发生变化，未覆盖`:''}。`,`Applied ${valid.length} saves${skipped?`; ${skipped} changed saves were left untouched`:''}.`);
 }catch(e){reviewMessage=L('保存未完成，未保存的选择仍保留：','Could not finish saving. Unsaved selections are kept: ')+e.message;}
 finally{reviewSaving=false;drawOrg();queueMicrotask(()=>(orgHost?.querySelector('.org-review select')||orgHost?.querySelector('.org-review h3'))?.focus({preventScroll:true}));}
 }
 function reviewQueue(){
 const run=knowledge.organization;if(!run||run.planKey!==planKey(proposal)||running)return null;
 const view=organizationPreview(run,c.items(),proposal);
 // Preparing and failed responses are execution states, never a pile of user decisions.
 if(!view.settled||reviewLoading)return null;
 const selected=view.selected.map(e=>({id:e.row.id,topicId:e.topicId,key:e.key}));
 const itemRow=e=>{const {row,item,review,topicId}=e;const candidate=review.candidates[0]?.topicId===topicId?review.candidates[0]:null;
 return h('article',{class:'org-review-item org-preview-item','data-review-id':row.id},
 h('div',{class:'org-review-copy'},h('button',{type:'button',class:'org-review-title',onclick:()=>c.openItem(row.id)},row.title),h('p',{class:'fine'},candidate?.reason?.[lang()]||review.message?.[lang()]||(topicId?L('你选择的分类。','Your selected topic.'):L('稍后决定。','Decide later.'))),candidate?.evidenceKind==='title'?h('small',{},L('仅依据标题','Based on title only')):null),
 h('div',{class:'org-review-controls'},h('select',{'aria-label':L(`为「${row.title}」选择分类`,`Choose a topic for ${row.title}`),disabled:reviewSaving,onchange:e=>chooseReview(row,item,e.target.value)},h('option',{value:'',selected:!topicId},L('稍后决定','Decide later')),...proposal.map(t=>h('option',{value:t.id,selected:t.id===topicId},localized(t,'name'))))));
 };
 return h('section',{class:'org-review','aria-label':L('完整分类预览','Complete organization preview')},
 h('h3',{tabindex:'-1'},run.previewConfirmed?L('分类已保存','Organization saved'):L('分类已安排好，请确认','Your organization is ready to confirm')),
 h('p',{class:'fine'},run.previewConfirmed?(view.exceptions.length?L(`已确认保存；${view.exceptions.length} 篇暂未归类，可在下方补选，也可以先开始任务。`,`Saved after your confirmation; ${view.exceptions.length} saves remain unclassified. Choose topics below, or start a task now.`):L('全部分类已保存。展开查看收藏，或开始一个任务。','All categories are saved. Open a group to browse, or start a task.')):L('展开分类查看每篇收藏和推荐理由，只修改不合适的。最后点击下方按钮，一起保存。','Open a group to review the saves and reasons. Change anything that does not fit, then save your choices together.')),
 ...proposal.map(topic=>{const proposed=view.selected.filter(e=>e.topicId===topic.id);const saved=run.rows.filter(r=>r.status==='saved'&&r.topicId===topic.id&&c.items().some(x=>x.id===r.id&&x.category===topic.name));if(!proposed.length&&!saved.length)return null;
 return h('details',{class:'org-preview-group','data-preview-topic':topic.id},h('summary',{},h('strong',{},localized(topic,'name')),h('span',{},L([proposed.length?`${proposed.length} 篇待确认`:'',saved.length?`${saved.length} 篇已归类`:''].filter(Boolean).join(' · '),[proposed.length?`${proposed.length} to confirm`:'',saved.length?`${saved.length} categorized`:''].filter(Boolean).join(' · ')))),...proposed.map(itemRow),saved.length?h('details',{class:'org-saved-group'},h('summary',{},L(`查看 ${saved.length} 篇已保存收藏`,`View ${saved.length} saved notes`)),...saved.map(row=>button(c.items().find(x=>x.id===row.id)?.title||row.title,()=>c.openItem(row.id)))):null);
 }),
 view.exceptions.length?h('details',{class:'org-preview-exceptions'},h('summary',{},L(`需要你决定 · ${view.exceptions.length} 篇`,`Needs your decision · ${view.exceptions.length}`)),
 view.exceptions.some(e=>!e.skipped)?h('section',{class:'org-no-fit'},h('h4',{},L(`未能分类 · ${view.exceptions.filter(e=>!e.skipped).length} 篇`,`No matching topic · ${view.exceptions.filter(e=>!e.skipped).length}`)),h('p',{class:'fine'},L('AI 没有找到合适的现有分类。查看原因后，可以直接选择分类、补充正文，或修改分类规则后重新生成预览。','AI found no suitable existing topic. Review the reason, choose a topic, add source text, or edit the rules and regenerate the preview.')),...view.exceptions.filter(e=>!e.skipped).map(itemRow)):null,
 view.exceptions.some(e=>e.skipped)?h('section',{class:'org-skipped'},h('h4',{},L(`你已跳过 · ${view.exceptions.filter(e=>e.skipped).length} 篇`,`Skipped by you · ${view.exceptions.filter(e=>e.skipped).length}`)),h('p',{class:'fine'},L('这些是你选择稍后决定的收藏，可以随时重新选择分类。','You chose to decide on these later. You can select a topic again at any time.')),...view.exceptions.filter(e=>e.skipped).map(itemRow)):null):null,
 !run.previewConfirmed?h('p',{class:'fine'},L('已推荐最相关的主题。每篇收藏可以有多个主题，之后可在详情页添加。','Folio recommends the closest matching topic. You can add more topics in the note details.')):null,
 !run.previewConfirmed||selected.length?h('div',{class:'org-review-bulk'},h('span',{class:'fine',role:'status'},L(`将保存 ${selected.length} 篇 · ${view.exceptions.length} 篇保持原样`,`Save ${selected.length} · leave ${view.exceptions.length} unchanged`)),h('button',{type:'button',class:'primary org-apply-selected',disabled:reviewSaving,onclick:()=>confirmReviewBatch(selected,run)},reviewSaving?L('正在保存…','Saving…'):selected.length?L(`确认并保存 ${selected.length} 篇`,`Confirm and save ${selected.length}`):L('保留原样并完成','Keep unchanged and finish'))):null,
 reviewMessage?h('p',{class:'org-review-feedback',role:'status'},reviewMessage):null);
 }
 function analysisProgress(){
 if(!orgAnalysis)return null;const a=orgAnalysis;
 const title=a.status==='ready'?L('分类方案已准备好','Topic plan ready'):a.status==='error'?L('分析未完成','Analysis interrupted'):a.status==='stopped'?L('分析已停止','Analysis stopped'):a.phase==='planning'?L('正在汇总分类方案','Preparing the topic plan'):L('正在阅读收藏','Reading your saves');
 return h('section',{class:'org-progress org-analysis-progress','aria-label':L('收藏分析进度','Collection analysis progress')},
 h('div',{class:'org-progress-heading'},h('h3',{},title),h('span',{class:'org-progress-count'},`${a.count} / ${a.total}`)),
 h('div',{class:'org-progress-track',role:'progressbar','aria-label':L('已检查的收藏','Saves checked'),'aria-valuemin':0,'aria-valuemax':a.total||1,'aria-valuenow':a.count},h('span',{style:`transform:scaleX(${a.total?a.count/a.total:0})`})),
 h('p',{class:'org-progress-status',role:'status','aria-live':'polite'},a.status==='ready'?L('查看下面的分类方案，确认后为每篇收藏准备分类。','Review the plan below, then confirm to prepare a category for each save.'):a.status==='error'||a.status==='stopped'?L('点击“分析并提出分类方案”重新开始，收藏尚未改动。','Choose Suggest organization to restart. Your saves are unchanged.'):a.phase==='planning'?L('收藏已检查完，正在形成完整方案。','Collection checked. Putting the complete plan together.'):L(`已检查 ${a.count} 篇，正在阅读其余内容。`,`Checked ${a.count} saves. Reading the rest.`)),
 a.noText?h('p',{class:'fine'},L(`${a.noText} 篇缺少可读文字，暂不推断内容。`,`${a.noText} saves have no readable text; their content is not inferred.`)):null);
 }
 function organizationProgress(){
 const run=knowledge.organization;if(!run||run.planKey!==planKey(proposal))return analysisProgress();
 const view=organizationPreview(run,c.items(),proposal),count=view.prepared;
 const confirmed=run.previewConfirmed&&view.settled,paused=run.reviewPaused||view.failed.length;
 const title=confirmed?L('整理完成','Organization complete'):view.settled&&!reviewLoading?L('分类建议已准备好','Organization ready'):paused?L('整理已暂停','Organization paused'):L('正在准备完整分类','Preparing your organization');
 return h('section',{class:'org-progress','aria-label':L('收藏整理进度','Collection organization progress')},
 h('div',{class:'org-progress-heading'},h('h3',{},title),h('span',{class:'org-progress-count'},`${count} / ${run.total}`)),
 h('div',{class:'org-progress-track',role:'progressbar','aria-label':L('已准备的收藏','Saves prepared'),'aria-valuemin':0,'aria-valuemax':run.total||1,'aria-valuenow':count},h('span',{style:`transform:scaleX(${run.total?count/run.total:0})`})),
 h('p',{class:'org-progress-status',role:'status','aria-live':'polite'},confirmed?L('分类已保存，你可以开始使用收藏。','Organization saved. Your collection is ready to use.'):view.settled?L('全部建议已生成。查看下面的分类结果，然后统一确认。','All suggestions are ready. Review the groups below, then confirm together.'):paused?L(`已保留 ${count} 篇结果，继续后只处理剩余内容。`,`Results for ${count} saves are kept. Resume to prepare the rest.`):L(`已准备 ${count} 篇，正在处理其余内容。完成后会展示完整预览。`,`Prepared ${count} saves. Preparing the rest before showing the complete preview.`)),
 !view.settled&&run.rows.length?h('ol',{class:'org-recent-list'},...run.rows.filter(r=>r.status==='saved'||r.review?.status==='ready').slice(-4).reverse().map(r=>h('li',{class:'org-progress-row'},h('span',{class:'org-row-title'},r.title),h('span',{class:'org-row-status'},L('已准备','Prepared'))))):null,
 view.failed.length?h('p',{role:'status',class:'fine'},L(`${view.failed.length} 篇请求失败，这不代表内容无法分类。`,`${view.failed.length} requests failed; this does not mean the saves cannot be categorized.`)):null,
 !view.settled?(paused?h('button',{type:'button',class:'primary',disabled:reviewLoading,onclick:resumePreparation},L('继续整理','Resume organization')):h('button',{type:'button',class:'ghost',onclick:async()=>{run.reviewPaused=true;await persistK();drawOrg();}},L('暂停整理','Pause organization'))):null);
 }
 async function apply(){error='';const accepted=assignments.filter(a=>a.selected);const current=c.items();const valid=accepted.filter(a=>snapshot[a.id]===fingerprint(current.find(x=>x.id===a.id)||{}));const map=new Map(valid.map(a=>[a.id,proposal.find(t=>t.id===a.topicId)?.name]).filter(([,name])=>name?.trim()));knowledge.undo=valid.map(a=>({id:a.id,before:current.find(x=>x.id===a.id).category,after:map.get(a.id)}));await c.apply(map);assignments=assignments.filter(a=>!map.has(a.id));await persistK();error=L(`已整理 ${map.size} 条；${accepted.length-map.size} 条因修改或分类无效跳过。`,`Organized ${map.size}; skipped ${accepted.length-map.size} changed or invalid records.`);drawOrg();}
 async function undoOrganization(){if(reviewSaving)return;const map=new Map(knowledge.undo.filter(u=>c.items().find(x=>x.id===u.id)?.category===u.after).map(u=>[u.id,u.before]));await c.apply(map);knowledge.undo=[];knowledge.organization=null;await persistK();drawOrg();}
 function drawOrg(){if(!orgHost)return;
 if(resumePlan){orgHost.replaceChildren(h('section',{class:'ai-organizer org-resume-entry'},h('h2',{},L('从收藏开始整理','Start with your collection')),h('p',{class:'lede'},L('分析收藏内容，再查看并确认分类方案。','Analyze your saves, then review and confirm an organization plan.')),h('p',{class:'fine'},L('此浏览器保留了上次未确认的方案，你可以继续，也可以重新分析。','This browser has an unconfirmed plan from a previous visit. Continue it or analyze your saves again.')),h('div',{class:'notice-actions'},button(L('分析并提出分类方案','Suggest organization'),propose,true),button(L('继续上次方案','Continue previous plan'),()=>{resumePlan=false;drawOrg();}),button(L('添加收藏','Add saves'),c.openImporter))));return;}
const expanded=[...orgHost.querySelectorAll('.org-preview-group[open]')].map(x=>x.dataset.previewTopic);const exceptionsOpen=!!orgHost.querySelector('.org-preview-exceptions[open]');const focusLabel=orgHost.contains(document.activeElement)?document.activeElement?.getAttribute('aria-label'):null;const arranging=(running&&orgAnalysis?.status==='running')||reviewLoading||(knowledge.organization?.planKey===planKey(proposal)&&!organizationPreview(knowledge.organization,c.items(),proposal).settled);const hasRun=knowledge.organization?.planKey===planKey(proposal);const complete=hasRun&&!!knowledge.organization?.previewConfirmed&&organizationPreview(knowledge.organization,c.items(),proposal).settled;const rulesChanged=!!knowledge.organization&&!hasRun;const showPlan=!arranging&&(!hasRun||planExpanded);const usable=c.items().filter(x=>sourceView(x).body||sourceView(x).note).length;orgHost.replaceChildren(h('section',{class:'ai-organizer'},h('span',{class:'flow-number'},'KNOWLEDGE / ORGANIZE'),h('h2',{},complete?L('你确认的分类已保存','Your categories are saved'):hasRun?L('检查每篇收藏的分类','Review your categories'):proposal.length?L('选择适合你的分类方式','Choose how to organize your saves'):L('先为收藏找到合适的分类','Find topics for your collection')),h('p',{class:'lede'},complete?L('查看结果，或者带着任务使用这些收藏。','Browse the results, or put your collection to work.'):hasRun?(arranging?L('AI 正在逐篇准备建议。全部准备好后，你可以调整并一次保存。','AI prepares a suggestion for each save. Once all are ready, adjust them and save together.'):L('建议已全部准备好。查看分组，只调整不合适的，最后一起保存。','All suggestions are ready. Review the groups, change anything that does not fit, then save together.')):proposal.length?L('这些是 AI 建议的分类名称和规则。你可以修改；下一步会展示每篇收藏的归类结果，确认后才保存。','These are suggested names and rules. Edit them if needed. Next, preview where each save belongs before saving.'):L('AI 会先阅读内容，提出分类方式；再逐篇整理，交给你统一确认。','AI will read your collection, suggest topics, then prepare each save for your review.')),
 !usable?h('p',{class:'org-empty-help'},L('还没有可供分析的文字。请上传 Markdown，或在收藏详情里补充正文。仅有链接时，AI 无法判断内容。','There is no readable text yet. Upload Markdown or add source text in a note’s details. A link alone does not give AI its contents.')):null,
 h('p',{class:'fine'},L(`${c.items().length} 条收藏 · ${usable} 条有可读文字`,`${c.items().length} saves · ${usable} with readable text`)),h('div',{class:'notice-actions'},(!proposal.length||orgAnalysis?.status==='running'||orgAnalysis?.status==='error'||orgAnalysis?.status==='stopped')?h('button',{type:'button',class:'primary',disabled:running||reviewLoading||reviewSaving||translating||!usable,onclick:propose},running?(orgAnalysis?L('正在分析…','Analyzing…'):progress||L('正在整理…','Organizing…')):L('分析并提出分类方案','Suggest organization')):null,button(L('添加收藏','Add saves'),c.openImporter),proposal.length&&!arranging?button(L('重新分析','Start over'),async()=>{if(await c.confirm(L('重新分析分类方式？','Analyze the topics again?'),L('重新分析','Start over'),{detail:L('当前未保存的建议会被替换。已保存的收藏和分类不变。','This replaces the unsaved suggestions. Saved notes and categories stay unchanged.')}))propose();}):null,running&&orgAnalysis?h('button',{type:'button',class:'ghost',onclick:()=>{stop=true;drawOrg();}},L('停止分析','Stop analysis')):null),error?h('p',{role:'status'},error):null,
 rulesChanged?h('p',{class:'org-rule-update',role:'status'},L('规则已更新。请按新规则重新生成预览，之前未保存的选择将被替换；已保存的分类保持不变，直到你再次确认。','Rules updated. Regenerate the preview to use them. This replaces unsaved choices; saved categories stay unchanged until you confirm again.')):null,
 organizationProgress(),reviewQueue(),
 translating?h('p',{class:'fine',role:'status'},L('正在补齐分类的中英文显示…','Preparing bilingual topic labels…')):null,translationError?h('div',{class:'topic-translation-error',role:'status'},h('p',{},translationError),button(L('重试分类翻译','Retry topic translation'),()=>ensureTranslations(true))):null,
 hasRun&&!arranging?button(planExpanded?L('收起分类规则','Hide topic rules'):L('查看或修改分类规则','View or edit topic rules'),()=>{planExpanded=!planExpanded;drawOrg();}):null,
 proposal.length&&showPlan?h('h3',{class:'org-section-title'},L('分类方案','Topic plan'),h('small',{},L(`${proposal.length} 个分类 · 名称和规则可直接修改`,`${proposal.length} topics · names and rules are editable`))):null,
 ...(showPlan?proposal:[]).map(t=>h('article',{class:'organization-proposal '+(c.topicTone?.(t.name)||'topic-neutral')},h('label',{class:'field'},L('分类名称','Topic name'),h('input',{value:localized(t,'name'),maxlength:60,disabled:running||reviewLoading||reviewSaving,onchange:e=>editTopic(t,'name',e.target.value)})),h('p',{},localized(t,'purpose')),createRuleEditor({h,L,value:localized(t,'rule'),disabled:running||reviewLoading||reviewSaving,onCommit:value=>editTopic(t,'rule',value)}),representativeList(t),h('label',{class:'field'},L('合并到','Merge into'),h('select',{disabled:running,onchange:async e=>{if(reviewSaving||!e.target.value)return;const target=proposal.find(z=>z.id===e.target.value);target.evidence.push(...t.evidence);assignments.forEach(a=>{if(a.topicId===t.id)a.topicId=target.id;});proposal=proposal.filter(z=>z!==t);await persistK();drawOrg();}},h('option',{value:''},L('保留独立分类','Keep separate')),...proposal.filter(z=>z!==t).map(z=>h('option',{value:z.id},localized(z,'name'))))))),
 proposal.length&&!arranging&&(showPlan||complete||knowledge.undo?.length)?h('footer',{class:'org-actions'},h('div',{class:'org-edit-actions'},showPlan?button(L('新增分类（用于拆分）','Add topic for split'),async()=>{if(reviewSaving)return;proposal.push({id:crypto.randomUUID(),name:L('新分类','New topic'),purpose:'',rule:'',evidence:[]});await persistK();drawOrg();}):null,!complete&&(!knowledge.organization||knowledge.organization.planKey!==planKey(proposal))?h('button',{type:'button',class:'primary',disabled:running||translating,onclick:allocate},rulesChanged?L('按新规则重新生成预览','Regenerate preview with new rules'):L('按这些分类生成预览','Preview saves in these topics')):null,knowledge.undo?.length?button(L('撤销本次分类','Undo organization'),undoOrganization):null),complete?h('button',{type:'button',class:'primary org-next',onclick:()=>c.navigate('find')},L('用收藏完成任务 →','Work with your knowledge →')):null):null,
 assignments.length&&!running?h('details',{class:'org-legacy'},h('summary',{},L(`上次未保存的 ${assignments.length} 条分类建议`,`Previous unsaved suggestions · ${assignments.length}`)),h('h3',{class:'org-section-title'},L('分配预览','Assignment preview'),h('small',{},L(`${assignments.length} 条 · 取消勾选的不会移动`,`${assignments.length} notes · unchecked notes stay where they are`))),
 ...assignments.map(a=>h('article',{class:'kb-assignment'},h('label',{},h('input',{type:'checkbox',checked:a.selected,onchange:async e=>{a.selected=e.target.checked;await persistK();}}),c.items().find(x=>x.id===a.id)?.title||a.id),h('select',{'aria-label':L('分配分类','Assign topic'),value:a.topicId,onchange:async e=>{a.topicId=e.target.value;await persistK();}},...proposal.map(t=>h('option',{value:t.id,selected:a.topicId===t.id},localized(t,'name')))),h('p',{class:'fine'},a.reason))),assignments.length?button(L('应用选中的分类','Apply selected topics'),apply,true):null):null,
 null));for(const node of orgHost.querySelectorAll('.org-preview-group'))if(expanded.includes(node.dataset.previewTopic))node.open=true;if(exceptionsOpen&&orgHost.querySelector('.org-preview-exceptions'))orgHost.querySelector('.org-preview-exceptions').open=true;queueMicrotask(()=>{ensureTranslations();suggestPending();if(focusLabel)orgHost.querySelector(`[aria-label="${focusLabel}"]`)?.focus({preventScroll:true});});}
 return {organizationStage(){const run=knowledge.organization;if(run?.planKey===planKey(proposal))return run.previewConfirmed&&organizationPreview(run,c.items(),proposal).settled?'saved':'review';return proposal.length?'plan':'start';},localize:ensureTranslations,topicName(name){const t=[...proposal,...(knowledge.confirmedTopics||[])].find(t=>t.name===name);return t?localized(t,'name'):knownTopicName(name,lang());},async setScope(ids){task.scopeIds=[...ids];task.revision++;await persist();draw();},mount(node){host=node;draw();},mountOrganize(node){orgHost=node;drawOrg();},refresh:draw};
}
