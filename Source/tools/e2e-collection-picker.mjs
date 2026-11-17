import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const base=process.env.FOLIO_BASE||'http://127.0.0.1:5180/';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 await mkdir('test-output',{recursive:true});
 const p=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];let corpus=0,ai=0;
 p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(/collection\/.*library.json/.test(r.url()))corpus++;if(r.url().includes('/api/find'))ai++;});
 await p.goto(base+'?lang=en');await p.waitForSelector('.collection-welcome');assert.equal(corpus,0);assert.equal(ai,0);assert.equal(await p.locator('main').isVisible(),false);
 await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Switch to Chinese');await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>document.activeElement.dataset.collection),'x');
 await p.screenshot({path:'test-output/collection-picker-desktop.png'});
 await p.getByRole('button',{name:'Switch to Chinese'}).click();assert.match(await p.locator('#welcomeTitle').innerText(),/让收藏/);
 await p.setViewportSize({width:390,height:844});await p.emulateMedia({reducedMotion:'reduce'});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 const cards=await p.locator('.welcome-choice').first().boundingBox();assert.ok(cards.width>300);assert.ok(await p.locator('.welcome-choice').first().evaluate(e=>parseFloat(getComputedStyle(e).transitionDuration)<=0.00001));
 await p.screenshot({path:'test-output/collection-picker-mobile.png',fullPage:true});
 // Failed download is visible and retryable, without silently installing the other corpus.
 let failed=false;await p.route('**/collection/x-v1/library.json',async r=>{if(!failed){failed=true;return r.fulfill({status:503,body:'Unavailable'});}return r.continue();});
 await p.locator('[data-collection=x]').click();await p.waitForSelector('.welcome-status[role=alert]');assert.equal(await p.locator('.welcome-choice:disabled').count(),0);
 await p.locator('[data-collection=x]').click();await p.waitForFunction(()=>document.querySelectorAll('.card').length===100);assert.equal(await p.locator('.collection-welcome').count(),0);assert.equal(ai,0);
 const data=await p.evaluate(async()=>{const req=indexedDB.open((await import('/sample-session.js')).sampleArchiveName('x',new URLSearchParams(location.search).get('experience')));const db=await new Promise(r=>req.onsuccess=()=>r(req.result));const q=db.transaction('state').objectStore('state').get('items');const items=await new Promise(r=>q.onsuccess=()=>r(q.result));db.close();return items;});
 assert.equal(data.length,100);assert.ok(data.every(x=>x.url.startsWith('https://x.com/')&&x.category==='未分类'&&!x.note));
 const decoded=await p.evaluate(async()=>{const {displayImages}=await import('/media-links.js');const d=await(await fetch('/collection/x-v1/library.json')).json();const urls=[...new Set(d.items.flatMap(displayImages))];let ok=0;for(let i=0;i<urls.length;i+=8)await Promise.all(urls.slice(i,i+8).map(src=>new Promise(r=>{const img=new Image();img.onload=()=>{ok++;r();};img.onerror=r;img.src=src;})));return {total:urls.length,ok};});assert.deepEqual(decoded,{total:67,ok:67});
 const entry=data.find(x=>x.content.includes('![Saved image]'));
 await p.getByRole('button',{name:entry.title,exact:true}).first().click();await p.waitForSelector('#editor[open]');assert.ok(await p.locator('#content').inputValue().then(x=>x.includes('Curated source summary')));await p.keyboard.press('Escape');
 await p.reload();await p.waitForFunction(()=>document.querySelectorAll('.card').length===100);assert.equal(await p.locator('.collection-welcome').count(),0);
 await p.screenshot({path:'test-output/x-library-mobile.png',fullPage:false});
 await p.setViewportSize({width:1440,height:1000});await p.locator('#language').click();await p.screenshot({path:'test-output/x-library-desktop.png',fullPage:false});
 assert.deepEqual(errors,[]);console.log('PASS first-visit picker, no early corpus/AI requests, keyboard, bilingual, mobile/reduced motion, failed download retry, 100 X records, 67 decoded previews, detail and reload persistence');
}finally{await browser.close();}
