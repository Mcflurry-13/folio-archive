import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {ADOBE_ID} from '../public/topic-correction.js';
const base=process.env.FOLIO_BASE||'http://127.0.0.1:5180/';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const p=await browser.newPage({viewport:{width:1440,height:1000}});let ai=0;const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/api/find',r=>{ai++;return r.fulfill({status:500,json:{error:'No AI expected'}})});
 const read=()=>p.evaluate(async()=>{const db=await new Promise(ok=>{const r=indexedDB.open('folio-sample-rednote');r.onsuccess=()=>ok(r.result)});const get=k=>new Promise(ok=>{const r=db.transaction('state').objectStore('state').get(k);r.onsuccess=()=>ok(r.result)});const result={items:await get('items'),knowledge:await get('knowledge'),categories:await get('categories')};db.close();return result;});
 const write=async data=>p.evaluate(async data=>{const db=await new Promise(ok=>{const r=indexedDB.open('folio-sample-rednote');r.onsuccess=()=>ok(r.result)});await new Promise(ok=>{const t=db.transaction('state','readwrite');for(const [k,v]of Object.entries(data))t.objectStore('state').put(v,k);t.oncomplete=ok});db.close();},data);
 const reload=async()=>{await p.reload();await p.waitForSelector('.card');};
 await p.goto(base+'?sample=rednote&resume=1&lang=en#library');await p.waitForSelector('.card');
 const fresh=await read();assert.equal(fresh.items.length,100);assert.ok(fresh.items.every(x=>x.category==='未分类'));assert.ok(!fresh.knowledge?.corrections);
 await reload();assert.deepEqual(await read(),fresh);assert.equal(ai,0);
 // Reproduce the exact older seed, with no user organization history.
 const legacy=fresh.items.map(x=>x.id===ADOBE_ID?{...x,category:'职业发展'}:x);
 await write({items:legacy,knowledge:{},categories:[]});await reload();
 const repaired=await read();assert.deepEqual(repaired.items,fresh.items);assert.equal(Object.values(repaired.knowledge.corrections)[0].itemBefore.category,'职业发展');
 await reload();assert.deepEqual(await read(),repaired);
 // A manual category write has a registered category; a confirmed AI run has
 // organization/undo metadata. Neither may be reset or silently recategorized.
 for(const category of ['职业发展','Interactive prototypes','My custom topic']){
  const items=fresh.items.map(x=>x.id===ADOBE_ID?{...x,category,note:'Keep my note'}:x);
  const knowledge={draft:[{id:'i',name:'Interactive prototypes',rule:'Keep this rule',evidence:[{id:ADOBE_ID,quote:'Kept evidence'}]}],organization:{rows:[{id:ADOBE_ID,status:'saved',resolvedBy:'user'}]},undo:[{id:ADOBE_ID,before:'未分类',after:category}]};
  const state={items,knowledge,categories:[category]};await write(state);await reload();assert.deepEqual(await read(),state);
 }
 // No marker required for an explicit manual classification of unchanged source.
 const manual={items:legacy,knowledge:{},categories:['职业发展']};await write(manual);await reload();assert.deepEqual(await read(),manual);
 // Deletions are not resurrected; user-edited source is never reset.
 const edited={items:legacy.slice(0,99).map(x=>x.id===ADOBE_ID?{...x,content:'My rewritten source'}:x),knowledge:{},categories:[]};await write(edited);await reload();assert.deepEqual(await read(),edited);
 await write({items:fresh.items,knowledge:{},categories:[]});await reload();
 await mkdir('test-output/unclassified-entry',{recursive:true});await p.screenshot({path:'test-output/unclassified-entry/desktop.png'});
 await p.getByRole('button',{name:'切换到中文'}).click();assert.ok((await read()).items.every(x=>x.category==='未分类'));
 await p.setViewportSize({width:390,height:844});await p.emulateMedia({reducedMotion:'reduce'});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:'test-output/unclassified-entry/mobile.png'});
 const second=await browser.newPage();await second.goto(base+'?sample=rednote&resume=1&lang=en#library');await second.waitForSelector('.card');
 const secondItems=await second.evaluate(async()=>{const db=await new Promise(ok=>{const r=indexedDB.open('folio-sample-rednote');r.onsuccess=()=>ok(r.result)});const items=await new Promise(ok=>{const r=db.transaction('state').objectStore('state').get('items');r.onsuccess=()=>ok(r.result)});db.close();return items;});assert.equal(secondItems.length,100);assert.ok(secondItems.every(x=>x.category==='未分类'));
 assert.deepEqual(errors,[]);console.log('PASS fresh 100 unsorted in two contexts, legacy seed backup/reset, reload, confirmed/manual classifications and edited/deleted records preserved, bilingual/mobile; no AI on fresh entry, edited-record requests intercepted');
}finally{await browser.close()}
