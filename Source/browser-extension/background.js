import {syncRequest} from './sync.js';
import {extractNote} from './extract.js';
let running=false;
function allowed(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(['www.xiaohongshu.com','xiaohongshu.com','www.rednote.com','rednote.com','xhslink.com','www.xhslink.com'].includes(u.hostname))&&(/^\/(explore|discovery\/item|user\/profile)\//.test(u.pathname)||u.hostname.endsWith('xhslink.com'));}catch{return false;}}
async function download(url){
 const u=new URL(url);if(u.protocol!=='https:'||!(u.hostname.endsWith('.xhscdn.com')||u.hostname.endsWith('.rednotecdn.com')))throw Error('IMAGE');
 const r=await fetch(url,{credentials:'omit',redirect:'error',signal:AbortSignal.timeout(12000)});
 if(!r.ok||!/^image\/(jpeg|png|webp)(;|$)/.test(r.headers.get('content-type')||''))throw Error('IMAGE');
 const reader=r.body.getReader();let total=0,chunks=[];
 while(true){const {value,done}=await reader.read();if(done)break;total+=value.length;if(total>3*1024*1024){await reader.cancel();throw Error('IMAGE');}chunks.push(value);}
 let binary='';for(const chunk of chunks)for(let i=0;i<chunk.length;i+=8192)binary+=String.fromCharCode(...chunk.subarray(i,i+8192));
 return `data:${r.headers.get('content-type').split(';')[0]};base64,${btoa(binary)}`;
}
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
 if(m.action!=='capture')return;
 if(!sender.url||!['http://127.0.0.1:5180','http://localhost:5180'].includes(new URL(sender.url).origin)||!allowed(m.url)){reply({error:'INVALID_URL'});return;}
 if(running){reply({error:'BUSY'});return;}running=true;
 (async()=>{let tab;try{
  tab=await chrome.tabs.create({url:m.url,active:false});let note;
  for(let i=0;i<35;i++){
   await new Promise(r=>setTimeout(r,600));
   try{const result=await chrome.scripting.executeScript({target:{tabId:tab.id},func:extractNote});note=result[0]?.result;if(note)break;}catch{}
  }
  if(!note)throw Error('LOGIN_OR_UNAVAILABLE');
  const originals=note.images;note.images=[];let bytes=0,failed=0;
  for(const url of originals){try{const data=await download(url);if(bytes+data.length>24000000){failed++;continue;}note.images.push(data);bytes+=data.length;}catch{failed++;}}
  reply({note,failedImages:failed});
 }catch(e){reply({error:e.message||'CONNECTION'});}finally{running=false;if(tab?.id)try{await chrome.tabs.remove(tab.id);}catch{}}})();
 return true;
});

chrome.runtime.onMessage.addListener((m,sender,reply)=>{
 if(!['xhs.sync.session','xhs.sync.collections','xhs.sync.preview','xhs.sync.read','xhs.sync.control'].includes(m.action))return;
 if(!sender.url||!['http://127.0.0.1:5180','http://localhost:5180'].includes(new URL(sender.url).origin)){reply({ok:false,error:{code:'ORIGIN'}});return;}
 syncRequest(m).then(data=>reply({ok:true,data}),e=>reply({ok:false,error:{code:e.message,retryable:true}}));return true;
});
