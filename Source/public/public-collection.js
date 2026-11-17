import {mergeItems} from './data.js';
import {currentSummary} from './summary-data.js';
import {resetSamplePreclassification} from './topic-correction.js';
export const PUBLIC_COLLECTIONS={rednote:{id:'folio-public-100-v1',url:'/collection/v1/library.json'},x:{id:'folio-x-public-100-v1',url:'/collection/x-v1/library.json'}};
export function validatePublicCollection(data){
 if(!Object.values(PUBLIC_COLLECTIONS).some(x=>x.id===data?.id)||data.version!==1||data.items?.length!==100)throw Error('Invalid public collection');
 const result=mergeItems([],data.items);if(result.added!==100)throw Error('Duplicate public collection records');
 const summaries={};for(const x of result.items){const s=currentSummary(data.summaries,x);if(s&&['ready','insufficient'].includes(s.status))summaries[x.id]=s;}
 return {items:result.items,summaries};
}
// No schema migration or receipt key: an existing items value (even []) is a user's library.
// Recheck inside one transaction so concurrent tabs cannot overwrite one another.
export async function installPublicCollection(db,read,fetcher=fetch,key='rednote'){
 if(await read('items')!==undefined)return {status:'existing'};
 try{
  const collection=PUBLIC_COLLECTIONS[key];if(!collection)throw Error('Unknown collection');
  const response=await fetcher(collection.url,{signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('Collection unavailable');
  const payload=await response.json();if(payload.id!==collection.id)throw Error('Wrong collection');
  const data=validatePublicCollection(payload);
  if(!db)return {status:'memory',items:data.items,summaries:data.summaries};
  return await new Promise((resolve,reject)=>{
   const tx=db.transaction('state','readwrite'),store=tx.objectStore('state');let installed=false;
   const r=store.get('items');r.onsuccess=()=>{if(r.result!==undefined)return;installed=true;store.put(data.items,'items');const s=store.get('summaries');s.onsuccess=()=>store.put({...data.summaries,...(s.result||{})},'summaries');};
   tx.oncomplete=()=>resolve({status:installed?'installed':'existing'});tx.onabort=()=>reject(tx.error||Error('Collection save failed'));tx.onerror=()=>reject(tx.error);
  });
 }catch{return {status:'unavailable'};}
}

// Source additions require an exact match to the previously published text. All other fields (including user
// notes, categories and titles) remain local. Missing/deleted records are never recreated by a refresh.
export function publicRefresh(items,cache,payload){
 const sourceById=new Map(payload.items.map(x=>[x.id,x]));let count=0,changedItems=false;
 const summaries={...cache};
 const next=items.map(x=>{
  const published=sourceById.get(x.id),patch=payload.sourceUpdates?.[x.id];let item=x;
  if(published&&typeof patch?.fromContent==='string'&&x.content===patch.fromContent&&x.content!==published.content){
   item={...x,content:published.content};changedItems=true;
  }
  const s=currentSummary(payload.summaries,item);
  const local=currentSummary(summaries,item);
  if(s&&['ready','insufficient'].includes(s.status)&&(!local||(local.status==='insufficient'&&s.origin==='owner-caption'))){summaries[item.id]=s;count++;}
  return item;
 });
 return {items:next,summaries,count,changedItems};
}
// Refresh runs only in explicitly selected sample databases. Check source text again inside the write transaction
// so an edit made while the request was in flight cannot be overwritten. Personal libraries are not patched.
export async function refreshPublicSummaries(db,read,fetcher=fetch,key){
 try{
  const collection=PUBLIC_COLLECTIONS[key];if(!collection||!db)return 0;
  const items=await read('items');if(!Array.isArray(items)||!items.length)return 0;
  const response=await fetcher(collection.url,{signal:AbortSignal.timeout(4000)});if(!response.ok)return 0;
  const payload=await response.json();if(payload.id!==collection.id)return 0;
  const published=validatePublicCollection(payload);
  return await new Promise((resolve,reject)=>{
   const tx=db.transaction('state','readwrite'),store=tx.objectStore('state');let count=0;
   const r=store.get('items');r.onsuccess=()=>{
    if(!Array.isArray(r.result)||!r.result.length)return;
    const s=store.get('summaries');s.onsuccess=()=>{
     const next=publicRefresh(r.result,s.result||{},payload);count=next.count;
     if(next.changedItems)store.put(next.items,'items');
     if(count)store.put(next.summaries,'summaries');
     if(key==='rednote'){
      const k=store.get('knowledge');k.onsuccess=()=>{
       const cats=store.get('categories');cats.onsuccess=()=>{
        const corrected=resetSamplePreclassification(next.items,k.result||{},published.items,cats.result||[]);
        if(corrected.changed){store.put(corrected.items,'items');store.put(corrected.knowledge,'knowledge');}
       };
      };
     }
    };
   };
   tx.oncomplete=()=>resolve(count);tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error);
  });
 }catch{return 0;}
}
