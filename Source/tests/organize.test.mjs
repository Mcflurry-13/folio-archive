import {test} from 'node:test';import assert from 'node:assert/strict';
import {validateSuggestions} from '../lib/organize.mjs';import {mergeImports} from '../public/import-merge.js';import {parseMarkdown} from '../public/markdown.js';
test('organization rejects unknown IDs, invented quotes and duplicate suggestions',()=>{
 const items=[{id:'a',content:'真实原文',note:''}];const good={id:'a',category:'UI',reason:'why',evidence:'真实原文'};
 assert.deepEqual(validateSuggestions({suggestions:[{...good,id:'x'},{...good,evidence:'invented'},good,good]},items),[good]);
});
test('explicit source completion fills only empty body and preserves edits',()=>{
 const old={id:'a',title:'My edited title',content:'',note:'My note',category:'Mine',url:'https://example.com/'};const incoming={...old,title:'Source title',note:'',category:'AI',content:'Source body'};
 assert.equal(mergeImports([old],[incoming],false).items[0].content,'');
 const r=mergeImports([old],[incoming],true);assert.equal(r.completed,1);assert.deepEqual(r.items[0],{...old,content:'Source body'});
 assert.equal(mergeImports([{...old,content:'My edited body'}],[incoming],true).items[0].content,'My edited body');
});
test('board and explore routes share stable note identity',()=>{
 const a=parseMarkdown('# Test\n原文链接: https://www.xiaohongshu.com/board/65b0c7490000000008020af9/6ae70cef0000000015004a30?xsec_token=a\nbody');
 const b=parseMarkdown('# Test\n原文链接: https://www.xiaohongshu.com/explore/6ae70cef0000000015004a30?xsec_token=b\nbody');assert.equal(a.id,b.id);
});
import {shortlist} from '../public/retrieval.js';
test('large archives shortlist relevant late entries instead of silently using first 60',()=>{const items=Array.from({length:200},(_,i)=>({id:String(i),title:'generic',category:'',note:'',content:'unrelated'}));items[199].title='作品集 个人网站 portfolio';assert.equal(shortlist(items,'作品集 portfolio',60).length,60);assert.equal(shortlist(items,'作品集 portfolio',60)[0].id,'199');});
