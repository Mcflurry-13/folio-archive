// Browser-session-only task metadata; no cookies, credentials or imported content.
const prefix='folio-xhs-session:';
const lifetime=2*60*60*1000;
export async function saveSession(id,s){
 const all=await chrome.storage.session.get(null);
 const expired=Object.entries(all).filter(([key,value])=>key.startsWith(prefix)&&value.expiresAt<Date.now()).map(([key])=>key);
 if(expired.length)await chrome.storage.session.remove(expired);
 await chrome.storage.session.set({[prefix+id]:{...s,candidates:[...s.candidates],collections:[...s.collections],expiresAt:s.expiresAt||Date.now()+lifetime}});
}
export async function loadSession(id){
 if(typeof id!=='string')return null;
 const key=prefix+id;const raw=(await chrome.storage.session.get(key))[key];
 if(!raw)return null;
 if(raw.expiresAt<Date.now()){await chrome.storage.session.remove(key);return null;}
 return {...raw,candidates:new Map(raw.candidates),collections:new Map(raw.collections)};
}
