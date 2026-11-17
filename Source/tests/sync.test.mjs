import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectDOM} from '../browser-extension/sync.js';
test('domestic sync rejects international redirect before inspecting content',()=>{globalThis.location={hostname:'www.rednote.com'};globalThis.document={body:{innerText:''}};assert.equal(inspectDOM('session').error,'INTERNATIONAL_REDIRECT');});
test('captcha stops even when a session might otherwise be present',()=>{globalThis.location={hostname:'www.xiaohongshu.com'};globalThis.document={body:{innerText:'请完成验证'},querySelector:()=>null};assert.equal(inspectDOM('preview').error,'CAPTCHA');});
test('login and unrelated profile tabs cannot become a collection',()=>{globalThis.location={hostname:'www.xiaohongshu.com',pathname:'/user/profile/other'};globalThis.document={body:{innerText:''},querySelector:()=>null,querySelectorAll:()=>[{textContent:'我',href:'https://www.xiaohongshu.com/user/profile/self'}]};assert.equal(inspectDOM('collections').error,'OPEN_SAVED');});
