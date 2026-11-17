import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const base=process.env.FOLIO_BASE||'http://127.0.0.1:5180/';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const readItems=p=>p.evaluate(async()=>{const r=indexedDB.open((await import('/sample-session.js')).sampleArchiveName('rednote',new URLSearchParams(location.search).get('experience')));const db=await new Promise(ok=>r.onsuccess=()=>ok(r.result));const req=db.transaction('state').objectStore('state').get('items');const items=await new Promise(ok=>req.onsuccess=()=>ok(req.result));db.close();return items;});
try{
 await mkdir('test-output',{recursive:true});
 const p=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));let ai=0,images=new Set();
 p.on('request',r=>{if(r.url().includes('/api/find'))ai++;if(r.url().includes('/collection/v1/images/'))images.add(r.url());});
 await p.goto(base+'?lang=en#library');await p.locator('[data-collection=rednote]').click();await p.waitForFunction(()=>document.querySelectorAll('.card').length===100);
 assert.equal((await readItems(p)).length,100);assert.equal(ai,0);
 await p.waitForFunction(()=>[...document.querySelectorAll('.card img')].some(i=>i.complete&&i.naturalWidth>0));
 assert.ok(images.size<253,'Images should not all load on initial view');
 const cached=await p.locator('.card .reading-preview').count();assert.equal(cached,100);assert.equal(await p.locator('.reading-label').filter({hasText:'Overview'}).count(),3);
 // Upgrade a previously imported sample, but leave edited source text, notes and categories intact.
 const upgrade=await p.evaluate(async()=>{
  const payload=await(await fetch('/collection/v1/library.json')).json();
  const [a,b]=Object.keys(payload.sourceUpdates);const {summaryHash}=await import('/summary-data.js');
  const r=indexedDB.open((await import('/sample-session.js')).sampleArchiveName('rednote',new URLSearchParams(location.search).get('experience')));const db=await new Promise(ok=>r.onsuccess=()=>ok(r.result));
  const read=k=>new Promise(ok=>{const q=db.transaction('state').objectStore('state').get(k);q.onsuccess=()=>ok(q.result);});
  const items=await read('items'),cache=await read('summaries');
  const old=items.find(x=>x.id===a);old.content=payload.sourceUpdates[a].fromContent;old.note='Keep my enrichment note';old.category='My category';
  cache[a]={status:'insufficient',hash:summaryHash(old)};
  items.find(x=>x.id===b).content='My manually rewritten source';delete cache[b];
  await new Promise(ok=>{const tx=db.transaction('state','readwrite'),s=tx.objectStore('state');s.put(items,'items');s.put(cache,'summaries');tx.oncomplete=ok;});db.close();
  return {a,b,content:payload.items.find(x=>x.id===a).content};
 });
 await p.reload();await p.waitForSelector('.card');
 const after=await readItems(p),updated=after.find(x=>x.id===upgrade.a);
 assert.equal(updated.content,upgrade.content);assert.equal(updated.note,'Keep my enrichment note');assert.equal(updated.category,'My category');
 assert.equal(after.find(x=>x.id===upgrade.b).content,'My manually rewritten source');
 await p.reload();await p.waitForSelector('.card');assert.deepEqual(await readItems(p),after);
 // Decode every actual deployed image in bounded batches; no browser cookies or user session.
 const decoded=await p.evaluate(async()=>{const {displayImages}=await import('/media-links.js');const d=await(await fetch('/collection/v1/library.json')).json();const urls=d.items.flatMap(displayImages);let ok=0;for(let i=0;i<urls.length;i+=8){await Promise.all(urls.slice(i,i+8).map(src=>new Promise(resolve=>{const img=new Image();img.onload=()=>{ok++;resolve();};img.onerror=resolve;img.src=src;})));}return {total:urls.length,ok};});assert.deepEqual(decoded,{total:253,ok:253});
 await p.screenshot({path:'test-output/public-library-desktop.png',fullPage:false});
 // Detail summary retains useful content while removing the two requested UI fragments.
 const item=(await readItems(p)).find(x=>x.content.includes('![Saved image]'));
 await p.getByRole('button',{name:item.title,exact:true}).first().click();await p.waitForSelector('#editor[open]');
 assert.equal(await p.locator('#readingSummary details,#readingSummary blockquote').count(),0);assert.ok(!(await p.locator('#readingSummary').innerText()).includes('have not been analyzed'));
 await p.locator('#note').fill('Kept in this browser');await p.locator('#saveItem').click();await p.waitForFunction(()=>document.querySelector('#saveState').textContent==='Saved');await p.keyboard.press('Escape');
 await p.reload();await p.waitForSelector('.card');assert.equal((await readItems(p)).length,100);assert.equal((await readItems(p)).find(x=>x.id===item.id).note,'Kept in this browser');
 // A second new browser context receives the same corpus, not the first browser's edits.
 const second=await browser.newPage();await second.goto(base+'?lang=en#library');await second.locator('[data-collection=rednote]').click();await second.waitForFunction(()=>document.querySelectorAll('.card').length===100);assert.equal((await readItems(second)).find(x=>x.id===item.id).note,'');
 // Intentional deletion must not resurrect records.
 await second.evaluate(async()=>{const r=indexedDB.open((await import('/sample-session.js')).sampleArchiveName('rednote',new URLSearchParams(location.search).get('experience')));const db=await new Promise(ok=>r.onsuccess=()=>ok(r.result));await new Promise(ok=>{const t=db.transaction('state','readwrite');t.objectStore('state').put([],'items');t.oncomplete=ok;});db.close();});await second.reload();await second.waitForSelector('#empty');assert.equal((await readItems(second)).length,0);await second.close();
 await p.setViewportSize({width:390,height:844});await p.emulateMedia({reducedMotion:'reduce'});await p.screenshot({path:'test-output/public-library-mobile.png',fullPage:false});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);console.log('PASS two fresh browser contexts, 100 real records, 253 decoded images, lazy loading, 97 summaries and 3 owner captions, local edits/reload, empty library retained, mobile, no AI requests');
}finally{await browser.close();}
