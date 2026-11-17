import {chromium} from 'playwright';import assert from 'node:assert/strict';import {mkdir} from 'node:fs/promises';
const base=process.env.FOLIO_BASE||'http://127.0.0.1:5180/';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const p=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base+'?library=personal&lang=en#organize');
 await p.evaluate(async()=>{
  const items=Array.from({length:24},(_,i)=>({id:'progress-'+i,title:i===3?'How to present a service design project on a personal website — 完整展示项目背景、研究过程、关键决策和最终成果':'Website reference '+i,content:i===23?'':'Useful reference for building a website '+i,category:'Unsorted',note:'',url:'https://example.com/'+i,createdAt:Date.now()}));
  const name='Website building',purpose='Making a site',rule='Website references';const topic={id:'web',name,purpose,rule,evidence:[],translations:{source:{name,purpose,rule},en:{name,purpose,rule},zh:{name:'网站制作',purpose:'网站',rule:'网站参考'}}};
  const db=await new Promise(ok=>{const r=indexedDB.open('folio-archive');r.onsuccess=()=>ok(r.result)});await new Promise(ok=>{const t=db.transaction('state','readwrite');t.objectStore('state').put(items,'items');t.objectStore('state').put({draft:[topic],assignments:[{id:items[0].id,topicId:'web',selected:true,reason:'Previous suggestion'}]},'knowledge');t.oncomplete=ok});db.close();
 });
 const read=()=>p.evaluate(async()=>{const db=await new Promise(ok=>{const r=indexedDB.open('folio-archive');r.onsuccess=()=>ok(r.result)});return new Promise(ok=>{const r=db.transaction('state').objectStore('state').get('items');r.onsuccess=()=>ok(r.result)});});
 // Analysis used to show only changing button text. Its actual progress now
 // stays visible through reading and the final taxonomy request.
 let releaseReading,releasePlan;let analysisCalls=0;
 await p.route('**/api/find',async r=>{const q=r.request().postDataJSON();
  assert.ok(['kb-topics','kb-taxonomy'].includes(q.mode));assert.deepEqual(q.mode==='kb-topics'?q.topics:q.approvedTopics,[]);
  if(q.mode==='kb-topics'){analysisCalls++;if(analysisCalls===1)await new Promise(ok=>releaseReading=ok);}
  else await new Promise(ok=>releasePlan=ok);
  const name='Website building',purpose='Making a site',rule='Website references';
  await r.fulfill({json:{topics:[{id:'web',name,purpose,rule,evidence:[],translations:{source:{name,purpose,rule},en:{name,purpose,rule},zh:{name:'网站制作',purpose:'网站',rule:'网站参考'}}}]}});
 });
 await p.reload();await p.getByRole('button',{name:'Continue previous plan',exact:true}).waitFor();assert.equal(await p.locator('.organization-proposal').count(),0);assert.equal(analysisCalls,0);await p.getByRole('button',{name:'Suggest organization',exact:true}).click();
 await p.getByRole('heading',{name:'Reading your saves',exact:true}).waitFor();assert.equal(await p.getByRole('button',{name:'Stop analysis',exact:true}).isVisible(),true);
 await p.waitForFunction(()=>document.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')==='1');
 assert.equal(await p.locator('[role=progressbar]').getAttribute('aria-valuemax'),'24');assert.ok((await read()).every(x=>x.category==='Unsorted'));
 await mkdir('test-output/organization-preview',{recursive:true});await p.screenshot({path:'test-output/organization-preview/00-analysis-reading.png'});
 while(!releaseReading)await new Promise(ok=>setTimeout(ok,20));releaseReading();
 await p.getByRole('heading',{name:'Preparing the topic plan',exact:true}).waitFor();assert.equal(await p.locator('[role=progressbar]').getAttribute('aria-valuenow'),'24');assert.equal(await p.locator('.organization-proposal').count(),0);
 await p.screenshot({path:'test-output/organization-preview/00-analysis-planning.png'});
 while(!releasePlan)await new Promise(ok=>setTimeout(ok,20));releasePlan();await p.getByRole('heading',{name:'Topic plan ready',exact:true}).waitFor();
 assert.equal(await p.getByRole('heading',{name:'Choose how to organize your saves',exact:true}).isVisible(),true);assert.equal(await p.getByRole('button',{name:'Suggest organization',exact:true}).count(),0);assert.equal(analysisCalls,2);assert.ok((await read()).every(x=>x.category==='Unsorted'));
 await p.unroute('**/api/find');
 let release,calls=0;const asked=[];
 await p.route('**/api/find',async r=>{const q=r.request().postDataJSON();assert.equal(q.mode,'kb-review-topics');assert.ok(q.notes.length<=4);asked.push(q.notes.map(n=>n.id));calls++;if(calls===1)await new Promise(ok=>release=ok);if(calls===2)return r.fulfill({status:503,json:{error:'Temporary failure'}});await r.fulfill({json:{results:q.notes.map(n=>({id:n.id,candidates:['progress-2','progress-23'].includes(n.id)?[]:[{topicId:'web',reason:{zh:'正文介绍网站制作。',en:'The source describes building a website.'},evidenceKind:'source',quote:n.source}],message:{zh:'需要补充信息。',en:'More context needed.'}}))}});});
 await p.reload();await p.getByRole('button',{name:'Continue previous plan',exact:true}).click();await p.waitForSelector('.organization-proposal');assert.equal(await p.locator('.org-next').count(),0);assert.equal(await p.locator('.org-legacy').count(),0);
 await p.getByRole('button',{name:'Preview saves in these topics',exact:true}).click();await p.getByRole('heading',{name:'Preparing your organization',exact:true}).waitFor();
 assert.equal(await p.locator('[role=progressbar]').getAttribute('aria-valuenow'),'0');assert.equal(await p.locator('.org-review').count(),0);assert.ok((await read()).every(x=>x.category==='Unsorted'));
 await mkdir('test-output/organization-preview',{recursive:true});await p.screenshot({path:'test-output/organization-preview/01-preparing.png'});
 release();await p.getByRole('heading',{name:'Organization paused',exact:true}).waitFor();assert.equal(await p.locator('[role=progressbar]').getAttribute('aria-valuenow'),'4');assert.equal(await p.locator('.org-review').count(),0);assert.ok((await read()).every(x=>x.category==='Unsorted'));
 const checkProgressRows=async()=>{const rows=await p.locator('.org-progress-row').evaluateAll(nodes=>nodes.map(row=>{const t=row.querySelector('.org-row-title'),s=row.querySelector('.org-row-status'),r=row.getBoundingClientRect(),a=t.getBoundingClientRect(),b=s.getBoundingClientRect();return {title:t.textContent,width:a.width,right:r.right,statusRight:b.right,gap:b.left-a.right,wrap:getComputedStyle(t).whiteSpace,overflow:t.scrollHeight-t.clientHeight};}));assert.equal(rows.length,4);assert.ok(rows[0].title.includes('最终成果'));for(const r of rows){assert.ok(r.width>130);assert.ok(Math.abs(r.statusRight-r.right)<2);assert.ok(r.gap>=11);assert.equal(r.wrap,'normal');assert.ok(r.overflow<2);}assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));};
 await checkProgressRows();await p.screenshot({path:'test-output/organization-preview/02-paused.png'});
 await p.setViewportSize({width:390,height:844});await p.getByRole('button',{name:'切换到中文'}).click();await checkProgressRows();await p.locator('.org-progress').scrollIntoViewIfNeeded();await p.screenshot({path:'test-output/organization-preview/02-paused-mobile.png'});await p.getByRole('button',{name:'Switch to English'}).click();await p.setViewportSize({width:1440,height:1000});
 await p.reload();await p.getByRole('button',{name:'Resume organization',exact:true}).click();await p.getByRole('heading',{name:'Your organization is ready to confirm',exact:true}).waitFor();
 assert.equal(await p.locator('.organization-proposal').count(),0);assert.match(await p.locator('.org-preview-group>summary').innerText(),/22 to confirm/);assert.equal(calls,7);assert.deepEqual(asked[2],asked[1]);assert.equal(asked.filter(ids=>ids.includes('progress-0')).length,1);assert.equal(await p.locator('[role=progressbar]').getAttribute('aria-valuenow'),'24');assert.equal(await p.locator('.org-next').count(),0);assert.ok((await read()).every(x=>x.category==='Unsorted'));assert.ok(!/batch/i.test(await p.locator('.ai-organizer').innerText()));
 await p.locator('.org-preview-group>summary').click();await p.locator('.org-preview-exceptions>summary').click();assert.equal(await p.locator('.org-review-item').count(),24);
 await p.locator('[data-review-id="progress-23"] .org-review-title').click();assert.equal(await p.locator('#editor').evaluate(e=>e.open),true);await p.keyboard.press('Escape');
 await p.locator('[data-review-id="progress-23"] select').selectOption('web');await p.getByRole('button',{name:'Confirm and save 23',exact:true}).waitFor();await p.locator('[data-review-id="progress-0"] select').selectOption('');await p.getByRole('button',{name:'Confirm and save 22',exact:true}).waitFor();
 await p.reload();await p.getByRole('button',{name:'Confirm and save 22',exact:true}).waitFor();assert.equal(await p.locator('[data-review-id="progress-0"] select').inputValue(),'');assert.equal(await p.locator('[data-review-id="progress-23"] select').inputValue(),'web');
 await p.locator('.org-review').scrollIntoViewIfNeeded();await p.screenshot({path:'test-output/organization-preview/03-preview-desktop.png'});
 await p.getByRole('button',{name:'切换到中文'}).click();await p.setViewportSize({width:390,height:844});await p.emulateMedia({reducedMotion:'reduce'});await p.getByRole('button',{name:'确认并保存 22 篇',exact:true}).waitFor();assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(await p.locator('.org-progress-track>span').evaluate(e=>getComputedStyle(e).transitionDuration),'0s');await p.screenshot({path:'test-output/organization-preview/04-mobile.png',fullPage:true});
 await p.getByRole('button',{name:'确认并保存 22 篇',exact:true}).click();await p.getByRole('heading',{name:'分类已保存',exact:true}).waitFor();assert.equal((await read()).filter(x=>x.category==='Website building').length,22);assert.equal(await p.locator('.org-next').count(),1);
 assert.equal(await p.locator('.organization-proposal').count(),0);await p.reload();await p.getByRole('heading',{name:'Organization saved',exact:true}).waitFor();assert.match(await p.locator('.org-preview-group>summary').innerText(),/22 categorized/);assert.doesNotMatch(await p.locator('.org-review').innerText(),/0 to confirm/);assert.equal((await read()).filter(x=>x.category==='Website building').length,22);
 await p.setViewportSize({width:1440,height:1000});await p.locator('.org-actions').scrollIntoViewIfNeeded();const left=await p.locator('.org-edit-actions').boundingBox(),right=await p.locator('.org-next').boundingBox();assert.ok(right.x>left.x+left.width);
 await p.getByRole('button',{name:'Undo organization',exact:true}).click();await p.locator('.org-progress').waitFor({state:'detached'});assert.ok((await read()).every(x=>x.category==='Unsorted'));assert.equal(await p.locator('.org-next').count(),0);assert.deepEqual(errors,[]);
 console.log('PASS visible reading/plan progress, then prepare all before preview, no category writes before confirmation, 4-note recovery checkpoint/reload/retry, no repeated completed requests, grouped choices and exceptions, manual choice/skip persistence, explicit bulk save/undo, bilingual 390px and reduced motion, end-only CTA');
}finally{await browser.close()}
