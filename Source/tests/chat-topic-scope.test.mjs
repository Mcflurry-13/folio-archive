import test from 'node:test';
import assert from 'node:assert/strict';
import {inTopicScope, chunks} from '../public/knowledge.js';
import {anchoredBlocks,checkEvidence} from '../lib/knowledge-agent.mjs';
const note={id:'a',title:'A',category:'Cases',topics:['Cases','Afterlight'],content:'Place the findings beside the decisions they informed.'};
const other={...note,id:'b',topics:['Cases']};
test('topic unions and intersections return each authorized save once',()=>{
 const source=[note,other,note];
 const find=(mode,...names)=>inTopicScope(source,{mode,names}).map(x=>x.id);
 assert.deepEqual(find('any','CASES','afterlight'),['a','b']);
 assert.deepEqual(find('all','Cases','Afterlight'),['a']);
 assert.deepEqual(find('any','Absent'),[]);
 assert.deepEqual(find('unrestricted'),['a','b']);
});
test('manual-only keywords can locate blocks but cannot serve as quotes',()=>{
 const blocks=anchoredBlocks({blocks:chunks([note,other]),anchorTerms:['Afterlight']});
 assert.deepEqual(blocks.map(x=>x.id),['a']);
 const evidence={...blocks[0],quote:'Afterlight'};
 assert.equal(checkEvidence(evidence,blocks),false);
 assert.equal(checkEvidence({...evidence,quote:note.content},blocks),true);
});
