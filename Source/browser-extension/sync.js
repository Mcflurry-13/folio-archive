import {openSavedNote,checkOpenedNote} from './in-page-note.js';
// Domestic-only DOM sync. Never reads cookies, page application state or private APIs.
import {extractNote} from './extract.js';
import {loadSession,saveSession} from './sync-session.js';const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export function inspectDOM(kind){
 const visible=e=>{if(!e||!e.getClientRects().length||getComputedStyle(e).visibility==='hidden'||e.closest('[hidden],[aria-hidden="true"]'))return false;const r=e.getBoundingClientRect();const panel=e.closest('.tab-content-item');if(panel){const p=panel.getBoundingClientRect();const clip=panel.closest('.feeds-tab-container')?.getBoundingClientRect();if(clip&&(p.right<=clip.left||p.left>=clip.right))return false;}return r.right>0&&r.left<innerWidth;};
 const text=document.body?.innerText||'';
 if(location.hostname!=='www.xiaohongshu.com')return {error:'INTERNATIONAL_REDIRECT'};
 if(document.querySelector('[class*="captcha"],#captcha')||/请完成验证|安全验证|拖动滑块/.test(text))return {error:'CAPTCHA'};
 if(document.querySelector('.login-container,.login-modal')||/登录后查看收藏/.test(text))return {error:'LOGIN_REQUIRED'};
 const me=[...document.querySelectorAll('a[href*="/user/profile/"]')].find(a=>a.textContent.trim()==='我');
 if(!me)return {error:'LOGIN_REQUIRED'};
 const accountKey=new URL(me.href).pathname;
 if(kind==='session')return {accountKey,url:me.href};
 // Require the owner's profile and an explicitly selected saved tab.
 if(location.pathname!==accountKey&&!location.pathname.includes('/collection/'))return {error:'OPEN_SAVED'};
 const selected=[...document.querySelectorAll('[aria-selected="true"],.active,.selected')].find(e=>visible(e)&&/^收藏(?:\s*\d+)?$/.test(e.textContent.trim()));
 if(!selected&&!location.pathname.includes('/collection/'))return {error:'OPEN_SAVED'};
 if(kind==='collections'){
  const collections=[{id:'saved',name:'收藏',count:null,url:location.href}];
  for(const a of document.querySelectorAll('a[href*="/collection/"]')){if(!visible(a))continue;const url=new URL(a.href);if(url.origin!==location.origin)continue;const id=url.pathname; if(collections.some(c=>c.id===id))continue;const label=a.innerText.trim();const count=label.match(/(\d+)\s*(?:篇|条)/);collections.push({id,name:label||id,count:count?Number(count[1]):null,url:url.href});}
  return {accountKey,collections,complete:false};
 }
 const items=[];for(const card of document.querySelectorAll('section.note-item')){if(!visible(card))continue;const a=[...card.querySelectorAll('a.cover[href],a.title[href]')].find(visible);if(!a)continue;const u=new URL(a.href);if(u.origin!==location.origin)continue;const id=u.pathname.match(/^\/(?:explore|discovery\/item|user\/profile\/[^/]+)\/([^/?]+)/)?.[1];if(id&&!items.some(i=>i.externalId===id))items.push({externalId:id,url:u.href,title:card.querySelector('.title')?.textContent?.trim()||id});}
 return {accountKey,items};
}
async function dom(tabId,kind){const r=await chrome.scripting.executeScript({target:{tabId},func:inspectDOM,args:[kind]});const d=r[0]?.result;if(!d)throw Error('TIMEOUT');if(d.error)throw Error(d.error);return d;}
async function image(url){const u=new URL(url);if(u.protocol!=='https:'||!u.hostname.endsWith('.xhscdn.com'))throw Error('IMAGE');const r=await fetch(u,{credentials:'omit',redirect:'error',signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('IMAGE');const reader=r.body.getReader();const chunks=[];let total=0;for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>12000000){await reader.cancel();throw Error('IMAGE');}chunks.push(value);}const blob=new Blob(chunks,{type:(r.headers.get('content-type')||'').split(';')[0]});if(blob.size>12000000||!/^image\/(jpeg|png|webp)$/.test(blob.type))throw Error('IMAGE');const bitmap=await createImageBitmap(blob);const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));const canvas=new OffscreenCanvas(Math.round(bitmap.width*scale),Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const out=await canvas.convertToBlob({type:'image/webp',quality:.82});if(out.size>3*1024*1024)throw Error('IMAGE');const bytes=new Uint8Array(await out.arrayBuffer());let str='';for(let i=0;i<bytes.length;i+=8192)str+=String.fromCharCode(...bytes.subarray(i,i+8192));return 'data:image/webp;base64,'+btoa(str);}
export async function syncRequest(m){
 if(m.action==='xhs.sync.session'){
  const tabs=await chrome.tabs.query({url:'https://www.xiaohongshu.com/*'});if(!tabs.length)throw Error('OPEN_SAVED');
  const savedTabs=tabs.filter(t=>{try{const u=new URL(t.url);return u.pathname.startsWith('/user/profile/')&&u.searchParams.get('tab')==='fav';}catch{return false;}});const tab=savedTabs.find(t=>t.active)||savedTabs[0]||tabs.find(t=>t.active)||tabs[0];const d=await dom(tab.id,'session');const sessionId=crypto.randomUUID();await saveSession(sessionId,{tabId:tab.id,accountKey:d.accountKey,candidates:new Map(),collections:new Map(),cancelled:false});return {...d,sessionId};
 }
 const s=await loadSession(m.sessionId);if(!s)throw Error('SESSION_EXPIRED');
 if(m.action==='xhs.sync.control'){s.cancelled=m.command==='cancel';s.paused=m.command==='pause';await saveSession(m.sessionId,s);return {state:m.command};}
 const identity=await dom(s.tabId,'session');if(identity.accountKey!==s.accountKey)throw Error('ACCOUNT_CHANGED');
 if(m.action==='xhs.sync.collections'){const d=await dom(s.tabId,'collections');s.collections=new Map(d.collections.map(c=>[c.id,c]));await saveSession(m.sessionId,s);return d;}
 if(m.action==='xhs.sync.preview'){
  s.cancelled=false;if(m.collectionIds?.length!==1)throw Error('SELECT_ONE_COLLECTION');const result=[];const deadline=Date.now()+30000;
  for(const id of m.collectionIds||[]){if(result.length>=20||Date.now()>deadline)break;const c=s.collections.get(id);if(!c)throw Error('INVALID_COLLECTION');const current=await chrome.tabs.get(s.tabId);if(current.url!==c.url)throw Error('OPEN_SAVED');
   for(let page=0;page<1&&result.length<20&&Date.now()<deadline;page++){
    const d=await dom(s.tabId,'preview');if(d.accountKey!==s.accountKey)throw Error('ACCOUNT_CHANGED');let added=0;
    for(const i of d.items){if(result.some(x=>x.externalId===i.externalId))continue;i.collectionIds=[id];result.push(i);s.candidates.set(i.externalId,i);added++;if(result.length===20)break;}
    if(!added)break;
   }
  }await saveSession(m.sessionId,s);return {items:result.slice(0,20),complete:false,limit:20};
 }
 if(m.action==='xhs.sync.read'){
  if(s.cancelled||s.paused)throw Error('CANCELLED');const c=s.candidates.get(m.externalId);if(!c)throw Error('INVALID_NOTE');
  const tab={id:s.tabId};await dom(tab.id,'preview');
  const opened=(await chrome.scripting.executeScript({target:{tabId:tab.id},func:openSavedNote,args:[c.externalId]}))[0]?.result;
  if(opened?.error)throw Error(opened.error);if(!opened?.clicked)throw Error('CARD_NOT_FOUND');
  let note;
  for(let i=0;i<30;i++){
   await sleep(600);const identity=await dom(tab.id,'session');if(identity.accountKey!==s.accountKey)throw Error('ACCOUNT_CHANGED');
   const current=await loadSession(m.sessionId);if(!current||current.cancelled)throw Error('CANCELLED');
   const check=(await chrome.scripting.executeScript({target:{tabId:tab.id},func:checkOpenedNote,args:[c.externalId]}))[0]?.result;
   if(check?.error)throw Error(check.error);if(!check?.ready)continue;
   const result=await chrome.scripting.executeScript({target:{tabId:tab.id},func:extractNote});note=result[0]?.result;if(note)break;
  }
  if(!note){const status=(await chrome.scripting.executeScript({target:{tabId:tab.id},func:inspectNoteFailure}))[0]?.result;throw Error(status||'NOTE_DOM_NOT_FOUND');}
  const meta=(await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>({author:document.querySelector('.author-container .name')?.textContent?.trim()||'',publishedAt:document.querySelector('.note-container time')?.getAttribute('datetime')||null})}))[0].result;
   const warnings=[];const images=[];let size=0;for(const url of (note.mediaType==='video'?note.images.slice(0,1):note.images)){try{const data=await image(url);if(size+data.length>24000000)throw Error('IMAGE');images.push(data);size+=data.length;}catch{warnings.push('IMAGE_FAILED');}}
   if(note.mediaType==='video')warnings.push('VIDEO_COVER_ONLY');return {...note,...meta,externalId:c.externalId,images,warnings,collectionIds:c.collectionIds};
 }throw Error('UNKNOWN_ACTION');
}

// Classify visible page evidence, without inferring private/deleted from a missing selector.
export function inspectNoteFailure(){
 const text=document.body?.innerText||'';
 if(/笔记已删除|笔记不存在/.test(text))return 'NOTE_DELETED';
 if(/笔记已设为私密|仅作者可见/.test(text))return 'NOTE_PRIVATE';
 if(/访问过于频繁|操作频繁|访问受限/.test(text))return 'SITE_RESTRICTED';
 if(document.readyState!=='complete')return 'PAGE_LOADING_TIMEOUT';
 return 'NOTE_DOM_NOT_FOUND';
}
