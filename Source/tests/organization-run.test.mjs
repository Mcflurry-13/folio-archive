import test from 'node:test';import assert from 'node:assert/strict';
import {newOrganization,organizeNotes,organizationComplete} from '../public/organization-run.js';
const topics=[{id:'a',name:'Website building',rule:'Build sites'},{id:'b',name:'Career development',rule:'Hiring'}];
const notes=n=>Array.from({length:n},(_,i)=>({id:String(i),title:'Note '+i,content:'Useful source material '+i,category:'Unsorted'}));
function harness(items,request){const run=newOrganization(items,topics),progress=[],writes=[];let stop=false;
 return {run,progress,writes,stop:()=>{stop=true;},resume:()=>{stop=false;},execute:()=>organizeNotes({run,items:structuredClone(items),topics,request,current:()=>items,stopped:()=>stop,save:async(item,t)=>{items.find(x=>x.id===item.id).category=t.name;writes.push(item.id);},checkpoint:async()=>progress.push(run.rows.length)})};}
test('counts completed notes, saves before reporting, leaves missing evidence pending',async()=>{
 const items=notes(18);items.push({id:'empty',title:'Link only',content:'',category:'Unsorted'});
 const h=harness(items,async blocks=>({assignments:blocks.filter(x=>x.id!=='2').map(x=>({id:x.id,topicId:'a'}))}));await h.execute();
 assert.equal(h.run.total,19);assert.equal(h.run.rows.length,19);assert.equal(h.writes.length,17);assert.equal(items[2].category,'Unsorted');
 assert.equal(h.run.rows.find(x=>x.id==='empty').status,'pending');assert.ok(organizationComplete(h.run,items,topics));assert.ok(h.progress.every((n,i)=>!i||n>=h.progress[i-1]));
});
test('failure and resume preserve saved notes without repeating their requests',async()=>{
 const items=notes(20);let calls=0;const asked=[];const h=harness(items,async blocks=>{asked.push(blocks.map(b=>b.id));if(++calls===2)throw Error('offline');return {assignments:blocks.map(b=>({id:b.id,topicId:'a'}))};});
 await assert.rejects(h.execute(),/offline/);assert.equal(h.run.status,'failed');assert.equal(h.run.rows.length,16);
 await h.execute();assert.equal(h.run.status,'complete');assert.equal(h.writes.length,20);assert.deepEqual(asked[2],['16','17','18','19']);
});
test('long note is counted once after all blocks; conflicting topics stay pending',async()=>{
 const items=[{id:'long',title:'Long',content:'x'.repeat(60000),category:'Unsorted'}];let calls=0;const h=harness(items,async blocks=>{assert.equal(h.run.rows.length,0);return {assignments:[{id:'long',topicId:++calls===1?'a':'b'}]};});await h.execute();
 assert.equal(calls,2);assert.equal(h.run.rows.length,1);assert.equal(h.run.rows[0].status,'pending');assert.equal(h.writes.length,0);
});
test('pause completes only returned work; source edits are never overwritten',async()=>{
 const items=notes(20);const h=harness(items,async blocks=>{items[0].content='Edited while waiting';h.stop();return {assignments:blocks.map(b=>({id:b.id,topicId:'a'}))};});await h.execute();
 assert.equal(h.run.status,'paused');assert.equal(h.run.rows.length,16);assert.equal(items[0].category,'Unsorted');assert.equal(h.run.rows[0].status,'changed');assert.equal(h.writes.length,15);
});

test('complete preview separates waiting, failed and no-fit from selected proposals',async()=>{
 const {organizationPreview,organizationReviewKey}=await import('../public/organization-run.js');
 const items=notes(4),run=newOrganization(items,topics);
 run.rows=items.map(x=>({id:x.id,title:x.title,status:'pending'}));
 const ready=(i,candidates)=>({key:organizationReviewKey(items[i],topics),status:'ready',candidates});
 run.rows[0].review=ready(0,[{topicId:'a'}]);run.rows[1].review=ready(1,[]);
 run.rows[2].review={...ready(2,[]),status:'error'};
 let v=organizationPreview(run,items,topics);assert.equal(v.settled,false);assert.equal(v.waiting.length,1);assert.equal(v.failed.length,1);assert.equal(v.exceptions.length,1);assert.equal(v.selected.length,1);assert.equal(v.prepared,2);
 run.rows[2].review=ready(2,[{topicId:'b'}]);run.rows[3].review=ready(3,[{topicId:'a'}]);
 run.rows[3].reviewChoice={key:organizationReviewKey(items[3],topics),topicId:''};
 v=organizationPreview(run,items,topics);assert.equal(v.settled,true);assert.equal(v.selected.length,2);assert.equal(v.exceptions.length,2);
 items[0].content='Edited by user';v=organizationPreview(run,items,topics);assert.equal(v.settled,false);assert.equal(v.waiting.length,1);assert.ok(!v.selected.some(e=>e.row.id==='0'));
});
