import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectNoteFailure} from '../browser-extension/sync.js';
test('task session survives module restart; expired tasks are discarded',async()=>{
 const records={};globalThis.chrome={storage:{session:{get:async key=>structuredClone(key===null?records:{[key]:records[key]}),set:async obj=>Object.assign(records,structuredClone(obj)),remove:async keys=>{for(const key of Array.isArray(keys)?keys:[keys])delete records[key];}}}};
 const a=await import('../browser-extension/sync-session.js?worker=1');await a.saveSession('test',{accountKey:'self',tabId:1,candidates:new Map([['n',{url:'https://www.xiaohongshu.com/explore/n'}]]),collections:new Map([['saved',{name:'Saved'}]])});
 const b=await import('../browser-extension/sync-session.js?worker=2');const restored=await b.loadSession('test');assert.equal(restored.candidates.get('n').url,'https://www.xiaohongshu.com/explore/n');assert.equal(restored.collections.get('saved').name,'Saved');
 restored.expiresAt=1;await b.saveSession('test',restored);assert.equal(await b.loadSession('test'),null);
});
test('missing DOM is distinguished from explicit deletion and restriction',()=>{for(const [text,expected] of [['正常页面','NOTE_DOM_NOT_FOUND'],['笔记已删除','NOTE_DELETED'],['访问过于频繁','SITE_RESTRICTED']]){globalThis.document={body:{innerText:text},readyState:'complete'};assert.equal(inspectNoteFailure(),expected);}});
