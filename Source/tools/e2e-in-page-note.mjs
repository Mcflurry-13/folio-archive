import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {openSavedNote,checkOpenedNote} from '../browser-extension/in-page-note.js';
import {inspectDOM} from '../browser-extension/sync.js';
import {extractNote} from '../browser-extension/extract.js';
const b=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
const ctx=await b.newContext();const p=await ctx.newPage();
await p.route('https://www.xiaohongshu.com/**',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<a href="/user/profile/self">我</a><span class="active">收藏</span><div style="display:none"><section class="note-item"><a class="cover" href="/explore/private">Hidden own private post</a></section></div><section class="note-item"><a hidden href="/explore/n1">bare link</a><a class="cover" href="/user/profile/self/n1?source=fixture"><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" width="100" height="100"></a></section><div class="feeds-tab-container" style="position:relative;margin-left:200px;width:500px;overflow:hidden"><div class="tab-content-item" style="width:500px;transform:translateX(-100%)"><section class="note-item"><a class="cover" href="/explore/offscreen">Offscreen own post</a></section></div></div><script>document.querySelectorAll('.cover')[1].onclick=e=>{e.preventDefault();history.pushState({},'',e.currentTarget.href);document.body.insertAdjacentHTML('beforeend','<div class="note-container"><h1 id="detail-title">Fixture title</h1><div id="detail-desc">Fixture source body</div></div>');}</script>`}));
await p.goto('https://www.xiaohongshu.com/user/profile/self?tab=fav');
assert.deepEqual((await p.evaluate(inspectDOM,'preview')).items.map(x=>x.externalId),['n1']);assert.deepEqual(await p.evaluate(openSavedNote,'private'),{error:'CARD_NOT_FOUND'});
assert.deepEqual(await p.evaluate(openSavedNote,'offscreen'),{error:'CARD_NOT_FOUND'});
assert.deepEqual(await p.evaluate(openSavedNote,'n1'),{clicked:true});assert.equal(ctx.pages().length,1);
assert.deepEqual(await p.evaluate(checkOpenedNote,'n1'),{ready:true});assert.equal((await p.evaluate(extractNote)).content,'Fixture source body');
assert.deepEqual(await p.evaluate(checkOpenedNote,'n2'),{error:'NOTE_ID_MISMATCH'});assert.deepEqual(await p.evaluate(openSavedNote,'n1'),{error:'CLOSE_NOTE_FIRST'});
await p.evaluate(()=>history.replaceState({},'','/404'));assert.deepEqual(await p.evaluate(checkOpenedNote,'n1'),{error:'NOTE_WEB_UNAVAILABLE'});
console.log('PASS in-page cover click, same-tab extraction, identity guard, modal guard, 404 guard');
}finally{await b.close();}
