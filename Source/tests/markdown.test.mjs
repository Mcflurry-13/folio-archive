import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseMarkdown} from '../public/markdown.js';
import {mergeItems} from '../public/data.js';
test('SkillHub Markdown preserves text/media and deduplicates signed note URLs by ID',()=>{
 const raw='# My website\n原文链接: https://www.xiaohongshu.com/explore/6a733d75000000002402f578?xsec_token=one\n收藏于: 1\n---\nMy original body\n---\n图片: https://example.com/photo.jpg\n视频: https://example.com/video.mp4';
 const a=parseMarkdown(raw,'note.md','Portfolio');assert.equal(a.content,raw);assert.equal(a.title,'My website');
 const b=parseMarkdown(raw.replace('token=one','token=two'));const saved={...a,note:'my edit'};
 const merged=mergeItems([saved],[b]);assert.equal(merged.skipped,1);assert.equal(merged.items[0].note,'my edit');
});
test('Markdown rejects oversize instead of silently truncating and does not execute HTML',()=>{
 assert.throws(()=>parseMarkdown('a'.repeat(20001)));assert.equal(parseMarkdown('# Unsafe\n<script>alert(1)</script>').content,'# Unsafe\n<script>alert(1)</script>');
});
