import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ruleBlocks} from '../public/rule-editor.js';
test('rule display preserves prose and groups Markdown lists without rewriting criteria',()=>{
 const b=ruleBlocks('Include these:\n\n- Mobile UI\n- Keyboard access\n\n1. Review\n2. Test');assert.deepEqual(b,[{type:'p',text:'Include these:'},{type:'ul',items:['Mobile UI','Keyboard access']},{type:'ol',items:['Review','Test']}]);
});
test('JSON becomes readable code; malformed JSON and HTML remain literal text',()=>{
 assert.equal(ruleBlocks('{"include":["Mobile"]}')[0].text,'{\n  "include": [\n    "Mobile"\n  ]\n}');assert.deepEqual(ruleBlocks('<img src=x onerror=alert(1)>'),[{type:'p',text:'<img src=x onerror=alert(1)>'}]);assert.equal(ruleBlocks('{broken')[0].type,'p');assert.equal(ruleBlocks('```json\n{"include":[]}\n```')[0].type,'code');
});
