import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.FOLIO_BASE || 'http://127.0.0.1:5180/';
const browser = await chromium.launch({executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const openLibrary = async () => {
  const page = await browser.newPage({viewport:{width:1440,height:960}});
  await page.goto(base + '?library=personal&lang=en#library');
  await page.locator('#settingsButton').waitFor();
  return page;
};
async function restoreFile(page, data) {
  await page.locator('#settingsButton').click();
  await page.locator('#importButton').click();
  await page.locator('#importFile').setInputFiles({name:'archive.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
  await page.locator('#importStatus .import-stats').waitFor();
  await page.keyboard.press('Escape');
}
const rail = (page, name) => page.locator('#topicList button').filter({has:page.getByText(name,{exact:true})});
const count = async (page, name) => Number(await rail(page,name).locator('.space-count').textContent());
const openNote = page => page.getByRole('button',{name:'Layout example 0',exact:true}).first().click();
async function saveNote(page) {
  await page.locator('#saveItem').click();
  await page.waitForFunction(() => document.querySelector('#saveState').textContent === 'Saved');
  await page.keyboard.press('Escape');
}
try {
  const page = await openLibrary();
  const items = Array.from({length:100},(_,i)=>({id:'note-'+i,title:'Layout example '+i,content:'A layout reference for a project.',category:'Layouts',note:'Personal comment'}));
  await restoreFile(page,{version:1,items});
  await openNote(page);
  await page.locator('#topicInput').fill('Portfolio');
  await page.locator('#topicInput').press('Enter');
  await saveNote(page);
  await page.reload();
  assert.equal(await count(page,'All materials'),100);
  assert.equal(await count(page,'Layouts'),100);
  assert.equal(await count(page,'Portfolio'),1);
  await rail(page,'Portfolio').click();
  assert.equal(await page.locator('.card').count(),1);
  await openNote(page);
  assert.equal(await page.locator('#topicChips .topic-chip').count(),2);
  await page.keyboard.press('Escape');
  await page.locator('#settingsButton').click();
  const download = page.waitForEvent('download');
  await page.locator('#backup').click();
  const archived = JSON.parse(await readFile(await (await download).path(),'utf8'));
  const restored = await openLibrary();
  await restoreFile(restored,archived);
  assert.equal(await count(restored,'Portfolio'),1);
  assert.equal(await count(restored,'Layouts'),100);
  await openNote(restored);
  await restored.getByRole('button',{name:'Remove topic Layouts',exact:true}).click();
  await restored.getByRole('button',{name:'Remove topic Portfolio',exact:true}).click();
  await saveNote(restored);
  assert.equal(await count(restored,'Unsorted'),1);
  assert.equal(await count(restored,'All materials'),100);

  // Seed only the reviewed topic plan. Exercise the real preview, confirmation and undo controls.
  await page.evaluate(async () => {
    const topic = {id:'cases',name:'Case studies',purpose:'Study project examples',rule:'Include project layout references.',evidence:[]};
    const db = await new Promise(resolve=>{const r=indexedDB.open('folio-archive');r.onsuccess=()=>resolve(r.result);});
    await new Promise(resolve=>{const t=db.transaction('state','readwrite');t.objectStore('state').put({draft:[topic],confirmedTopics:[topic]},'knowledge');t.oncomplete=resolve;});
    db.close();
  });
  await page.route('**/api/find',async route=>{
    const q=route.request().postDataJSON();
    if(q.mode==='kb-translate-topics') return route.fulfill({json:{topics:q.topics.map(t=>({id:t.id,zh:t,en:t}))}});
    assert.equal(q.mode,'kb-review-topics');
    await route.fulfill({json:{results:q.notes.map(n=>({id:n.id,candidates:[{topicId:'cases',reason:{en:'Matches the rule.',zh:'符合规则。'},evidenceKind:'source',quote:n.source}],message:{en:'',zh:''}}))}});
  });
  await page.goto(base+'?library=personal&lang=en#organize');
  await page.reload();
  await page.getByRole('button',{name:'Preview saves in these topics',exact:true}).click();
  await page.getByRole('button',{name:'Confirm and save 100',exact:true}).click();
  await page.getByRole('heading',{name:'Organization saved',exact:true}).waitFor();
  await page.goto(base+'?library=personal&lang=en#library');
  await page.reload();
  assert.equal(await count(page,'Case studies'),100);
  assert.equal(await count(page,'Portfolio'),1);
  assert.equal(await count(page,'All materials'),100);
  await page.goto(base+'?library=personal&lang=en#organize');
  await page.reload();
  await page.getByRole('button',{name:'Undo organization',exact:true}).click();
  await page.locator('.org-progress').waitFor({state:'detached'});
  await page.goto(base+'?library=personal&lang=en#library');
  await page.reload();
  assert.equal(await count(page,'Layouts'),100);
  assert.equal(await count(page,'Portfolio'),1);
  console.log('PASS 100 unique saves, 101 topic memberships, detail editing, filtering, refresh, JSON export/restore, removal, organization and undo preserve manual topics.');
} finally { await browser.close(); }
