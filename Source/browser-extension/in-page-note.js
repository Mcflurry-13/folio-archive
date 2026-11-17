// Injected functions must be self-contained. Click only a saved card's cover.
export function openSavedNote(externalId){
 if(location.hostname!=='www.xiaohongshu.com')return {error:'INTERNATIONAL_REDIRECT'};
 if(document.querySelector('.note-container, #noteContainer'))return {error:'CLOSE_NOTE_FIRST'};
 const visible=e=>{if(!e||!e.getClientRects().length||getComputedStyle(e).visibility==='hidden'||e.closest('[hidden],[aria-hidden="true"]'))return false;const r=e.getBoundingClientRect();const panel=e.closest('.tab-content-item');if(panel){const p=panel.getBoundingClientRect();const clip=panel.closest('.feeds-tab-container')?.getBoundingClientRect();if(clip&&(p.right<=clip.left||p.left>=clip.right))return false;}return r.right>0&&r.left<innerWidth;};
 for(const card of document.querySelectorAll('section.note-item')){
  if(!visible(card))continue;
  const matches=[...card.querySelectorAll('a[href]')].filter(a=>{try{const u=new URL(a.href,location.href);return u.origin===location.origin&&u.pathname.match(/^\/(?:explore|discovery\/item|user\/profile\/[^/]+)\/([^/?]+)/)?.[1]===externalId;}catch{return false;}});
  const target=matches.find(a=>a.matches('a.cover')&&visible(a))||matches.find(a=>a.querySelector('img')&&visible(a));
  if(!target)continue;
  // Do not use bare/hidden anchors or manufacture a signed link.
  if(target.target==='_blank')return {error:'MANUAL_OPEN_REQUIRED'};
  target.scrollIntoView({block:'center'});target.click();return {clicked:true};
 }
 return {error:'CARD_NOT_FOUND'};
}
export function checkOpenedNote(externalId){
 if(location.hostname!=='www.xiaohongshu.com')return {error:'INTERNATIONAL_REDIRECT'};
 if(location.pathname.startsWith('/404'))return {error:'NOTE_WEB_UNAVAILABLE'};
 const id=location.pathname.match(/^\/(?:explore|discovery\/item|user\/profile\/[^/]+)\/([^/?]+)/)?.[1];
 if(id&&id!==externalId)return {error:'NOTE_ID_MISMATCH'};
 return {ready:id===externalId&&!!document.querySelector('.note-container, #noteContainer')};
}
