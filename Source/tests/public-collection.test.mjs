import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validatePublicCollection,installPublicCollection,publicRefresh} from '../public/public-collection.js';
import {summaryHash,cardLineProblem,cardKind} from '../public/summary-data.js';
const data=JSON.parse(await readFile(new URL('../public/collection/v1/library.json',import.meta.url),'utf8'));
test('source refresh patches only unchanged text, preserving edits, deletions and repeat refreshes',()=>{
 const old={id:'one',title:'A note',content:'Original short text',note:'My note',category:'My topic',images:['my-image']};
 const enriched={...old,content:'Original short text plus a verified source passage that is long enough for a card.'};
 const ready={status:'ready',hash:summaryHash(enriched),zh:'方法：测试。',en:'Method: test.'};
 const payload={items:[enriched],sourceUpdates:{one:{fromContent:old.content}},summaries:{one:ready}};
 const result=publicRefresh([old],{one:{status:'insufficient',hash:summaryHash(old)}},payload);
 assert.equal(result.count,1);assert.equal(result.changedItems,true);assert.deepEqual(result.items,[enriched]);
 assert.equal(result.items[0].note,'My note');assert.equal(result.items[0].category,'My topic');
 const repeat=publicRefresh(result.items,result.summaries,payload);assert.equal(repeat.count,0);assert.equal(repeat.changedItems,false);
 const edited={...old,content:'My edited text'};const untouched=publicRefresh([edited],{},payload);
 assert.deepEqual(untouched.items,[edited]);assert.deepEqual(untouched.summaries,{});
 assert.deepEqual(publicRefresh([],{},payload).items,[]);
 assert.equal(publicRefresh([old],{}, {...payload,sourceUpdates:{}}).changedItems,false);
 const renamed={...old,title:'My title'};const renameResult=publicRefresh([renamed],{},payload);
 assert.equal(renameResult.items[0].title,'My title');assert.deepEqual(renameResult.summaries,{});
});
test('approved public snapshot: 100 unique records, no personal notes, 253 lazy image links, valid cached summaries',()=>{
 const v=validatePublicCollection(data);assert.equal(v.items.length,100);assert.ok(v.items.every(x=>!x.note&&!x.image&&!x.images.length&&x.category==='未分类'));
 assert.equal(v.items.reduce((n,x)=>n+(x.content.match(/!\[Saved image\]/g)||[]).length,0),253);
 assert.equal(Object.keys(v.summaries).length,100);assert.equal(Object.values(v.summaries).filter(s=>s.status==='ready').length,100);assert.equal(Object.values(v.summaries).filter(s=>s.status==='insufficient').length,0);assert.equal(Object.values(v.summaries).filter(s=>s.origin==='owner-caption').length,3);assert.ok(v.items.every(x=>!x.content.includes('收藏专辑:')));
 assert.throws(()=>validatePublicCollection({...data,items:[data.items[0],...data.items.slice(0,-1)]}),/Duplicate/);
});
test('existing libraries including deliberately emptied libraries never fetch or seed',async()=>{
 for(const value of [[],[{id:'user-edit'}]])assert.equal((await installPublicCollection(null,async()=>value,()=>{throw Error('must not fetch')})).status,'existing');
});
test('first-visit network failure remains retryable; no-storage session can still read public records',async()=>{
 assert.equal((await installPublicCollection(null,async()=>undefined,async()=>({ok:false}))).status,'unavailable');
 const v=await installPublicCollection(null,async()=>undefined,async()=>({ok:true,json:async()=>data}));assert.equal(v.status,'memory');assert.equal(v.items.length,100);
});

const xData=JSON.parse(await readFile(new URL('../public/collection/x-v1/library.json',import.meta.url),'utf8'));
test('X snapshot contains 100 distinct public summaries; source view excludes editorial suggestions and media metadata',async()=>{
 const {sourceView}=await import('../public/knowledge.js');const v=validatePublicCollection(xData);
 assert.equal(v.items.length,100);assert.ok(v.items.every(x=>x.url.startsWith('https://x.com/')&&!x.note&&x.category==='未分类'));
 assert.ok(v.items.every(x=>sourceView(x).body.includes('Curated source summary')&&!sourceView(x).body.includes('## Saved previews')));
 assert.equal(v.items.filter(x=>x.content.includes('![Saved image]')).length,61);
});
test('explicit selection fetches only that corpus and rejects a wrong response or unknown key',async()=>{
 let url;const fetcher=async path=>{url=path;return {ok:true,json:async()=>xData};};
 const r=await installPublicCollection(null,async()=>undefined,fetcher,'x');assert.equal(r.status,'memory');assert.equal(url,'/collection/x-v1/library.json');
 assert.equal((await installPublicCollection(null,async()=>undefined,fetcher,'rednote')).status,'unavailable');
 assert.equal((await installPublicCollection(null,async()=>undefined,()=>{throw Error('must not fetch');},'anything')).status,'unavailable');
});

// 2026-11-15 (cards-v5): every model-written card in both shipped collections passes the same checks the app applies
// to new cards, and starts with one of the twelve listed kinds. Owner-approved overview captions are a separate origin.
test('shipped reading cards follow the card rules: one finished sentence, a listed kind, the same kind in both languages',()=>{
 for(const d of [data,xData]){
  const cards=Object.values(validatePublicCollection(d).summaries).filter(c=>c.status==='ready'&&c.origin!=='owner-caption');
  assert.ok(cards.length>=97);
  for(const c of cards){assert.equal(cardLineProblem(c.zh,'zh'),'',c.zh);assert.equal(cardLineProblem(c.en,'en'),'',c.en);assert.equal(cardKind(c.zh,'zh'),cardKind(c.en,'en'),c.zh);}
 }
});
