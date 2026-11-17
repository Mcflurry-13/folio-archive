import {prepareEmptyLibrary} from './fixtures/empty-library.mjs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const base=process.env.FOLIO_BASE||'http://127.0.0.1:5180/';
try{for(const scenario of ['success','partial','offline','captcha']){
 const context=await browser.newContext();const page=await context.newPage();
 await page.addInitScript(scenario=>window.addEventListener('message',e=>{const m=e.data;if(m?.channel!=='folio-request'||!m.action?.startsWith('xhs.sync.'))return;let data={},error;
 if(scenario==='offline')error='CONNECTION';else if(scenario==='captcha')error='CAPTCHA';
 else if(m.action.endsWith('.session'))data={sessionId:'test',accountKey:'self'};
 else if(m.action.endsWith('.collections'))data={collections:[{id:'saved',name:'My saved',count:2}]};
 else if(m.action.endsWith('.preview'))data={items:[{externalId:'a',title:'A personal website that feels like a creative workspace'},{externalId:'b',title:'Five references for a thoughtful design portfolio'}]};
 else if(m.action.endsWith('.read')){if(scenario==='partial'&&m.externalId==='b')error='UNAVAILABLE';else data={externalId:m.externalId,title:'Reference '+m.externalId,content:'Source evidence',url:'https://www.xiaohongshu.com/explore/'+m.externalId,images:[],warnings:[],collectionIds:['saved']};}
 window.postMessage({channel:'folio-response',id:m.id,ok:!error,data,error:error?{code:error}:undefined},location.origin);
 }),scenario);
 await prepareEmptyLibrary(page);await page.goto(base+'?library=personal');await page.click('[data-open-import]');await page.locator('.conn-row').filter({hasText:'RedNote'}).getByRole('button',{name:'Sync now',exact:true}).click();
 const modal=page.locator('.source-sync-dialog');
 if(['offline','captcha'].includes(scenario)){await modal.getByText(scenario==='offline'?'Waiting:':'Action required:',{exact:false}).waitFor();}
 else{await modal.locator('input[type=radio]').check();await modal.getByRole('button',{name:'Browse notes',exact:true}).click();await modal.locator('input[name=sync-note]')[scenario==='partial'?'last':'first']().check();await modal.getByRole('button',{name:'Read and save',exact:true}).click();await modal.getByRole('heading',{name:'Import results'}).waitFor();
 const items=await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('folio-archive',1);r.onsuccess=()=>{const q=r.result.transaction('state').objectStore('state').get('items');q.onsuccess=()=>resolve(q.result||[]);};}));assert.equal(items.length,scenario==='partial'?0:1);
 await page.reload();await page.click('[data-view=library]');if(items.length)await page.locator('.card').first().waitFor();assert.equal(await page.locator('.card').count(),items.length);
 if(scenario==='success'){
 await page.click('[data-open-import]');await page.locator('.conn-row').filter({hasText:'RedNote'}).getByRole('button',{name:'Manage',exact:true}).click();await modal.getByRole('button',{name:'Browse notes',exact:true}).click();assert.equal(await modal.locator('input[name=sync-note]').first().isDisabled(),true);await page.screenshot({path:'test-output/xhs-single-note-preview.png'});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-output/xhs-single-note-mobile.png'});assert.equal(await page.evaluate(()=>document.querySelector('.source-sync-dialog').scrollWidth>document.querySelector('.source-sync-dialog').clientWidth),false);
 }

 }
 await context.close();console.log('PASS',scenario);
}}finally{await browser.close();}
