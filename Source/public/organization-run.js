import {chunks,batches,fingerprint} from './knowledge.js';
export const planKey=topics=>JSON.stringify(topics.map(t=>[t.id,t.name,t.rule]));
export function newOrganization(items,topics){return {status:'running',planKey:planKey(topics),ids:items.map(x=>x.id),rows:[],total:items.length};}
export function organizationComplete(run,items,topics){return run?.status==='complete'&&run.planKey===planKey(topics)&&items.length===run.ids.length&&items.every(x=>run.ids.includes(x.id));}
// Transport batches stay internal. A note is counted only after all its text blocks return
// and its category is saved (or it is explicitly left unresolved). Never animate invented progress.
export async function organizeNotes({run,items,topics,request,current,save,checkpoint,stopped}){
 const done=new Set(run.rows.map(x=>x.id));const remaining=items.filter(x=>!done.has(x.id));
 const blocks=chunks(remaining),left=new Map(),choices=new Map();
 for(const b of blocks)left.set(b.id,(left.get(b.id)||0)+1);
 const finish=async(item,status,topicId='',reason='')=>{
  const now=current().find(x=>x.id===item.id),topic=topics.find(t=>t.id===topicId);
  if(!now||fingerprint(now)!==fingerprint(item))status='changed';
  if(status==='saved'&&topic)await save(item,topic);
  run.rows.push({id:item.id,title:item.title,status,reason,topicId:status==='saved'?topicId:''});done.add(item.id);await checkpoint();
 };
 run.status='running';await checkpoint();
 try{
  for(const item of remaining.filter(x=>!left.has(x.id)))await finish(item,'pending','','missing-text');
  for(const blockGroup of batches(blocks)){
   if(stopped())break;
   const response=await request(blockGroup);
   for(const a of response.assignments||[])if(blockGroup.some(b=>b.id===a.id)&&topics.some(t=>t.id===a.topicId)){
    const set=choices.get(a.id)||new Set();set.add(a.topicId);choices.set(a.id,set);
   }
   for(const b of blockGroup)left.set(b.id,left.get(b.id)-1);
   for(const id of new Set(blockGroup.map(b=>b.id)))if(left.get(id)===0&&!done.has(id)){
    const set=choices.get(id)||new Set(),item=remaining.find(x=>x.id===id);
    await finish(item,set.size===1?'saved':'pending',set.size===1?[...set][0]:'',set.size>1?'conflict':set.size===0?'no-match':'');
   }
  }
  run.status=run.rows.length===run.total?'complete':'paused';
 }catch(e){run.status='failed';throw e;}
 finally{await checkpoint();}
}

// A proposal is ready only after all current pending records have a response.
// Cached choices are tied to source and plan; provider errors are not no-fit decisions.
export const organizationReviewKey=(item,topics)=>JSON.stringify([planKey(topics),item.title,fingerprint(item)]);
export function organizationPreview(run,items,topics){
 const rows=(run?.rows||[]).filter(r=>r.status==='pending');
 const entries=rows.flatMap(row=>{const item=items.find(x=>x.id===row.id);if(!item)return [];const key=organizationReviewKey(item,topics),review=row.review?.key===key?row.review:null;
 const override=row.reviewChoice?.key===key;
 const choice=override?row.reviewChoice.topicId:review?.status==='ready'?review.candidates.find(x=>topics.some(t=>t.id===x.topicId))?.topicId:'';
 return [{row,item,key,review,skipped:override&&!choice,topicId:topics.some(t=>t.id===choice)?choice:''}];});
 const waiting=entries.filter(e=>!e.review),failed=entries.filter(e=>e.review?.status==='error'),ready=entries.filter(e=>e.review?.status==='ready');
 return {entries,waiting,failed,ready,selected:ready.filter(e=>e.topicId),exceptions:ready.filter(e=>!e.topicId),settled:!!run&&run.planKey===planKey(topics)&&run.rows.length===run.total&&!waiting.length&&!failed.length,prepared:run?.rows.filter(r=>r.status!=='pending').length+ready.length||0};
}
