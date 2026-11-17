// Opt-in. Uses an isolated Chromium profile and the site's real configured model.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.FOLIO_BASE || 'http://127.0.0.1:5180/';
const labels = ['雾灯计划', '白鹭索引'];
const wanted = { id:'case-1', title:'从发现到决定', content:'案例页可以把一条访谈发现和由此作出的设计决定并排展示。为每个决定写出依据，再附上一条验证结果。', category:'作品集', note:'可以用于重写项目介绍。' };
const other = { id:'case-2', title:'案例页的另一种顺序', content:'先给出项目结果，再展示项目背景。', category:'作品集', note:'' };
for (const label of labels) assert.ok(!JSON.stringify([wanted, other]).includes(label));

const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
 const page = await browser.newPage();
 await page.goto(new URL('?library=personal&lang=en#library',base).href);
 await page.locator('#settingsButton').click();
 await page.locator('#importButton').click();
 await page.locator('#importFile').setInputFiles({name:'test.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,items:[wanted,other]}))});
 await page.locator('#importStatus .import-stats').waitFor();
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:wanted.title,exact:true}).first().click();
 for(const label of labels){
  await page.locator('#topicInput').fill(label);
  await page.locator('#topicInput').press('Enter');
 }
 await page.locator('#saveItem').click();
 await page.waitForFunction(()=>document.querySelector('#saveState').textContent==='Saved');
 await page.keyboard.press('Escape');
 await page.reload();
 await page.goto(new URL('?library=personal&lang=zh#find',base).href);
 const blocks=[];
 page.on('request',r=>{if(r.url().endsWith('/api/find') && r.method()==='POST'){const q=r.postDataJSON();if(q.mode==='kb-search')blocks.push(...q.blocks);}});
 const answer=page.waitForResponse(r=>r.url().endsWith('/api/find')&&r.request().postDataJSON()?.mode==='kb-answer',{timeout:160000});
 const failure=page.locator('.kb-error').waitFor({timeout:160000}).then(async()=>{throw Error(await page.locator('.kb-error').innerText());});
 const question='只从「雾灯计划」或「白鹭索引」这两个主题里找，给我一个能用在项目案例页的具体排版做法。';
 await page.locator('textarea[name=goal]').fill(question);
 await page.locator('.chat-send').click();
 const result=await (await Promise.race([answer,failure])).json();
 assert.deepEqual([...new Set(blocks.map(b=>b.id))],[wanted.id]);
 assert.ok(labels.every(label=>blocks.every(b=>b.topics.includes(label)&&!b.text.includes(label))));
 assert.equal(result.status,'ready',result.summary || result.error);
 assert.equal(result.recommendations.length,1);
 const proof=result.recommendations[0].evidence;
 assert.ok(proof.some(e=>e.id===wanted.id&&e.kind==='source'&&e.quote&&wanted.content.includes(e.quote)));
 await page.locator('.kb-reference-picks').first().waitFor();
 assert.equal(await page.locator('.kb-reference-picks').count(),1);
 assert.ok((await page.locator('.kb-reference-picks').innerText()).includes(wanted.title));
 console.log(JSON.stringify({base,question,model:result.model,version:result.promptVersion,reference:wanted.title,rows:1,quote:proof.find(e=>e.kind==='source').quote,answer:result.draft},null,2));
} finally { await browser.close(); }
