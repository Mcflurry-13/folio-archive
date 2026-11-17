import test from 'node:test';
import assert from 'node:assert/strict';
import {xhsURL} from '../public/capture.js';
import {normalizeItem} from '../public/data.js';
import {extractNote} from '../browser-extension/extract.js';
test('share text accepts exact XHS hosts and rejects lookalikes and credentials',()=>{
 assert.equal(xhsURL('31 【灵感】 https://www.xiaohongshu.com/explore/abc?xsec_token=test 我分享了笔记'),'https://www.xiaohongshu.com/explore/abc?xsec_token=test');
 for(const bad of ['https://www.xiaohongshu.com.evil.test/explore/a','https://user:pass@www.xiaohongshu.com/explore/a','javascript:alert(1)'])assert.equal(xhsURL(bad),'');
});
test('gallery survives normalization and backup round trip; unsafe media excluded',()=>{
 const image='data:image/png;base64,YWJj';const image2='data:image/jpeg;base64,ZGVm';
 const x=normalizeItem({title:'参考',images:[image,image,image2,'javascript:alert(1)']});
 assert.equal(x.image,image);assert.deepEqual(x.images,[image,image2]);
 assert.deepEqual(normalizeItem(JSON.parse(JSON.stringify(x))),x);
});
test('extracts note text and ordered original images, excludes avatar and duplicate carousel',()=>{
 const root={querySelector:s=>({'#detail-title':{textContent:'灵感'},'#detail-desc':{innerText:'这是正文'}}[s]),querySelectorAll:()=>[{currentSrc:'https://sns-webpic-qc.xhscdn.com/a/one!thumb'},{src:'https://sns-avatar-qc.xhscdn.com/avatar/a'}]};
 globalThis.location={href:'https://www.xiaohongshu.com/explore/test'};
 globalThis.document={querySelector:()=>root,querySelectorAll:()=>[{content:'http://sns-webpic-qc.xhscdn.com/a/one!full'},{content:'https://sns-webpic-qc.xhscdn.com/a/two!full'},{content:'https://other.test/logo.png'}]};
 const result=extractNote();assert.equal(result.content,'这是正文');assert.equal(result.images.length,2);assert.match(result.images[0],/^https:/);assert.match(result.images[1],/two/);
 globalThis.document.querySelectorAll=()=>[{content:'https://sns-web-i10.rednotecdn.com/a/international!full'}];assert.ok(extractNote().images.some(x=>x.includes('rednotecdn.com')));globalThis.document.querySelector=()=>null;assert.equal(extractNote(),null);
 delete globalThis.document;delete globalThis.location;
});
