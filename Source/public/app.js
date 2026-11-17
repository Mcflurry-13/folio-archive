import {sampleArchiveName,sampleURL,freshSampleURL,validExperience,previousSampleSessions} from './sample-session.js';
import {choosePublicCollection} from './collection-picker.js';
import {installPublicCollection,refreshPublicSummaries} from './public-collection.js';
import {knownTopicName} from './topic-localization.js';
import {createReadingSummaries} from './reading-summaries.js';
import {mediaFormat,leadSentences,previewText,sourceMeta,isLowDetailImage} from './card-text.js';
import {displayImages,reconcilePublicImages} from './media-links.js';
import {applyMediaPatch} from './media-patch.js';
import {sourceView} from './knowledge.js';
import {createKnowledgeWorkspace} from './kb-workspace.js';
import {mergeImports} from './import-merge.js';
import {createCollectionFlow} from './collection-flow.js';
import {parseMarkdown} from './markdown.js';
import {createXhsSync} from './xhs-sync-ui.js';
import {xhsURL,requestCapture} from './capture.js';
import {t,language,setLanguage,initLanguage} from './i18n.js';
import {safeURL,normalizeItem,mergeItems} from './data.js';

/* =====================================================================
   Folio v2 front end
   - Real mode: the existing library in IndexedDB (folio-archive v1). Single collection per material (category).
   - Agent-first navigation, with real RedNote intake only.
   ===================================================================== */

let xhsSync;
/* ---------- helpers ---------- */
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const L=(zh,en)=>language==='zh'?zh:en;
const P=pair=>Array.isArray(pair)?L(pair[0],pair[1]):(pair||'');
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;}
function h(tag,props,...kids){
  const e=document.createElement(tag);
  for(const [k,v] of Object.entries(props||{})){
    if(v==null||v===false)continue;
    if(k==='class')e.className=v;else if(k==='text')e.textContent=v;
    else if(k.startsWith('on'))e.addEventListener(k.slice(2),v);
    else if(k==='checked'||k==='disabled'||k==='value')e[k]=v;
    else e.setAttribute(k,v===true?'':v);
  }
  for(const k of kids.flat()){if(k==null||k===false)continue;e.append(k instanceof Node?k:document.createTextNode(String(k)));}
  return e;
}
const ICONS={
  stack:'<rect x="4" y="7" width="12" height="12" rx="2"/><path d="M8 4h10a2 2 0 0 1 2 2v10"/>',
  note:'<path d="M6 4h9l3 3v13H6z"/><path d="M9 11h6M9 15h4"/>',
  link:'<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>',
  close:'<path d="M7 7l10 10M17 7 7 17"/>',
  external:'<path d="M8 16 16 8M10 8h6v6"/>',
  check:'<path d="m5 12 4.5 4.5L19 7"/>',
  alert:'<circle cx="12" cy="12" r="8.5"/><path d="M12 8v5M12 16v.5"/>',
  repo:'<path d="M6 4h11v16H8a2 2 0 0 1-2-2z"/><path d="M6 16a2 2 0 0 1 2-2h9"/>',
  star:'<path d="m12 4 2.4 5 5.3.6-4 3.6 1.1 5.3L12 15.8 7.2 18.5l1.1-5.3-4-3.6 5.3-.6z"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  undo:'<path d="M9 7 4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 0 12"/>',
  arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>'
};
function icon(name,size=14){const tpl=document.createElement('template');tpl.innerHTML=`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;return tpl.content.firstChild;}
function externalLink(href,label){const a=el('a','chip');a.href=href;a.target='_blank';a.rel='noopener noreferrer';a.append(el('span','',label),icon('external'));return a;}
const tag=(text,cls='')=>el('span','tag '+cls,text);
const aiBadge=()=>el('span','ai-badge','AI');

const ALL='全部收藏',UNSORTED='未分类';
const BUILTIN={'网站制作':['网站制作','Website building'],'交互原型':['交互原型','Interactive prototypes'],'视觉素材':['视觉素材','Visual assets'],'职业发展':['职业发展','Career development'],'研究学习':['研究学习','Research & learning'],'全部收藏':['全部收藏','All materials'],'未分类':['未分类','Unsorted'],'导入收藏':['导入收藏','Imported']};
let topicLabelLookup=null;
const topicName=c=>BUILTIN[c]&&!libraryTopics.includes(c)?P(BUILTIN[c]):(topicLabelLookup?.(c)||knownTopicName(c,language)); // Stored category keys never change on language switch
const XHS_HOSTS=['xiaohongshu.com','rednote.com','xhslink.com'];
const hostOf=u=>{try{return new URL(u).hostname.replace(/^www\./,'');}catch{return '';}};
const findLink=raw=>{for(const m of raw.matchAll(/https?:\/\/[^\s<>"，。]+/g)){const u=safeURL(m[0]);if(u)return u;}return '';};
const fmtDate=(iso,opts)=>{try{return new Intl.DateTimeFormat(language==='zh'?'zh-CN':'en-US',opts).format(new Date(iso));}catch{return '';}};
function ago(iso){
  const s=(Date.now()-new Date(iso).getTime())/1000;if(!isFinite(s))return '';
  if(s<60)return L('刚刚','just now');
  const rtf=new Intl.RelativeTimeFormat(language==='zh'?'zh-CN':'en',{numeric:'auto'});
  if(s<3600)return rtf.format(-Math.round(s/60),'minute');
  if(s<86400)return rtf.format(-Math.round(s/3600),'hour');
  if(s<86400*7)return rtf.format(-Math.round(s/86400),'day');
  return fmtDate(iso,{month:'short',day:'numeric'});
}
const firstSentence=t=>(String(t||'').split(/(?<=[。！？.!?])\s*/)[0]||'').trim();

/* ---------- browser storage that never throws ---------- */
const store={get(k){try{return localStorage.getItem(k);}catch{return null;}},set(k,v){try{localStorage.setItem(k,v);}catch{}}};

/* ---------- real library: IndexedDB folio-archive v1, store "state", keys items / categories ---------- */
const sampleParams=new URLSearchParams(location.search);
const sampleKey=['x','rednote'].includes(sampleParams.get('sample'))?sampleParams.get('sample'):null;
const experience=validExperience(sampleParams.get('experience'));
const archiveName=sampleArchiveName(sampleKey,experience);
let db=null;
try{db=await new Promise((ok,bad)=>{const r=indexedDB.open(archiveName,1);r.onupgradeneeded=()=>r.result.createObjectStore('state');r.onsuccess=()=>ok(r.result);r.onerror=()=>bad(r.error);});}catch(error){console.warn('IndexedDB unavailable',error);}
const read=key=>db?new Promise((ok,bad)=>{const r=db.transaction('state').objectStore('state').get(key);r.onsuccess=()=>ok(r.result);r.onerror=()=>bad(r.error);}):Promise.resolve(undefined);
let memoryNoted=false;
const write=(key,value)=>db?new Promise((ok,bad)=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(value,key);tx.oncomplete=ok;tx.onerror=()=>bad(tx.error);}):(memoryNoted||(memoryNoted=true,setTimeout(()=>toast(L('这个页面不能使用浏览器存储，修改只保留到关闭页面。','This page cannot use browser storage. Changes last until you close it.')),0)),Promise.resolve());
const savedItems=await read('items');
const navigateSample=key=>{location.assign(freshSampleURL(key,language));return new Promise(()=>{});};
if(sampleParams.has('collections')||(!sampleKey&&sampleParams.get('library')!=='personal')||(sampleKey&&!experience&&sampleParams.get('resume')!=='1')){
 await choosePublicCollection({language,setLanguage,returnURL:sampleKey?(sampleParams.has('collections')?sampleURL(sampleKey,language,experience,{resume:true}):undefined):savedItems?.length?'/?library=personal&lang='+language+'#library':undefined,previousSessions:await previousSampleSessions(),install:navigateSample});
}
let publicCollection={status:'existing'};
if(sampleKey&&savedItems!==undefined)await refreshPublicSummaries(db,read,fetch,sampleKey);
if(sampleKey&&savedItems===undefined){
 publicCollection=await installPublicCollection(db,read,fetch,sampleKey);
 if(publicCollection.status==='unavailable')publicCollection=await choosePublicCollection({language,setLanguage,initialError:true,install:key=>key===sampleKey?installPublicCollection(db,read,fetch,key):navigateSample(key)});
}
// Records that fail validation are kept untouched and written back, so nothing stored is ever dropped.
let invalidRaw=[];const loaded=[];
for(const raw of (await read('items'))||publicCollection.items||[]){try{loaded.push(normalizeItem(raw));}catch{invalidRaw.push(raw);}}
let realList=loaded,realCategories=(await read('categories'))||[];
// Explicitly chosen topics are kept separately from the organizer's primary category.
function cleanTopics(values) {
  if (!Array.isArray(values)) return [];
  const names = values.filter(v => typeof v === 'string').map(v => v.trim().slice(0, 60));
  return [...new Set(names.filter(name => name && name !== UNSORTED && name !== ALL))];
}
function readManualTopics(entries) {
  const map = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string') continue;
    const names = cleanTopics(entry[1]);
    if (names.length) map.set(entry[0], names);
  }
  return map;
}
let manualTopics = readManualTopics(await read('manualTopics'));
async function persistReal(next, nextManual) {
  const records = invalidRaw.length ? [...next, ...invalidRaw] : next;
  if (db && nextManual) {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('state', 'readwrite');
      const state = tx.objectStore('state');
      state.put(records, 'items');
      state.put([...nextManual], 'manualTopics');
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error || Error('Save cancelled'));
      tx.onerror = () => reject(tx.error);
    });
  } else {
    await write('items', records);
  }
  realList = next;
  if (nextManual) manualTopics = nextManual;
}
async function persistRealCategories(list){await write('categories',list);realCategories=list;}

/* ---------- state ---------- */
let view='find';
let layout=store.get('folio-layout')==='time'?'time':'grid';
let filter={type:'all'};
let selectMode=false;const picked=new Set();
let undoLog=[]; // undo entries: {label:[zh,en], snap}


/* ---------- view model: derived views of saved items ---------- */
function srcOf(url){if(!url)return 'note';const h=hostOf(url);if(XHS_HOSTS.includes(h))return 'rednote';if(/(^|\.)(x|twitter)\.com$/.test(h))return 'x';if(/(^|\.)github\.com$/.test(h))return 'github';if(/(^|\.)linkedin\.com$/.test(h))return 'linkedin';return 'web';}
function viewItem(x){
  const source=srcOf(x.url);const hasText=!!(x.content||x.note);const hasImg=!!(x.images.length||x.image);
  return {...x,topics:cleanTopics([x.category,...(manualTopics.get(x.id)||[])]),source,folder:'',kind:source==='note'?'note':(!hasText&&!hasImg?'link':'post'),status:x.url&&!hasText&&!hasImg?'link':'full',author:''};
}
let realView=null;
function items(){if(!realView)realView=realList.map(viewItem);return realView;}
const byId=id=>items().find(x=>x.id===id);
function topics(){
  const used = new Set(items().flatMap(item => item.topics));
  return cleanTopics([...realCategories, ...used]).filter(c => !['Portfolio','UI / UX','Resume'].includes(c) || used.has(c));
}
const libraryTopics=['网站制作','交互原型','视觉素材','职业发展','研究学习'];
function topicTone(name){const aliases={'Website building':0,'Interactive prototypes':1,'Visual assets':2,'Career development':3,'Research and learning':4};const i=libraryTopics.indexOf(name);return i>=0?'topic-'+i:name in aliases?'topic-'+aliases[name]:'topic-neutral';}
function topicBadge(name){return h('span',{class:'topic-badge '+topicTone(name)},topicName(name));}
function sourceName(id){
  return ({rednote:L('小红书','RedNote'),x:'X',github:'GitHub',linkedin:'LinkedIn',pinterest:'Pinterest',web:L('网页','Web'),note:L('自己的记录','Own notes'),ai:L('从 AI 对话存回','Saved from AI chat')})[id]||id;
}
const videoNote=x=>/^\s*(?:视频(?:链接)?|video)\s*[:：]\s*https?:\/\//mi.test(x.content||'')||/本篇为视频笔记/.test(x.content||'');
const mediaLabel=x=>displayImages(x).length?L('图片暂不可用','Image unavailable'):videoNote(x)?L('视频 · 未导出封面','Video · no exported cover'):L('无配图','No image');
function mediaPlaceholder(x,cls){const ph=el('span',cls+' media-placeholder');if(videoNote(x)){ph.append(el('span','media-play','▶'));ph.setAttribute('aria-label',mediaLabel(x));ph.title=mediaLabel(x);}else ph.append(icon(x.kind==='repo'?'repo':x.url?'link':'note',18));return ph;}
function remoteThumb(x,cls){const cover=coverOf(x);if(!cover)return mediaPlaceholder(x,cls);const img=new Image();img.className=cls;img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';img.onerror=()=>{failedCovers.add(cover);img.replaceWith(mediaPlaceholder(x,cls));};img.src=cover;return img;}
const failedCovers=new Set();
// Video first frames with almost no pixel detail (blank title cards, black frames) are not used as covers.
const lowDetailCovers=new Set();
const coverOf=x=>{const first=displayImages(x)[0]||'';return failedCovers.has(first)||lowDetailCovers.has(first)?'':first;};
const checkVideoCover=(x,img,cover,onLow)=>{if(mediaFormat(x)!=='video')return;const test=()=>{if(img.naturalWidth&&isLowDetailImage(img)){lowDetailCovers.add(cover);onLow();}};if(img.complete)test();else img.addEventListener('load',test,{once:true});};
// One finished sentence or two from the saved text, so a card never stops mid-sentence.
const cardExcerpt=x=>{const t=previewText(sourceView(x).body)||coverText(x);return leadSentences(t,/[\u3400-\u9fff]/.test(t)?64:130);};
const videoPostNote=()=>L('视频帖 · Folio 只读了文字','Video post · Folio read only the text');
const isRecent=x=>Date.now()-new Date(x.createdAt).getTime()<3*86400000;
const coverText=x=>(sourceView(x).body||sourceView(x).note||'').replace(/https?:\/\/\S+/g,'').replace(/#[^\s#]+/g,'').replace(/\s+/g,' ').trim();

/* ---------- toast (popover so it shows above open dialogs) ---------- */
function toast(message,action){
  const box=$('#toast');$('#toastText').textContent=message;
  const b=$('#toastAction');b.hidden=!action;
  if(action){b.textContent=action.label;b.onclick=()=>{hideToast();action.run();};}
  box.hidden=false;
  if(box.showPopover){try{box.hidePopover();}catch{}try{box.showPopover();}catch{}}
  clearTimeout(toast.timer);toast.timer=setTimeout(hideToast,action?7000:3600);
}
function hideToast(){const box=$('#toast');if(box.hidePopover){try{box.hidePopover();}catch{}}box.hidden=true;}
if('popover' in HTMLElement.prototype)$('#toast').setAttribute('popover','manual');

/* ---------- confirm, copy, file save (hosted frames block confirm() and downloads) ---------- */
function askConfirm(message,okLabel,{detail='',cancel}={}){
  return new Promise(resolve=>{
    const d=$('#confirmDialog');$('#confirmText').textContent=message;$('#confirmOk').textContent=okLabel;$('#confirmCancel').textContent=cancel||L('取消','Cancel');
    $('#confirmDetail').hidden=!detail;$('#confirmDetail').textContent=detail;
    const done=v=>{d.close();resolve(v);};
    $('#confirmOk').onclick=()=>done(true);$('#confirmCancel').onclick=()=>done(false);d.oncancel=e=>{e.preventDefault();done(false);};
    d.showModal();$('#confirmCancel').focus();
  });
}
async function copyText(text,why,skipClipboard=false){
  if(!skipClipboard){try{await navigator.clipboard.writeText(text);return true;}catch{}}
  $('#copyLede').textContent=why||L('浏览器没有允许自动复制。文字已全选，按 Ctrl+C 或 ⌘C 复制。','The browser blocked automatic copying. The text is selected. Press Ctrl+C or ⌘C.');
  $('#copyText').value=text;if(!$('#copyDialog').open)$('#copyDialog').showModal();$('#copyText').focus();$('#copyText').select();return false;
}
let downloadsCap;
async function saveFile(filename,text){
  if(window.claude?.use){
    if(downloadsCap===undefined){try{downloadsCap=await window.claude.use('downloads');}catch{downloadsCap=null;}}
    if(downloadsCap){try{await downloadsCap.save({filename,data:new Blob([text],{type:'application/json'})});return true;}catch(e){if(e?.code==='declined')return false;}}
    copyText(text,L(`这个页面不能直接下载。请复制下面的内容，保存为 ${filename}。`,`This page cannot download files. Copy the text below and save it as ${filename}.`),true);
    return false;
  }
  const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  return true;
}
document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-copy]');if(!b)return;
  const src=b.dataset.copy?$(b.dataset.copy):b.parentElement.querySelector('code,.prompt-text');if(!src)return;
  if(await copyText(src.textContent)){const old=b.textContent;b.textContent=L('已复制','Copied');clearTimeout(b.copyTimer);b.copyTimer=setTimeout(()=>b.textContent=old===L('已复制','Copied')?L('复制','Copy'):old,1600);}
});

/* ---------- mutations shared by every view ---------- */
function afterChange(){realView=null;renderAll();}
async function saveItemRecord(rec,{isNew}={}){
  const x=normalizeItem({id:rec.id,title:rec.title,url:rec.url,category:rec.topics[0]||UNSORTED,content:rec.content,note:rec.note,image:rec.images[0]||'',images:rec.images,createdAt:rec.createdAt});
  if(x.url&&realList.some(y=>y.url===x.url&&y.id!==x.id))throw new Error('这个链接已经收藏了，可以编辑已有资料。');
  const previousPrimary = realList.find(item => item.id === x.id)?.category;
  const pinned = new Set(manualTopics.get(x.id) || []);
  const chosen = cleanTopics(rec.topics).filter(name => name !== previousPrimary || pinned.has(name));
  const nextManual = new Map(manualTopics);
  if (chosen.length) nextManual.set(x.id, chosen);
  else nextManual.delete(x.id);
  await persistReal(isNew?[x,...realList]:realList.map(y=>y.id===x.id?x:y), nextManual);
  afterChange();
}
async function removeItems(ids){
  const set=new Set(ids);
  const nextManual = new Map(manualTopics);
  for (const id of set) nextManual.delete(id);
  await persistReal(realList.filter(x=>!set.has(x.id)), nextManual);
  afterChange();
}
async function addTopicName(name){
  if(!name||name===ALL)return;
  if(!realCategories.includes(name))await persistRealCategories([...realCategories,name]);
}
async function applyTopic(ids, topic) {
  const [name] = cleanTopics([topic]);
  if (!name) return;
  await addTopicName(name);
  const selected = new Set(ids);
  const nextManual = new Map(manualTopics);
  const next = realList.map(item => {
    if (!selected.has(item.id)) return item;
    nextManual.set(item.id, cleanTopics([...(nextManual.get(item.id) || []), name]));
    return item.category === UNSORTED ? {...item, category:name} : item;
  });
  await persistReal(next, nextManual);
  afterChange();
}
function snapshot(ids, addedTopic) {
  const selected = new Set(ids);
  return realList.filter(x => selected.has(x.id)).map(x => ({
    id:x.id, category:x.category, addedTopic, wasPinned:(manualTopics.get(x.id) || []).includes(addedTopic)
  }));
}
async function restore(rows) {
  const previous = new Map(rows.map(row => [row.id, row]));
  const nextManual = new Map(manualTopics);
  const next = realList.map(item => {
    const before = previous.get(item.id);
    if (!before) return item;
    const current = nextManual.get(item.id) || [];
    const remaining = before.wasPinned ? current : current.filter(name => name !== before.addedTopic);
    if (remaining.length) nextManual.set(item.id, remaining);
    else nextManual.delete(item.id);
    if (before.category === UNSORTED && item.category === before.addedTopic) {
      return {...item, category:remaining[0] || UNSORTED};
    }
    return item;
  });
  await persistReal(next, nextManual);
  afterChange();
}
function remember(label,snap){
  undoLog.unshift({label,snap,at:new Date().toISOString()});undoLog=undoLog.slice(0,6);
  toast(P(label),{label:L('撤销','Undo'),run:undoLast});
  if(view==='organize')renderOrganize();
}
async function undoLast(){
  const entry=undoLog[0];if(!entry)return;
  await restore(entry.snap);undoLog=undoLog.filter(x=>x!==entry);
  toast(L('已撤销：','Undone: ')+P(entry.label));renderAll();
}

/* =====================================================================
   Library
   ===================================================================== */
function fillSelect(select,options,value){
  select.replaceChildren(...options.map(o=>{if(o.group){const g=document.createElement('optgroup');g.label=o.group;g.append(...o.options.map(([v,l])=>{const x=document.createElement('option');x.value=v;x.textContent=l;return x;}));return g;}const x=document.createElement('option');x.value=o[0];x.textContent=o[1];if(o[2])x.disabled=true;return x;}));
  const values=[...select.querySelectorAll('option')].map(o=>o.value);
  select.value=values.includes(value)?value:values[0]??'';
}
const filterKey=f=>f.type==='topic'?'topic:'+f.topic:f.type==='source'?'source:'+f.source+(f.folder?'|'+f.folder:''):f.type;
function keyToFilter(k){if(k.startsWith('topic:'))return {type:'topic',topic:k.slice(6)};if(k.startsWith('source:')){const [s,folder]=k.slice(7).split('|');return {type:'source',source:s,folder:folder||''};}return {type:k};}
function setFilter(f){filter=f;renderLibrary();}
function filterTitle(){
  if(filter.type==='recent')return L('最近新增','Recently added');
  if(filter.type==='unsorted')return topicName(UNSORTED);
  if(filter.type==='topic')return topicName(filter.topic);
  if(filter.type==='source')return filter.folder?`${sourceName(filter.source)} · ${filter.folder}`:sourceName(filter.source);
  return L('全部资料','All materials');
}
function inFilter(x){
  if(filter.type==='recent')return isRecent(x);
  if(filter.type==='unsorted')return !x.topics.length;
  if(filter.type==='topic')return x.topics.includes(filter.topic);
  if(filter.type==='source')return x.source===filter.source&&(!filter.folder||x.folder===filter.folder);
  return true;
}
function matchesSearch(x){const q=$('#filter').value.trim().toLowerCase();if(!q)return true;return (x.title+'\n'+x.content+'\n'+x.note+'\n'+x.topics.join(' ')+'\n'+(x.folder||'')+'\n'+(x.author||'')+'\n'+(x.profile?.headline||'')).toLowerCase().includes(q);}

function railButton(key,label,count,{indent=false,muted=false}={}){
  const active=filterKey(filter)===key;
  const b=h('button',{type:'button',class:'space'+(active?' is-active':'')+(indent?' is-folder':'')+(muted?' is-muted':''),'aria-current':active?'true':null,onclick:()=>{setFilter(keyToFilter(key));}},el('span','space-name',label),el('span','space-count',String(count)));
  if((key.startsWith('topic:')||key==='unsorted')){b.classList.add('topic-filter',topicTone(key.slice(6)));}
  return b;
}
function renderRail(){
  const all=items();const tps=topics();
  const heading=$('#libraryView .rail-title');if(heading)heading.textContent=L('资料视图','Library views');
  const tl=$('#topicList');tl.replaceChildren(
    railButton('all',L('全部资料','All materials'),all.length),
    railButton('recent',L('最近新增','Recently added'),all.filter(isRecent).length),
    railButton('unsorted',topicName(UNSORTED),all.filter(x=>!x.topics.length).length,{muted:true}),
    ...(tps.length?[el('p','rail-title topic-section-title',L('我的分类','My categories'))]:[]),
    ...tps.map(tp=>railButton('topic:'+tp,topicName(tp),all.filter(x=>x.topics.includes(tp)).length))
  );
  const counts={};for(const x of all)counts[x.source]=(counts[x.source]||0)+1;
  const sl=$('#sourceList');sl.replaceChildren();
  for(const s of ['rednote','x','github','linkedin','web','note','ai'].filter(s=>counts[s])){
    sl.append(railButton('source:'+s,sourceName(s),counts[s]));
  }
  if(!sl.children.length)sl.append(el('p','rail-empty',L('还没有资料来源','No sources yet')));
  // phone: one select replaces the rail
  const opts=[{group:L('查看','View'),options:[['all',L('全部资料','All materials')],['recent',L('最近新增','Recently added')],['unsorted',topicName(UNSORTED)]]}];
  if(tps.length)opts.push({group:L('主题','Topics'),options:tps.map(tp=>['topic:'+tp,topicName(tp)])});
  const srcOpts=Object.keys(counts).map(s=>['source:'+s,sourceName(s)]);
  if(srcOpts.length)opts.push({group:L('来源','Sources'),options:srcOpts});
  fillSelect($('#mobileFilter'),opts,filterKey(filter));
}
$('#mobileFilter').onchange=()=>setFilter(keyToFilter($('#mobileFilter').value));

function renderLibrary(){
  $('#libraryView').classList.toggle('library-editorial',true);$('#libraryView').classList.toggle('has-items',items().length>0);
  renderRail();renderQuickTopics();
  const all=items();const pool=all.filter(inFilter);const list=pool.filter(matchesSearch);
  readingSummaries.banner($('#summaryBar'),list,false);
  $('#libraryTitle').textContent=filterTitle();
  $('#libraryCount').textContent=list.length===pool.length?L(`${pool.length} 条`,`${pool.length} ${pool.length===1?'item':'items'}`):L(`显示 ${list.length} 条，共 ${pool.length} 条`,`${list.length} of ${pool.length}`);
  $('#viewGrid').setAttribute('aria-pressed',String(layout==='grid'));$('#viewTime').setAttribute('aria-pressed',String(layout==='time'));
  $('#selectMode').setAttribute('aria-pressed',String(selectMode));$('#selectMode').textContent=selectMode?L('取消选择','Cancel'):L('选择','Select');
  $('#selectMode').hidden=!all.length;
  // recent strip only on the full view
  const recent=all.filter(isRecent).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  const showRecent=filter.type==='all'&&!$('#filter').value.trim()&&recent.length>0&&all.length>recent.length;
  $('#recentSection').hidden=!showRecent;$('#allTitle').hidden=!showRecent;
  if(showRecent){
    const via=[...new Set(recent.map(x=>x.via).filter(Boolean))].map(sourceName);const manual=recent.filter(x=>!x.via).length;
    $('#recentNote').textContent=[via.length?L(`来自 ${via.join('、')} 的同步`,`From ${via.join(', ')} sync`):'',manual?L(`${manual} 条自己添加`,`${manual} added by you`):''].filter(Boolean).join(L('；','; '));
    $('#recentStrip').replaceChildren(...recent.slice(0,10).map(miniCard));
    $('#allTitle').textContent=L('全部资料','All materials');
  }
  const empty=$('#empty');
  if(!list.length){
    $('#cards').replaceChildren();$('#timeline').replaceChildren();$('#timeline').hidden=true;empty.hidden=false;renderEmpty(empty,all,pool);
  }else{
    empty.hidden=true;
    if(layout==='grid'){$('#timeline').hidden=true;$('#timeline').replaceChildren();$('#cards').replaceChildren(...list.map(cardFor));sizeCards();}
    else{$('#cards').replaceChildren();$('#timeline').hidden=false;renderTimeline(list);}
  }
  renderSelectionBar();
}
function renderEmpty(box,all,pool){
  box.replaceChildren();
  if(!all.length){
    box.classList.add('onboarding');
    box.append(h('h2',{},L('把你已经收藏的东西带进来','Bring in what you’ve already saved')),
      h('p',{},L('连接小红书、X、GitHub、LinkedIn 或 Pinterest，选好收藏夹和范围再导入。确认之前不会导入任何内容。','Connect RedNote, X, GitHub, LinkedIn or Pinterest, choose folders and a range, then import. Nothing comes in until you confirm.')),
      h('div',{class:'empty-actions'},
        h('button',{type:'button',class:'primary',onclick:()=>openSourceWizard(null)},L('连接收藏来源','Connect a source')),
        null),
      h('p',{class:'empty-alt'},L('也可以','Or '),h('button',{type:'button',class:'link',onclick:openImporter},L('导入书签文件','import a bookmarks file')),L('，或者','; or '),h('button',{type:'button',class:'link',onclick:()=>toggleAdd(true)},L('粘贴一条链接','paste one link')),L('。','.')));
    return;
  }
  box.classList.remove('onboarding');
  const q=$('#filter').value.trim();
  if(pool.length){box.append(h('h2',{},q?L(`没有找到与“${q}”相关的资料`,`No materials match “${q}”`):L('没有符合条件的资料','Nothing matches')),h('p',{},L('换一个关键词，或清除搜索。','Try another keyword, or clear the search.')),h('div',{class:'empty-actions'},h('button',{type:'button',class:'ghost',onclick:()=>{$('#filter').value='';renderLibrary();$('#filter').focus();}},L('清除搜索','Clear search'))));return;}
  if(filter.type==='unsorted'){box.append(h('h2',{},L('没有未分类的资料','Everything has a topic')),h('p',{},L('新同步的资料会先出现在这里和“待整理”中。','New synced materials appear here and in Organize first.')));return;}
  box.append(h('h2',{},L('这里还没有资料','Nothing here yet')),h('p',{},L('在“待整理”里把资料归入这个主题，或在详情里修改主题。','Add materials to this topic from Organize, or change a material’s topics in its details.')),h('div',{class:'empty-actions'},h('button',{type:'button',class:'ghost',onclick:()=>setFilter({type:'all'})},L('查看全部资料','Show all materials'))));
}
$('#filter').oninput=renderLibrary;
$('#viewGrid').onclick=()=>{layout='grid';store.set('folio-layout',layout);renderLibrary();};
$('#viewTime').onclick=()=>{layout='time';store.set('folio-layout',layout);renderLibrary();};

/* masonry: CSS grid with 4px rows; each card spans its measured height, which keeps DOM order = reading order */
const ROW=4,ROW_GAP=24;const ratios=new Map();let sizeQueued=false;
function queueSize(){if(sizeQueued)return;sizeQueued=true;requestAnimationFrame(()=>{sizeQueued=false;sizeCards();});}
function sizeCards(){const cards=[...$('#cards').children];const hs=cards.map(c=>c.getBoundingClientRect().height);cards.forEach((c,i)=>c.style.gridRowEnd=`span ${Math.max(1,Math.ceil((hs[i]+ROW_GAP)/ROW))}`);}
new ResizeObserver(()=>{if(layout==='grid'&&$('#cards').children.length)queueSize();}).observe($('#cards'));
function applyRatio(img,key){
  const set=r=>{img.style.aspectRatio=`1 / ${Math.min(1.34,Math.max(.66,r))}`;};
  if(ratios.has(key))set(ratios.get(key));else{set(1.25);img.addEventListener('load',()=>{if(img.naturalWidth){ratios.set(key,img.naturalHeight/img.naturalWidth);set(ratios.get(key));queueSize();}},{once:true});}
}
const initials=name=>name.split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase();
function metaLine(x,{withTopics=true}={}){
  // Who wrote it and when: the two things a reader checks first. The source name stays when no author is recorded.
  const meta=el('p','card-meta');const {author,date}=sourceMeta(x,L,language);
  meta.append(el('span','card-author-name',author||sourceName(x.source)+(x.folder?` · ${x.folder}`:'')));
  if(date)meta.append(el('span','card-date',date));
  if(!sourceView(x).body)meta.append(el('span','material-format',L('待补充正文','Text needed')));
  return meta;
}
function openOrPick(x){if(selectMode){togglePick(x.id);}else openEditor(x.id);}
function cardFor(x){
  const cover=coverOf(x);const count=displayImages(x).length;
  const kind=cover?'card-media':x.kind==='profile'?'card-text card-profile':x.kind==='repo'?'card-text card-repo':x.status==='link'?'card-text card-link':'card-text';
  const card=el('article','card '+kind+(picked.has(x.id)?' is-picked':''));
  if(selectMode){const box=h('input',{type:'checkbox',class:'card-check','aria-label':L('选择 ','Select ')+x.title,checked:picked.has(x.id),onchange:()=>togglePick(x.id)});card.append(box);}
  if(cover){
    const fig=el('div','card-figure');const img=new Image();img.alt='';img.decoding='async';img.loading='lazy';img.referrerPolicy='no-referrer';img.onerror=()=>{failedCovers.add(cover);if(card.isConnected){card.replaceWith(cardFor(x));queueSize();}};img.src=cover;checkVideoCover(x,img,cover,()=>{if(card.isConnected){card.replaceWith(cardFor(x));queueSize();}});applyRatio(img,x.id+':'+cover.length);fig.append(img);
    if(count>1){const badge=el('span','card-count');badge.append(icon('stack',12),document.createTextNode(String(count)));badge.setAttribute('aria-label',L(`${count} 张图片`,`${count} images`));fig.append(badge);}
    card.append(fig);
  }
  const body=el('div','card-body');
  if(true){card.classList.add('library-note',topicTone(x.topics[0]));body.append(h('div',{class:'note-topic-line'},...(x.topics.length?x.topics:[UNSORTED]).map(topicBadge)));}
  if(x.kind==='profile'){
    const top=el('div','profile-top');top.append(el('span','avatar',initials(x.title)),h('div',{},h('p',{class:'profile-head'},x.profile?.headline||'')));
    body.append(top);
  }
  if(x.kind==='repo'){const top=el('p','card-host');top.append(icon('repo',13),el('span','',`${x.repo?.owner||''}/`));body.append(top);}
  if(!cover&&x.status==='link'){const host=el('p','card-host');host.append(icon('link',13),el('span','',hostOf(x.url)));body.append(host);}
  if(x.kind==='post'&&x.author&&!cover){body.append(el('p','card-author',x.author));}
  const titleEl=el('h3','card-title');const open=el('button','card-open',x.title);open.type='button';open.onclick=()=>openOrPick(x);titleEl.append(open);body.append(titleEl);
  const summaryPreview=readingSummaries.preview(x);
  if(summaryPreview)body.append(summaryPreview);
  if(!cover&&!summaryPreview){
    if(x.kind==='profile'&&x.profile?.experience?.length)body.append(el('p','card-excerpt',x.profile.experience.find(e=>/\d/.test(e))||x.profile.experience[0]));
    else if(x.kind==='repo'){body.append(el('p','card-excerpt',x.content));const stats=el('p','repo-stats');stats.append(icon('star',12),el('span','',x.repo?.stars||''),el('span','',x.repo?.language||''));body.append(stats);}
    else{const text=cardExcerpt(x);if(text)body.append(el('p','card-excerpt',text));else if(x.url)body.append(el('p','card-excerpt is-empty',L('暂无可读正文，可打开原文或补充笔记。','No readable text yet. Open the source or add a note.')));}
  }
  if(mediaFormat(x)==='video')body.append(el('p','remote-image-notice card-video-note',videoPostNote()));
  else if(!cover&&displayImages(x).length)body.append(el('p','remote-image-notice',mediaLabel(x)));
  body.append(metaLine(x));
  card.append(body);
  return card;
}
function miniCard(x){
  const cover=coverOf(x);
  const b=h('button',{type:'button',class:'mini'+(picked.has(x.id)?' is-picked':''),onclick:()=>openOrPick(x)});
  if(cover){const img=new Image();img.alt='';img.src=cover;img.className='mini-img';b.append(img);}
  else b.append(h('span',{class:'mini-mark'},x.kind==='profile'?initials(x.title):x.kind==='repo'?icon('repo',18):x.status==='link'?icon('link',18):icon('note',18)));
  b.append(h('span',{class:'mini-text'},el('span','mini-title',x.title),el('span','mini-meta',`${sourceName(x.source)} · ${ago(x.createdAt)}`)));
  return b;
}
function renderTimeline(list){
  const box=$('#timeline');box.replaceChildren();
  const sorted=[...list].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  const dayKey=iso=>{const d=new Date(iso);return isNaN(d)?'':`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;};
  const today=dayKey(new Date().toISOString());const y=new Date();y.setDate(y.getDate()-1);const yesterday=dayKey(y.toISOString());
  let group=null,key=null;
  for(const x of sorted){
    const k=dayKey(x.createdAt);
    if(k!==key){key=k;const sec=el('section','day');const label=k===today?L('今天','Today'):k===yesterday?L('昨天','Yesterday'):fmtDate(x.createdAt,{year:'numeric',month:'long',day:'numeric',weekday:'short'});sec.append(el('h2','day-title',label||L('日期未知','Unknown date')));group=el('ol','');sec.append(group);box.append(sec);}
    const li=el('li','');const row=el('button','row'+(picked.has(x.id)?' is-picked':''));row.type='button';row.onclick=()=>openOrPick(x);
    const cover=coverOf(x);
    row.append(remoteThumb(x,'row-thumb'));
    const text=el('span','');text.append(el('span','row-title',x.title));const preview=readingSummaries.preview(x);const ex=(x.profile?.headline||coverText(x));if(preview)text.append(preview);else if(ex)text.append(el('span','row-excerpt',ex.replace(/\s+/g,' ').slice(0,160)));
    const meta=el('span','row-meta');meta.append(el('span','',sourceName(x.source)+(x.folder?` · ${x.folder}`:'')),el('span','',x.topics.map(topicName).join(', ')||topicName(UNSORTED)));if(videoNote(x)&&!displayImages(x).length)meta.append(el('span','',mediaLabel(x)));text.append(meta);row.append(text);
    row.append(el('span','row-time',fmtDate(x.createdAt,{hour:'2-digit',minute:'2-digit'})));
    li.append(row);group.append(li);
  }
}

/* ---------- multi-select ---------- */
function togglePick(id,on){if(on??!picked.has(id))picked.add(id);else picked.delete(id);renderLibrary();}
function setSelectMode(on){selectMode=on;if(!on)picked.clear();renderLibrary();}
$('#selectMode').onclick=()=>setSelectMode(!selectMode);
function renderSelectionBar(){
  const bar=$('#selectionBar');bar.hidden=!selectMode;if(!selectMode)return;
  const n=picked.size;
  $('#selectionCount').textContent=n?L(`已选 ${n} 条`,`${n} selected`):L('点按资料来选择','Tap materials to select');
  fillSelect($('#selectionTopic'),[['',L('加入主题…','Add to topic…')],...topics().map(tp=>[tp,topicName(tp)]),['__new',L('新主题…','New topic…')]],'');
  $('#selectionTopic').disabled=!n;$('#selectionFind').disabled=!n;
  const c=$('#selectionCompare');c.disabled=n<2||n>4;c.title=n<2?L('选择 2 到 4 条资料来对比','Select 2 to 4 materials to compare'):n>4?L('一次最多对比 4 条','Compare up to 4 at a time'):'';
}
$('#selectionTopic').onchange=async()=>{
  let topic=$('#selectionTopic').value;if(!topic)return;
  if(topic==='__new'){topic=await askText(L('新主题名称','New topic name'));if(!topic){renderSelectionBar();return;}}
  const ids=[...picked];const snap=snapshot(ids,topic);
  await applyTopic(ids,topic);
  remember([`已把 ${ids.length} 条资料加入“${topic}”`,`Added ${ids.length} ${ids.length===1?'material':'materials'} to “${topic}”`],snap);
};
$('#selectionCompare').onclick=()=>{const ids=[...picked];setSelectMode(false);openFindWith(ids,{compare:true});};
$('#selectionFind').onclick=()=>{const ids=[...picked];setSelectMode(false);openFindWith(ids,{});};
$('#selectionDone').onclick=()=>setSelectMode(false);
function askText(label){
  return new Promise(resolve=>{
    const d=$('#confirmDialog');$('#confirmText').textContent=label;$('#confirmDetail').hidden=true;
    const input=h('input',{class:'confirm-input',maxlength:'60','aria-label':label});
    const inner=d.querySelector('.dialog-inner');inner.querySelector('.confirm-input')?.remove();inner.insertBefore(input,inner.querySelector('.confirm-actions'));
    $('#confirmOk').textContent=L('添加','Add');$('#confirmCancel').textContent=L('取消','Cancel');
    const done=v=>{input.remove();d.close();resolve(v);};
    $('#confirmOk').onclick=()=>done(input.value.trim().slice(0,60)||null);$('#confirmCancel').onclick=()=>done(null);d.oncancel=e=>{e.preventDefault();done(null);};
    input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('#confirmOk').click();}};
    d.showModal();input.focus();
  });
}

/* ---------- topics in the rail ---------- */
$('#newTopic').onclick=()=>{$('#newTopic').hidden=true;$('#newTopicForm').hidden=false;$('#newTopicName').value='';$('#newTopicName').focus();};
function closeTopicForm(){$('#newTopicForm').hidden=true;$('#newTopic').hidden=false;}
$('#cancelTopic').onclick=()=>{closeTopicForm();$('#newTopic').focus();};
$('#newTopicName').onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();closeTopicForm();$('#newTopic').focus();}};
$('#newTopicForm').onsubmit=async e=>{
  e.preventDefault();const name=$('#newTopicName').value.trim().slice(0,60);if(!name||name===ALL)return;
  await addTopicName(name);closeTopicForm();filter={type:'topic',topic:name};afterChange();toast(L(`已新建主题“${name}”`,`Created “${name}”`));
};

/* ---------- quick add: paste a link or write a note ---------- */
function toggleAdd(open){
  const f=$('#quickForm');const on=open??f.hidden;f.hidden=!on;$('#addToggle').setAttribute('aria-expanded',String(on));
  if(on){if(view!=='library')switchView('library');qt.focus();}
}
$('#addToggle').onclick=()=>toggleAdd();
$('#importInline').onclick=()=>openImporter();
function renderQuickTopics(){const prev=$('#quickCategory').value;fillSelect($('#quickCategory'),[[UNSORTED,topicName(UNSORTED)],...topics().map(tp=>[tp,topicName(tp)])],prev||(filter.type==='topic'?filter.topic:UNSORTED));}
const qt=$('#quickText');
function autosize(area,max=320){area.style.height='auto';area.style.height=Math.min(area.scrollHeight+2,max)+'px';}
let captureVersion=0,capturePromise=null,captured=null,captureKey='',captureFailed=0;
let captureView={state:'idle',message:()=>'',help:[]};
function setCaptureUI(state,message=()=>'',help=[]){
  captureView={state,message,help};
  const panel=$('#capturePanel');panel.hidden=state==='idle';panel.dataset.state=state;
  $('#captureStatus').textContent=message();
  $('#captureHelp').hidden=!help.length;
  for(const [id,key] of [['connectLink','connect'],['retryCapture','retry'],['saveLinkOnly','linkOnly'],['editCapture','edit']])$('#'+id).hidden=!help.includes(key);
  updateQuickSave();
}
function resetCapture(){captureVersion++;captureKey='';capturePromise=null;captured=null;captureFailed=0;$('#capturePreview').replaceChildren();setCaptureUI('idle');}
function updateQuickSave(){
  const raw=qt.value.trim();const xhs=!!xhsURL(raw);const state=captureView.state;
  const b=$('#quickSave');b.disabled=!raw||(xhs&&(state==='reading'||state==='error'));
  b.textContent=xhs?L('保存到资料库','Save to Library'):L('保存','Save');
}
const captureErrors={
  INSTALL:[['浏览器连接器未连接。连接后才能自动读取小红书正文和配图，这条内容还没有保存。','The browser connector is not connected. Connect it to capture RedNote text and images. Nothing has been saved.'],['connect','retry','linkOnly']],
  CONNECTION:[['与浏览器连接器的通信中断，这条内容还没有保存。请刷新页面后重试。','Lost contact with the browser connector. Nothing has been saved. Refresh the page and retry.'],['retry','linkOnly']],
  INVALID_URL:[['无法识别这条小红书链接。请复制完整的分享链接后再粘贴。','This RedNote link could not be recognized. Copy the full share link and paste it again.'],['linkOnly']],
  BUSY:[['另一条笔记正在读取，请稍后重试。','Another note is being captured. Please retry shortly.'],['retry']],
  LOGIN_OR_UNAVAILABLE:[['未能读取这条笔记，内容还没有保存。请在 Chrome 中登录小红书并完成验证，确认链接能打开后重试。','Could not read this note. Nothing has been saved. Sign in to RedNote in Chrome, complete any verification, check that the link opens, then retry.'],['retry','linkOnly']],
  TIMEOUT:[['读取超时，内容还没有保存。请重试。','Capture timed out. Nothing has been saved. Please retry.'],['retry','linkOnly']]
};
function captureFailure(code){const [[zh,en],help]=captureErrors[code]||[['读取失败，内容还没有保存。请检查连接后重试。','Capture failed. Nothing has been saved. Check the connection and retry.'],['retry','linkOnly']];return [()=>L(zh,en),help];}
function previewSkeleton(){const strip=el('div','filmstrip');for(let i=0;i<3;i++)strip.append(el('div','frame is-skeleton skel'));const text=el('div','capture-text');for(const w of ['46%','82%','64%']){const b=el('div','skel skel-line');b.style.width=w;text.append(b);}return [strip,text];}
function renderCapturePreview(){
  const box=$('#capturePreview');box.replaceChildren();if(!captured)return;
  const n=captured.images.length;
  if(n||captureFailed){
    const strip=el('div','filmstrip');strip.setAttribute('role','list');strip.setAttribute('aria-label',L('读取到的配图','Captured images'));
    captured.images.forEach((src,i)=>{const f=el('figure','frame');f.setAttribute('role','listitem');const img=new Image();img.src=src;img.alt=L(`配图 ${i+1}`,`Image ${i+1}`);f.append(img,el('span','frame-index',String(i+1)));strip.append(f);});
    for(let i=0;i<captureFailed;i++){const f=el('div','frame is-missing',L('这张图片未能下载','Image not downloaded'));f.setAttribute('role','listitem');strip.append(f);}
    box.append(strip);
  }
  const text=el('div','capture-text');
  const content=captured.content.trim();
  text.append(el('h3','capture-title',captured.title));
  if(content)text.append(el('p','capture-excerpt',content.length>280?content.slice(0,280)+'…':content));
  const meta=el('p','capture-meta');
  meta.append(el('span','',L(`${n} 张配图`,`${n} ${n===1?'image':'images'}`)));
  if(captureFailed)meta.append(el('span','',L(`${captureFailed} 张未下载`,`${captureFailed} missing`)));
  meta.append(el('span','',L(`正文 ${content.length} 字`,`${content.length} characters of text`)),el('span','',hostOf(captured.url)));
  text.append(meta);box.append(text);
}
async function capture(url){
  const version=++captureVersion;captureKey=url;captured=null;captureFailed=0;
  $('#capturePreview').replaceChildren(...previewSkeleton());
  setCaptureUI('reading',()=>L('识别到小红书链接，正在读取正文和配图…','RedNote link found. Reading text and images…'));
  const pending=(async()=>{
    try{
      let data;
      {await requestCapture('ping');data=await requestCapture('capture',url);}
      if(version!==captureVersion)return null;
      captured=normalizeItem({...data.note,category:$('#quickCategory').value});
      captureFailed=Math.max(0,Number(data.failedImages)||0);
      renderCapturePreview();
      const n=captured.images.length,failed=captureFailed;
      if(failed)setCaptureUI('partial',()=>L(`已读取正文和 ${n} 张配图，另有 ${failed} 张未能下载。可以先保存已读取的内容，或重新读取。`,`Captured the text and ${n} images; ${failed} could not be downloaded. Save what was captured, or retry.`),['retry','edit']);
      else if(!n)setCaptureUI('done',()=>L('已读取正文，这条笔记没有可下载的配图。确认后保存。','Captured the text. This note has no downloadable images. Review, then save.'),['edit']);
      else setCaptureUI('done',()=>L(`已读取正文和 ${n} 张配图。确认无误后保存。`,`Captured the text and ${n} images. Review, then save.`),['edit']);
      return captured;
    }catch(error){
      if(version===captureVersion){$('#capturePreview').replaceChildren();const [message,help]=captureFailure(error.message);setCaptureUI('error',message,help);}
      return null;
    }finally{if(version===captureVersion)capturePromise=null;}
  })();
  capturePromise=pending;return pending;
}
function onQuickInput(){
  autosize(qt);const raw=qt.value.trim();const url=xhsURL(raw);
  if(!raw)resetCapture();
  else if(url){if(url!==captureKey)capture(url);}
  else{
    if(captureKey)resetCapture();
    if(findLink(raw))setCaptureUI('info',()=>L('粘贴时只自动读取小红书。这个链接会作为网页链接保存；请补充正文以供 Agent 使用。','Pasting reads RedNote links only. This URL is saved as a link; add source text for the agent to use.'));
    else setCaptureUI('idle');
  }
  updateQuickSave();
}
qt.oninput=onQuickInput;
qt.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('#quickForm').requestSubmit();}if(e.key==='Escape'&&!qt.value){toggleAdd(false);$('#addToggle').focus();}};
$('#retryCapture').onclick=()=>{const url=xhsURL(qt.value);if(url)capture(url);};
$('#quickCategory').onchange=()=>{if(captured)captured={...captured,category:$('#quickCategory').value};};
function recordFrom(x,extra={}){ // normalized v1 item -> view record
  const topicsArr=x.category&&x.category!==UNSORTED?[x.category]:[];
  return {...x,topics:topicsArr,source:srcOf(x.url),folder:'',kind:srcOf(x.url)==='note'?'note':((x.content||x.images.length)?'post':'link'),status:x.url&&!x.content&&!x.images.length?'link':'full',author:'',...extra};
}
function itemFromText(raw,cat){
  const link=findLink(raw);
  if(link){const rest=raw.replace(link,'').trim();const firstLine=rest.split('\n')[0].replace(/[，,。:：\s]+$/,'').trim();return normalizeItem({title:(firstLine||hostOf(link)).slice(0,160),url:link,content:rest&&rest!==firstLine?rest:'',category:cat});}
  return normalizeItem({title:raw.split('\n')[0].slice(0,160),url:'',content:raw,category:cat});
}
function resetComposer(){qt.value='';autosize(qt);resetCapture();updateQuickSave();}
async function addRecord(rec){
  const dup=rec.url&&items().find(i=>i.url===rec.url);
  if(dup){toast(t('这个链接已在资料库中。'),{label:L('打开','Open'),run:()=>openEditor(dup.id)});return false;}
  await saveItemRecord(rec,{isNew:true});
  toast(inFilter(rec)&&matchesSearch(rec)?t('已保存到资料库'):L(`已保存到“${topicName(rec.topics[0]||UNSORTED)}”`,`Saved to “${topicName(rec.topics[0]||UNSORTED)}”`),{label:L('打开','Open'),run:()=>openEditor(rec.id)});
  return true;
}
$('#quickForm').onsubmit=async e=>{
  e.preventDefault();const raw=qt.value.trim();if(!raw||$('#quickSave').disabled)return;
  $('#quickSave').disabled=true;
  try{
    const cat=$('#quickCategory').value;const source=xhsURL(raw);let x;
    if(source){const note=await(capturePromise||(captured&&captureKey===source?Promise.resolve(captured):capture(source)));if(!note||raw!==qt.value.trim())return;x=normalizeItem({...note,category:cat});}
    else x=itemFromText(raw,cat);
    if(await addRecord(recordFrom(x)))resetComposer();
  }catch(err){toast(t(err.message));}
  finally{updateQuickSave();}
};
$('#saveLinkOnly').onclick=async()=>{
  const raw=qt.value.trim();const url=xhsURL(raw)||findLink(raw);if(!url)return;
  const before=raw.slice(0,raw.indexOf(url)).split('\n').pop().replace(/[【】\s]+$/g,'').trim();
  try{const x=normalizeItem({title:(before||L('未读取的小红书笔记','Unread RedNote note')).slice(0,160),url,content:'',category:$('#quickCategory').value});if(await addRecord(recordFrom(x)))resetComposer();}catch(err){toast(t(err.message));}
};
$('#editCapture').onclick=()=>{if(captured)openEditor(null,recordFrom({...captured,category:$('#quickCategory').value}),{fromCapture:captureKey});};
$('#connectLink').onclick=()=>$('#connectorDialog').showModal();

/* ---------- detail drawer ---------- */
let gallery=[],galleryIndex=0,dirty=false,draftSource='',editTopics=[],editing=null;
function setSaveState(text,isDirty=false){const s=$('#saveState');s.textContent=text;s.classList.toggle('is-dirty',isDirty);}
function markDirty(){if(!dirty){dirty=true;setSaveState(L('有未保存的修改','Unsaved changes'),true);}}
function updateSourceLink(){const u=safeURL($('#url').value.trim());const a=$('#sourceLink');a.hidden=!u;if(u)a.href=u;}
function updateEditorHead(){
  const x=editing&&byId(editing.id);
  $('#editorTitle').textContent=x?L('资料详情','Material details'):L('新建记录','New note');
  $('#editorMeta').textContent=x?[L('保存于 ','Saved ')+fmtDate(x.createdAt,{year:'numeric',month:'short',day:'numeric'}),sourceName(x.source)].join(L('，',', ')):(draftSource?L('读取结果尚未保存','Captured content, waiting to be saved'):'');
}
function renderGallery(){
  const n=gallery.length;$('#viewer').hidden=!n;
  if(n){galleryIndex=Math.max(0,Math.min(galleryIndex,n-1));const img=$('#viewerImage');let failure=$('#remoteImageFailure');if(!failure){failure=el('p','remote-image-failure');failure.id='remoteImageFailure';failure.setAttribute('role','status');$('#viewer').append(failure);}failure.hidden=true;img.hidden=false;img.referrerPolicy='no-referrer';img.onload=()=>{img.hidden=false;failure.hidden=true;};img.onerror=()=>{img.hidden=true;failure.hidden=false;failure.textContent=L('这张图片暂时无法加载，你仍可阅读正文或查看其他配图。','This image is unavailable. You can still read the text or view other images.');};img.src=gallery[galleryIndex];img.alt=L(`第 ${galleryIndex+1} 张图片，共 ${n} 张`,`Image ${galleryIndex+1} of ${n}`);$('#imageCounter').textContent=`${galleryIndex+1} / ${n}`;$('#prevImage').hidden=$('#nextImage').hidden=$('#imageCounter').hidden=n<2;}
  const box=$('#imageGallery');box.replaceChildren();
  gallery.forEach((src,i)=>{
    const wrap=el('div','thumb'+(i===galleryIndex?' is-current':''));
    const pick=h('button',{type:'button',class:'thumb-pick','aria-label':L(`查看第 ${i+1} 张`,`Show image ${i+1}`),'aria-current':i===galleryIndex?'true':null,onclick:()=>{galleryIndex=i;renderGallery();}});const img=new Image();img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';img.onerror=()=>{img.hidden=true;pick.append(el('span','thumb-unavailable',L('不可用','Unavailable')));};img.src=src;pick.append(img);
    const remove=h('button',{type:'button',class:'thumb-remove','aria-label':L(`移除第 ${i+1} 张`,`Remove image ${i+1}`),onclick:()=>{gallery.splice(i,1);if(galleryIndex>=gallery.length)galleryIndex=gallery.length-1;markDirty();renderGallery();$('#imageState').textContent=L('已移除 1 张图片，保存后生效。','Image removed. Save to apply.');}},icon('close',12));
    wrap.append(pick);if(!/^https?:/.test(src))wrap.append(remove);else wrap.title=L('原文中的图片链接；可在正文中编辑','Image link from source text; edit it in the content field');box.append(wrap);
  });
  box.setAttribute('aria-label',L('配图','Images'));
}
function stepImage(d){if(gallery.length<2)return;galleryIndex=(galleryIndex+d+gallery.length)%gallery.length;renderGallery();}
$('#prevImage').onclick=()=>stepImage(-1);$('#nextImage').onclick=()=>stepImage(1);
$('#viewer').onkeydown=e=>{if(e.key==='ArrowLeft'){e.preventDefault();stepImage(-1);}if(e.key==='ArrowRight'){e.preventDefault();stepImage(1);}};

let topicMenuOpen=false,topicActive=0,topicQuiet=false;
function topicOptions(raw){
  const q=raw.trim().slice(0,60),lq=q.toLowerCase();
  const pool=topics().filter(tp=>!editTopics.includes(tp));
  const opts=(lq?pool.filter(tp=>tp.toLowerCase().includes(lq)||topicName(tp).toLowerCase().includes(lq)):pool).map(tp=>({value:tp,label:topicName(tp)}));
  const exists=[...topics(),...editTopics].some(tp=>tp.toLowerCase()===lq||topicName(tp).toLowerCase()===lq);
  if(q&&!exists)opts.push({value:q,label:q,create:true});
  return opts;
}
function renderTopicEditor(){
  const box=$('#topicChips');box.replaceChildren();
  const refocus=()=>$('#topicInput')?.focus();
  for(const tp of editTopics)box.append(h('span',{class:'topic-chip '+topicTone(tp)},topicName(tp),h('button',{type:'button','aria-label':L('移除主题 ','Remove topic ')+tp,onclick:()=>{editTopics=editTopics.filter(x=>x!==tp);markDirty();topicQuiet=true;renderTopicEditor();refocus();}},icon('close',11))));
  const input=h('input',{id:'topicInput',class:'topic-input',role:'combobox','aria-autocomplete':'list','aria-expanded':'false','aria-controls':'topicMenu',autocomplete:'off',placeholder:L('添加主题','Add a topic'),'aria-label':L('添加主题','Add a topic'),maxlength:'60'});
  const menu=h('ul',{id:'topicMenu',class:'topic-menu',role:'listbox','aria-label':L('主题','Topics')});menu.hidden=true;
  let opts=[];
  const countFor=tp=>items().filter(x=>(x.topics||[]).includes(tp)).length;
  const setActive=i=>{
    topicActive=i;
    menu.querySelectorAll('[role=option]').forEach((li,j)=>{li.classList.toggle('active',j===i);li.setAttribute('aria-selected',j===i?'true':'false');if(j===i)li.scrollIntoView({block:'nearest'});});
    if(opts[i])input.setAttribute('aria-activedescendant','topicOpt'+i);else input.removeAttribute('aria-activedescendant');
  };
  const pick=o=>{
    if(!o)return;
    editTopics=cleanTopics([...editTopics,o.value]);
    markDirty();topicQuiet=true;renderTopicEditor();refocus();
  };
  const paint=()=>{
    opts=topicOptions(input.value);
    const empty=!opts.length&&!input.value.trim();
    const show=topicMenuOpen&&(opts.length>0||empty);
    menu.hidden=!show;input.setAttribute('aria-expanded',show?'true':'false');
    if(!show){input.removeAttribute('aria-activedescendant');return;}
    if(empty){menu.replaceChildren(h('li',{class:'topic-menu-hint',role:'presentation'},L('输入名称来新建主题','Type a name to create a topic')));return;}
    menu.replaceChildren(...opts.map((o,i)=>h('li',{id:'topicOpt'+i,role:'option',class:'topic-option'+(o.create?' create':''),onmousedown:e=>e.preventDefault(),onclick:()=>pick(o),onmouseenter:()=>setActive(i)},
      o.create?icon('plus',14):null,
      h('span',{class:'topic-option-label'},o.create?L(`新建主题“${o.label}”`,`Create topic “${o.label}”`):o.label),
      o.create?null:h('span',{class:'topic-option-count'},String(countFor(o.value))))));
    setActive(Math.min(topicActive,opts.length-1));
  };
  const openMenu=()=>{topicMenuOpen=true;topicActive=0;paint();};
  const closeMenu=()=>{topicMenuOpen=false;paint();};
  input.addEventListener('focus',()=>{if(topicQuiet){topicQuiet=false;return;}openMenu();});
  input.addEventListener('click',()=>{if(!topicMenuOpen)openMenu();});
  input.addEventListener('input',()=>{topicMenuOpen=true;topicActive=0;paint();});
  input.addEventListener('blur',closeMenu);
  input.addEventListener('keydown',e=>{
    if(e.isComposing||e.keyCode===229)return;
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){
      e.preventDefault();
      if(!topicMenuOpen){openMenu();return;}
      if(opts.length)setActive((topicActive+(e.key==='ArrowDown'?1:-1)+opts.length)%opts.length);
    }else if(e.key==='Enter'){
      e.preventDefault();
      if(topicMenuOpen&&opts[topicActive])pick(opts[topicActive]);
      else if(input.value.trim())pick(topicOptions(input.value).find(o=>o.label.toLowerCase()===input.value.trim().toLowerCase())||{value:input.value.trim().slice(0,60)});
    }else if(e.key==='Escape'&&topicMenuOpen){
      e.preventDefault();e.stopPropagation();closeMenu();
    }else if(e.key==='Backspace'&&!input.value&&editTopics.length){
      e.preventDefault();editTopics=editTopics.slice(0,-1);markDirty();topicQuiet=true;renderTopicEditor();refocus();
    }
  });
  box.onclick=e=>{if(e.target===box)input.focus();};
  box.append(input,menu);
  $('#categoryList').replaceChildren(...topics().filter(tp=>!editTopics.includes(tp)).map(tp=>h('option',{value:tp})));
  $('#topicHint').textContent=L('可以选择多个主题，也可以输入新主题。','Select multiple topics or type a new one.');
  $('#category').value=editTopics[0]||UNSORTED;
  renderNoteAssist();
}
function renderNoteAssist(){$('#note').placeholder=L('这条资料可以用在什么任务里？','What task could I use this for?');$('#noteAssist').hidden=true;$('#noteAssist').replaceChildren();}


for(const id of ['title','content'])$('#'+id).addEventListener('input',()=>{if(!$('#note').value.trim())renderNoteAssist();});
function renderOrigin(x){
  readingSummaries.detail($('#readingSummary'),x);
  const box=$('#originBox');box.replaceChildren();box.hidden=!x;if(!x)return;
  const rows=[[L('来源','Source'),sourceName(x.source)+(x.author?` · ${x.author}`:'')]];
  if(x.folder)rows.push([L('原收藏夹','Saved in'),x.folder]);
  if(x.via)rows.push([L('导入方式','Came in'),L(`${sourceName(x.via)} 同步，${ago(x.createdAt)}`,`${sourceName(x.via)} sync, ${ago(x.createdAt)}`)]);
  rows.push([L('内容','Content'),x.status==='link'?L('仅链接，正文没有读取','Link only, text not read'):L('完整内容','Full content')]);
  box.append(h('dl',{class:'kv origin-kv'},...rows.map(([k,v])=>h('div',{},h('dt',{},k),h('dd',{},v)))));
  const pb=$('#profileBox');pb.replaceChildren();pb.hidden=!(x.profile||x.repo);
  if(x.profile){
    pb.append(h('div',{class:'profile-top'},el('span','avatar lg',initials(x.title)),h('div',{},h('p',{class:'profile-name'},x.title),h('p',{class:'profile-head'},x.profile.headline))),
      h('p',{class:'label'},L('经历表达（原文）','Experience, as written')),h('ul',{class:'exp-list'},...x.profile.experience.map(e=>h('li',{},e))),
      x.profile.links?.length?h('div',{class:'result-actions'},...x.profile.links.map(l=>externalLink(l.url,l.label))):null,
      h('p',{class:'field-hint'},L('只读取你保存的这个主页，不读取人脉网络。','Only this saved profile is read. Your network is not.')));
  }
  if(x.repo)pb.append(h('div',{class:'repo-line'},icon('repo',16),h('strong',{},`${x.repo.owner}/${x.title}`),h('span',{class:'repo-stats'},icon('star',12),x.repo.stars,' ',x.repo.language)));
}
function renderRelated(x){
  const box=$('#relatedBox');box.replaceChildren();if(!x){box.hidden=true;return;}
  const all=items().filter(y=>y.id!==x.id);
  const scored=all.map(y=>{let s=0,why='';if(x.author&&y.author===x.author){s+=3;why=L('同一作者','Same author');}const shared=y.topics.filter(t=>x.topics.includes(t));if(shared.length){s+=2;why=why||L(`同在 ${topicName(shared[0])}`,`Also in ${topicName(shared[0])}`);}if(x.folder&&y.folder===x.folder){s+=1;why=why||L(`同一收藏夹：${x.folder}`,`Same folder: ${x.folder}`);}return [s,y,why];}).filter(([s])=>s>0).sort((a,b)=>b[0]-a[0]).slice(0,4);
  box.hidden=!scored.length;if(!scored.length)return;
  box.append(h('h3',{class:'label'},L('相关资料','Related materials')),h('ul',{class:'related-list'},...scored.map(([,y,why])=>h('li',{},h('button',{type:'button',class:'related-item',onclick:async()=>{if(await closeEditor())openEditor(y.id);}},h('span',{class:'related-title'},y.title),h('span',{class:'related-why'},`${sourceName(y.source)} · ${why}`))))));
}
function openEditor(id,draft,{fromCapture=''}={}){
  const x=id?byId(id):null;const src=x||draft||null;editing=x;
  $('#saveForm').reset();$('#saveError').textContent='';$('#imageState').textContent='';
  $('#editId').value=x?.id||'';draftSource=fromCapture;
  for(const k of ['title','url','content','note'])$('#'+k).value=src?.[k]||'';
  editTopics=src?[...(src.topics||[])]:($('#quickCategory').value&&$('#quickCategory').value!==UNSORTED?[$('#quickCategory').value]:(filter.type==='topic'?[filter.topic]:[]));
  gallery=src?displayImages(src):[];galleryIndex=0;
  dirty=!!draft;setSaveState(draft?L('尚未保存','Not saved yet'):'',!!draft);
  $('#deleteItem').hidden=!x;
  updateEditorHead();updateSourceLink();renderGallery();if(src&&videoNote(src)&&!gallery.length)$('#imageState').textContent=L('这条视频笔记只有视频链接，导出文件未包含封面。请通过原文链接查看视频。','This video note has no cover image in its export. Open the source link to view the video.');renderTopicEditor();renderOrigin(x);renderRelated(x);
  const dlg=$('#editor');if(!dlg.open)dlg.showModal();
  for(const a of ['title','content','note'])autosize($('#'+a),window.innerHeight*.5);
  $('#editor .drawer-body').scrollTop=0;
  // Existing material opens for reading: focus the sheet, not a text field. A new note starts in the title.
  (x?($('#viewer').hidden?$('#editor .drawer-body'):$('#viewer')):$('#title')).focus({preventScroll:true});
}
async function closeEditor(){
  if(dirty&&!(await askConfirm(L('放弃未保存的修改？','Discard unsaved changes?'),L('放弃修改','Discard changes'),{cancel:L('继续编辑','Keep editing')})))return false;
  dirty=false;$('#editor').close();return true;
}
$('#editor').addEventListener('cancel',e=>{e.preventDefault();closeEditor();});
$('#saveForm').addEventListener('input',e=>{if(e.target.id==='image'||e.target.classList.contains('topic-input'))return;markDirty();if(e.target.id==='url')updateSourceLink();if(e.target.tagName==='TEXTAREA')autosize(e.target,window.innerHeight*.5);});
// The title is a one-line field that wraps: Enter saves, pasted line breaks become spaces.
$('#title').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();$('#saveForm').requestSubmit();}});
$('#title').addEventListener('input',()=>{const el=$('#title');if(/[\r\n]/.test(el.value))el.value=el.value.replace(/\s*[\r\n]+\s*/g,' ');});
$('#add').onclick=()=>openEditor();
const readFile=f=>new Promise((ok,bad)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=()=>bad(r.error);r.readAsDataURL(f);});
$('#image').onchange=async()=>{
  const files=[...$('#image').files];$('#image').value='';let added=0,problem='';
  for(const f of files){
    if(gallery.length>=20){problem=L('每条最多 20 张图片。','Up to 20 images per material.');break;}
    if(!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>3*1024*1024){problem=t('请选择 3 MB 以内的 PNG、JPG 或 WebP 图片。');continue;}
    try{gallery.push(await readFile(f));added++;}catch{problem=L('有一张图片无法读取。','One image could not be read.');}
  }
  if(added){galleryIndex=gallery.length-added;markDirty();}
  renderGallery();
  $('#imageState').textContent=problem||(added?L(`已添加 ${added} 张图片，保存后生效。第一张图片作为封面。`,`Added ${added} ${added===1?'image':'images'}. Save to apply. The first image is the cover.`):'');
};
$('#saveForm').onsubmit=async e=>{
  e.preventDefault();$('#saveError').textContent='';
  const pending=$('#topicChips .topic-input');if(pending?.value.trim()){const name=pending.value.trim().slice(0,60);const match=[...topics(),...editTopics].find(tp=>[tp,topicName(tp)].some(label=>label.toLowerCase()===name.toLowerCase()));editTopics=cleanTopics([...editTopics,match||name]);}
  const btn=$('#saveItem');btn.disabled=true;
  try{
    const prev=editing&&byId(editing.id);
    $('#content').value=reconcilePublicImages($('#content').value,gallery);
    const base=normalizeItem({id:prev?.id||crypto.randomUUID(),...Object.fromEntries(['title','url','content','note'].map(k=>[k,$('#'+k).value])),category:editTopics[0]||UNSORTED,image:gallery[0]||'',images:gallery,createdAt:prev?.createdAt});
    const rec=prev?{...prev,...base,topics:[...editTopics],status:base.content||base.images.length||!base.url?'full':'link'}:recordFrom(base,{topics:[...editTopics]});
    if(rec.url&&items().some(y=>y.url===rec.url&&y.id!==rec.id))throw new Error('这个链接已经收藏了，可以编辑已有资料。');
    for(const tp of editTopics)await addTopicName(tp);
    await saveItemRecord(rec,{isNew:!prev});
    if(!prev&&draftSource&&draftSource===captureKey)resetComposer();
    editing=byId(rec.id);$('#editId').value=rec.id;draftSource='';dirty=false;$('#deleteItem').hidden=false;
    $('#imageState').textContent='';updateEditorHead();renderTopicEditor();renderOrigin(editing);renderRelated(editing);
    setSaveState(L('已保存','Saved'));toast(t('已保存到资料库'));
  }catch(err){$('#saveError').textContent=t(err.message);}
  finally{btn.disabled=false;}
};
$('#deleteItem').onclick=async()=>{
  const x=editing&&byId(editing.id);if(!x)return;
  const list=realList;const index=list.findIndex(y=>y.id===x.id);const raw=list[index];const previousTopics=manualTopics.get(x.id);
  await removeItems([x.id]);dirty=false;$('#editor').close();
  toast(t('已删除这条收藏'),{label:L('撤销','Undo'),run:async()=>{
    if(items().some(y=>y.id===x.id))return;
    {const next=[...realList];next.splice(Math.min(index,next.length),0,raw);const restored=new Map(manualTopics);if(previousTopics)restored.set(x.id,previousTopics);await persistReal(next,restored);afterChange();}
    toast(L('已恢复','Restored'));
  }});
};

/* ---------- file import and export ---------- */
function openImporter(){for(const id of ['settings'])$('#'+id).open&&$('#'+id).close();$('#importStatus').replaceChildren();$('#importStatus').className='import-result';$('#importFile').value='';$('#importer').showModal();}
$('#importButton').onclick=openImporter;
async function importFile(f){
  const status=$('#importStatus');status.className='import-result';status.replaceChildren(el('p','',L(`正在读取 ${f.name}…`,`Reading ${f.name}…`)));
  try{
    if(f.size>30*1024*1024)throw new Error('单次导入上限为 30 MB。');
    const raw=await f.text();const fallback=$('#importCategory').value.trim()||'导入收藏';let incoming=[];let importedTopics=new Map();
    if(/\.(md|markdown)$/i.test(f.name))incoming=[parseMarkdown(raw,f.name,fallback)];
    else if(/\.json$/i.test(f.name)){const data=JSON.parse(raw);if(data?.type==='folio-media-patch'){await previewMediaPatch(data,status);return;}importedTopics=readManualTopics(data?.manualTopics);incoming=Array.isArray(data)?data:data.items;if(!Array.isArray(incoming))throw new Error('JSON 应为资料数组，或包含 items 数组。');}
    else if(/\.html?$/i.test(f.name)){const doc=new DOMParser().parseFromString(raw,'text/html');incoming=[...doc.querySelectorAll('a[href]')].filter(a=>safeURL(a.getAttribute('href'))).map(a=>{const dl=a.closest('dl');const folder=dl?.parentElement?.querySelector(':scope > h3')?.textContent||dl?.previousElementSibling?.textContent;return {title:a.textContent.trim()||a.getAttribute('href'),url:a.getAttribute('href'),category:folder?.trim().slice(0,60)||fallback};});}
    else incoming=raw.split(/\r?\n/).map(s=>s.trim()).filter(s=>safeURL(s)).map(url=>({title:new URL(url).hostname,url,category:fallback}));
    if(incoming.length>2000)throw new Error('单次最多导入 2,000 条资料。');
    if(!incoming.length)throw new Error('没有找到有效资料。');
    let added,skipped,completed=0;
    {const merged=mergeImports(realList,incoming,$('#fillEmptySource').checked);added=merged.added;skipped=merged.skipped;completed=merged.completed;
     const restored = new Map(manualTopics);
     for (const item of merged.items.slice(realList.length)) {
       if (importedTopics.has(item.id)) restored.set(item.id, importedTopics.get(item.id));
     }
     await persistReal(merged.items, importedTopics.size ? restored : undefined);afterChange();}
    status.replaceChildren(el('p','',L(`已导入 ${f.name}`,`Imported ${f.name}`)));
    const stats=el('div','import-stats');
    for(const [n,label] of [[added,L('新增','Added')],[skipped,L('重复已跳过','Duplicates skipped')],[completed,L('补全正文','Source text added')]]){const d=el('div','');d.append(el('strong','',String(n)),el('span','',label));stats.append(d);}
    status.append(stats,h('button',{type:'button',class:'primary',onclick:()=>{$('#importer').close();switchView('organize');}},L('下一步：AI 整理','Next: AI organization')));
  }catch(e){status.className='import-result is-error';status.replaceChildren(el('p','',e instanceof SyntaxError?L('JSON 文件格式无法解析。','The JSON file could not be parsed.'):t(e.message)));}
}
async function previewMediaPatch(pack,status){
  const plan=applyMediaPatch(realList,pack);
  status.replaceChildren(el('h3','',L('补充已收藏笔记的图片','Add images to saved notes')),
    el('p','',L(`可补充 ${plan.updated} 条 · ${plan.protectedCount} 条已有本地配图 · ${plan.unmatched} 条不在当前资料库。`,`Ready: ${plan.updated} · Already have local images: ${plan.protectedCount} · Not in this library: ${plan.unmatched}.`)),
    el('p','fine',L('图片保存在当前浏览器，正文、分类和个人笔记保持原样。保存前自动保留一份本机备份。','Images stay in this browser. Text, topics and personal notes stay unchanged. A local backup is saved before applying.')));
  if(!plan.updated)return;
  status.append(h('button',{type:'button',class:'primary',onclick:async e=>{
    const button=e.currentTarget;button.disabled=true;
    try{
      if(!db)throw Error(L('浏览器存储不可用，未修改资料。','Browser storage is unavailable. Nothing was changed.'));
      const result=applyMediaPatch(realList,pack);
      await new Promise((ok,bad)=>{const tx=db.transaction('state','readwrite'),st=tx.objectStore('state');
        const r=st.get('items');r.onsuccess=()=>{
          // Use current stored records to preserve edits made in another tab.
          const current=r.result||[];const next=applyMediaPatch(current,pack);
          st.put({version:1,createdAt:new Date().toISOString(),items:current,manualTopics:[...manualTopics]},'mediaBackup');
          st.put(next.items,'items');
        };tx.oncomplete=ok;tx.onerror=()=>bad(tx.error);tx.onabort=()=>bad(tx.error||Error('Save cancelled'));
      });
      realList=(await read('items')).map(x=>{try{return normalizeItem(x);}catch{return null;}}).filter(Boolean);
      failedCovers.clear();afterChange();
      status.replaceChildren(el('p','',L(`已为 ${result.updated} 条资料保存图片。刷新后仍可查看。`,`Saved images for ${result.updated} materials. They remain available after refresh.`)),
        h('button',{type:'button',class:'primary',onclick:()=>{$('#importer').close();switchView('library');}},L('查看资料库','View library')),
        h('button',{type:'button',class:'chip',onclick:async()=>saveFile('folio-before-images.json',JSON.stringify(await read('mediaBackup'),null,2))},L('下载修改前备份','Download backup')));
    }catch(error){button.disabled=false;status.append(el('p','is-error',error.message));}
  }},L('保存图片到资料库','Save images to library')));
}
async function importFiles(files){const list=[...files];if(list.length>200||list.reduce((n,f)=>n+f.size,0)>30*1024*1024){toast(L('一次最多 200 个文件，共 30 MB。','Up to 200 files and 30 MB per batch.'));return;}const reports=[];for(const f of list){await importFile(f);reports.push($('#importStatus').cloneNode(true));}if(list.length>1){$('#importStatus').replaceChildren(...reports.map(r=>{r.removeAttribute('id');r.querySelectorAll('button').forEach(b=>b.remove());return r;}),h('button',{type:'button',class:'primary',onclick:()=>{$('#importer').close();switchView('organize');}},L('下一步：AI 整理','Next: AI organization')));}}
$('#importFile').onchange=async()=>{await importFiles($('#importFile').files);$('#importFile').value='';};
const zone=$('#dropzone');
zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('is-over');});
zone.addEventListener('dragleave',()=>zone.classList.remove('is-over'));
zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('is-over');importFiles(e.dataTransfer.files);});
$('#backup').onclick=async()=>{
  $('#settings').close();
  const out=realList;
  if(await saveFile('folio-archive.json',JSON.stringify({version:1,items:out,manualTopics:[...manualTopics]},null,2)))toast(L(`备份已导出，共 ${out.length} 条`,`Backup exported: ${out.length} materials`));
};

/* =====================================================================
   Organize
   ===================================================================== */
const unsortedPick=new Set();
function itemRow(x,{checkbox,onToggle,extra}={}){
  const row=h('li',{class:'org-row'});
  if(checkbox!==undefined)row.append(h('input',{type:'checkbox',checked:checkbox,'aria-label':L('选择 ','Select ')+x.title,onchange:e=>onToggle(e.target.checked)}));
  const cover=coverOf(x);
  row.append(cover?Object.assign(new Image(),{src:cover,alt:'',className:'org-thumb'}):h('span',{class:'org-thumb mark'},x.kind==='profile'?initials(x.title):icon(x.kind==='repo'?'repo':x.status==='link'?'link':'note',16)));
  row.append(h('div',{class:'org-text'},h('button',{type:'button',class:'org-title',onclick:()=>openEditor(x.id)},x.title),h('p',{class:'org-meta'},`${sourceName(x.source)}${x.folder?' · '+x.folder:''}`,x.topics.length?h('span',{},L('现有主题：','Now in: ')+x.topics.map(topicName).join(', ')):null)));
  if(extra)row.append(extra);
  return row;
}
function unsortedCard(list){
  for(const id of [...unsortedPick])if(!list.some(x=>x.id===id))unsortedPick.delete(id);
  const sec=h('section',{class:'group plain'},h('div',{class:'group-head'},h('div',{},h('p',{class:'label'},L('手动整理','Sort by hand')),h('h3',{},L(`未分类（${list.length}）`,`Unsorted (${list.length})`)))),
    h('p',{class:'fine'},L('选中资料，放进一个主题。','Select materials and put them in a topic.')));
  if(!list.length){sec.append(h('p',{class:'fine'},L('都已经有主题了。','Everything has a topic.')));return sec;}
  sec.append(h('ul',{class:'org-list'},...list.map(x=>itemRow(x,{checkbox:unsortedPick.has(x.id),onToggle:on=>{on?unsortedPick.add(x.id):unsortedPick.delete(x.id);renderOrganize();}}))));
  const move=h('select',{'aria-label':L('放进主题','Put in topic')});fillSelect(move,[['',L('选择主题…','Choose a topic…')],...topics().map(tp=>[tp,topicName(tp)]),['__new',L('新主题…','New topic…')]],'');
  sec.append(h('div',{class:'group-actions'},move,h('button',{type:'button',class:'primary',disabled:!unsortedPick.size,onclick:async()=>{let tp=move.value;if(!tp)return move.focus();if(tp==='__new'){tp=await askText(L('新主题名称','New topic name'));if(!tp)return;}const ids=[...unsortedPick];const snap=snapshot(ids,tp);await applyTopic(ids,tp);unsortedPick.clear();remember([`已把 ${ids.length} 条资料放进“${tp}”`,`Put ${ids.length} in “${tp}”`],snap);}},unsortedPick.size?L(`放进主题（${unsortedPick.size}）`,`Put in topic (${unsortedPick.size})`):L('放进主题','Put in topic'))));
  return sec;
}
function renderOrganize(){
 const body=$('#organizeBody');const manualOpen=body.querySelector('.manual-organize')?.open;body.replaceChildren();knowledgeWorkspace.mountOrganize(body);
 const manual=h('details',{class:'manual-organize',open:manualOpen},h('summary',{},L('手动整理','Sort by hand')),unsortedCard(items().filter(x=>!x.topics.length)));body.append(manual);if(undoLog.length)body.append(h('div',{class:'notice-actions'},h('p',{},P(undoLog[0].label)),h('button',{type:'button',class:'ghost',onclick:undoLast},L('撤销','Undo'))));
}

/* Task references use the knowledge workspace and its existing API. */
function openFindWith(ids){knowledgeWorkspace.setScope(ids);switchView('find');}

/* Real RedNote intake, opened as a supporting panel. */
const STATE_TEXT={connected:['已连接','Connected'],error:['需要处理','Action required'],failed:['同步失败','Sync failed'],off:['未连接','Not connected'],ok:['已连接','Connected'],waiting:['等待恢复','Waiting to resume'],partial:['部分失败','Some items failed'],paused:['已暂停','Paused'],syncing:['正在同步','Syncing']};
let connectorState='unknown';
async function checkConnector(){try{await requestCapture('ping');connectorState='ok';}catch{connectorState='off';}if($('#connectionsView').open)renderSources();}
function renderSources(){
 const box=$('#sourceRows');box.replaceChildren();
 if(!(location.port==='5180'&&['localhost','127.0.0.1'].includes(location.hostname)))return;
 const s=xhsSync?.state()||{state:'off'};
 box.append(h('div',{class:'conn-row'},h('span',{class:'conn-mark'},'R'),h('div',{class:'conn-main'},h('h3',{},L('小红书','RedNote')),h('p',{class:'conn-status'},P(STATE_TEXT[s.state]||STATE_TEXT.off)),h('p',{class:'fine'},connectorState==='ok'?L('浏览器连接器已连接','Browser connector connected'):L('需要本机 Chrome 连接器','Local Chrome connector required')),s.problem?h('p',{class:'conn-problem'},P(s.problem)):null),h('div',{class:'conn-actions'},h('button',{class:'primary',type:'button',onclick:()=>{$('#connectionsView').close();xhsSync.open();}},L('立即同步','Sync now')),h('button',{class:'ghost',type:'button',onclick:()=>{$('#connectionsView').close();xhsSync.open();}},L('管理','Manage')))));
}
function openConnections(){
 for(const id of ['settings'])if($('#'+id).open)$('#'+id).close();
 const d=$('#connectionsView');renderSources();if(!d.open)d.showModal();checkConnector();
}

/* =====================================================================
   Settings, dialogs, routing
   ===================================================================== */
for(const b of $$('[data-close]'))b.addEventListener('click',()=>{const d=$('#'+b.dataset.close);if(d.id==='editor')closeEditor();else d.close();});
for(const d of $$('dialog'))d.addEventListener('click',e=>{if(e.target!==d)return;if(d.id==='editor')closeEditor();else if(d.id!=='confirmDialog')d.close();});
function updateSettings(){
  $('#menuCount').textContent=L(`共 ${items().length} 条资料，${topics().length} 个主题`,`${items().length} materials in ${topics().length} topics`);
  $('#appearance').setAttribute('aria-checked',String(document.documentElement.classList.contains('dark')));
  $('#langEn').setAttribute('aria-pressed',String(language==='en'));$('#langZh').setAttribute('aria-pressed',String(language==='zh'));
}
$('#switchCollection').onclick=()=>location.assign(sampleKey?sampleURL(sampleKey,language,experience,{collections:true}):'/?collections=1&library=personal&lang='+language);
$('#settingsButton').onclick=()=>{updateSettings();$('#settings').showModal();};
$('#appearance').onclick=()=>{const on=document.documentElement.classList.toggle('dark');store.set('folio-dark',on?'1':'0');updateSettings();};
$('#langEn').onclick=()=>{if(language!=='en')$('#language').click();};
$('#langZh').onclick=()=>{if(language!=='zh')$('#language').click();};
$('#about').onclick=()=>{$('#settings').close();$('#info').showModal();};
function renderAll(){
 realView=null;
 const stage=knowledgeWorkspace.organizationStage(),ready=stage==='saved';
 const entry=$('#collectionLibraryEntry');if(entry)entry.replaceChildren(h('button',{class:'ghost',type:'button',onclick:openConnections},L('导入更多收藏','Import more saves')));
 const next=$('#libraryNextStep');if(next)next.replaceChildren(h('div',{},h('strong',{},!realList.length?L('从你的第一篇收藏开始','Start with your first save'):ready?L('分类已保存','Your categories are saved'):L(`已载入 ${realList.length} 条收藏`,`${realList.length} saves loaded`)),h('p',{},!realList.length?L('上传 Markdown、备份文件，或粘贴小红书链接。','Upload Markdown, a backup, or paste RedNote links.'):ready?L('把想完成的任务告诉 Folio，从这些收藏中寻找参考。','Tell Folio what you want to do and find useful references.'):stage==='start'?L('下一步，让 AI 根据内容提出分类方式。','Next, let AI suggest topics based on their content.'):L('你的整理进度已保留。继续查看方案或确认分类结果。','Your progress is kept. Continue to review the plan or confirm the results.'))),h('button',{class:'primary',type:'button',onclick:()=>!realList.length?openConnections():switchView(ready?'find':'organize')},!realList.length?L('导入收藏','Import saves'):ready?L('用收藏完成任务 →','Work with your knowledge →'):stage==='start'?L('开始整理 →','Start organizing →'):L('继续整理 →','Continue organizing →')));
 for(const b of $$('[data-library-view]')){const on=b.dataset.libraryView===view;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));}
 if(view==='library')renderLibrary();else if(view==='organize')renderOrganize();else knowledgeWorkspace.mount(kbHost);
}
const VIEWS=['library','organize','find'];
function switchView(next){
 if(next==='connections'){openConnections();return;}
 if(!VIEWS.includes(next))next='find';view=next;
 for(const v of VIEWS)$('#'+v+'View').hidden=v!==next;
 $('#librarySubnav').hidden=next==='find';
 for(const b of $$('[data-view]')){const on=b.dataset.view===(next==='organize'?'library':next);b.classList.toggle('active',on);on?b.setAttribute('aria-current','page'):b.removeAttribute('aria-current');}
 const hash=next==='library'?'#library':'#'+next;
 if(location.hash!==hash)window.history.replaceState(null,'',location.pathname+location.search+hash);
 if(next!=='library'&&selectMode)setSelectMode(false);renderAll();window.scrollTo({top:0});
}
function viewFromHash(){return ({'#library':'library','#organize':'organize','#find':'find'})[location.hash]||'find';}
document.addEventListener('keydown',e=>{
  if(e.key!=='/'||e.metaKey||e.ctrlKey||e.altKey)return;
  const tg=document.activeElement?.tagName;if(['INPUT','TEXTAREA','SELECT'].includes(tg)||$('dialog[open]'))return;
  e.preventDefault();(view==='find'?kbHost.querySelector('textarea'):$('#filter'))?.focus();
});

const collectionFlow=createCollectionFlow({h,L,items:()=>realList,isDemo:()=>false,navigate:switchView,openImporter,openLocal:()=>xhsSync.open(),capture:requestCapture,xhsURL,toast,
 save:async incoming=>{const merged=mergeItems(realList,incoming);await persistReal(merged.items);afterChange();return merged;},
 request:async list=>{const response=await fetch('/api/find',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'organize',items:list.map(({id,title,content,note,category})=>({id,title,content,note,category})),categories:realCategories,language}),signal:AbortSignal.timeout(55000)});const data=await response.json();if(!response.ok)throw Error(t(data.error||'AI 连接失败，请稍后重试。'));return data;},
 apply:async mapping=>{await persistReal(realList.map(x=>mapping.has(x.id)?{...x,category:mapping.get(x.id)}:x));await persistRealCategories([...new Set([...realCategories,...mapping.values()])]);afterChange();},redraw:()=>{if(view==='organize')renderOrganize();}
});

$('#intakeFiles').onclick=()=>{$('#connectionsView').close();openImporter();};
$('#intakeLinks').onclick=()=>{$('#connectionsView').close();collectionFlow.openLinks();};

const kbHost=h('div',{class:'page-inner kb-workspace',id:'kbWorkspace'});$('#findView').append(kbHost);
const knowledgeWorkspace=createKnowledgeWorkspace({h,L,confirm:askConfirm,topicTone,coverOf,showTopic:name=>{filter={type:'topic',topic:name};switchView('library');},summaryOf:x=>{const e=readingSummaries.entry(x);return e?.status==='ready'?L(e.zh,e.en):'';},retrievalItems:()=>items().map(x=>({...x,topics:[...new Set(x.topics.flatMap(name=>[name,topicName(name)]))]})),items:()=>realList,read,write,topicsChanged:()=>{if(view==='library')renderLibrary();},navigate:switchView,openItem:openEditor,openImporter:()=>collectionFlow.open(),
 request:async body=>{const r=await fetch('/api/find',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,language}),signal:AbortSignal.timeout(65000)});const d=await r.json();if(!r.ok)throw Error(d.error||'AI request failed');return d;},
 apply:async mapping=>{await persistReal(realList.map(x=>mapping.has(x.id)?{...x,category:mapping.get(x.id)}:x));await persistRealCategories([...new Set([...realCategories,...mapping.values()])]);afterChange();}
},{tasks:await read('taskSessions'),knowledge:await read('knowledge')});

topicLabelLookup=name=>knowledgeWorkspace.topicName(name);
const readingSummaries=createReadingSummaries({h,L,read,write,items:()=>realList,redraw:()=>{renderLibrary();if($('#editor').open)readingSummaries.detail($('#readingSummary'),editing&&byId(editing.id));},request:async(body,signal)=>{
  const r=await fetch('/api/find',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.any([signal,AbortSignal.timeout(60000)])});
  const data=await r.json();if(!r.ok){const error=Error(t(data.error||'AI request failed'));error.status=r.status;throw error;}return data;
}},(await read('summaries'))||publicCollection.summaries);

/* ---------- language ---------- */
initLanguage(()=>{
  renderAll();updateSettings();updateQuickSave();
  if(captureView.state!=='idle'){$('#captureStatus').textContent=captureView.message();if(captured)renderCapturePreview();}
  if($('#editor').open){updateEditorHead();renderGallery();renderTopicEditor();renderNoteAssist();renderOrigin(editing&&byId(editing.id));renderRelated(editing&&byId(editing.id));if(dirty)setSaveState(L('有未保存的修改','Unsaved changes'),true);}
});

// Bind navigation only after the workspace and summary cache finish loading.
for(const b of $$('[data-view]'))b.addEventListener('click',()=>switchView(b.dataset.view));
for(const b of $$('[data-library-view]'))b.addEventListener('click',()=>switchView(b.dataset.libraryView));
for(const b of $$('[data-open-import]'))b.addEventListener('click',openConnections);
window.addEventListener('hashchange',()=>{const importing=['#connections','#ai-tools'].includes(location.hash);switchView(viewFromHash());if(importing)openConnections();});

/* ---------- start: legacy demo query/session values cannot activate simulation ---------- */
document.body.classList.remove('is-starting');document.querySelector('#startupStatus')?.remove();
updateQuickSave();
if(['installed','memory'].includes(publicCollection.status)&&!location.hash)window.history.replaceState(null,'',location.pathname+location.search+'#library');
const legacyImport=['#connections','#ai-tools'].includes(location.hash);switchView(viewFromHash());
knowledgeWorkspace.localize();if(legacyImport)openConnections();

xhsSync=createXhsSync({db,L,changed:async()=>{const saved=await read('items');if(Array.isArray(saved)){realList=saved.filter(x=>x&&typeof x.title==='string'&&x.title.trim()).map(normalizeItem);}renderAll();}});await xhsSync.init();

if(publicCollection.status==='unavailable')toast(L('公开资料暂时未能加载，请刷新重试或导入自己的收藏。','The public collection could not load. Refresh to retry or import your saves.'));
