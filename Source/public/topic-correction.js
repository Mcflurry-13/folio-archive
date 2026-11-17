// Sample entry must never commit a suggested topic. The recruitment-purpose guard
// lives on the server; it is applied when the user requests organization.
export const ADOBE_ID='xiaohongshu:6ae83aa8000000001b01cbee';
const revision='unclassified-sample-entry-20261116';
const unsorted=x=>!x||['未分类','Unsorted'].includes(x);
const sameRecord=(a,b)=>a&&b&&Object.keys({...a,...b}).every(k=>k==='category'||JSON.stringify(a[k])===JSON.stringify(b[k]));
export function resetSamplePreclassification(items,knowledge={},published=[],categories=[]){
 const unchanged={items,knowledge,changed:false};
 if(knowledge.corrections?.[revision]||categories.length||knowledge.organization||knowledge.undo?.length||knowledge.confirmedTopics?.length||knowledge.assignments?.length)return unchanged;
 const item=items.find(x=>x.id===ADOBE_ID),seed=published.find(x=>x.id===ADOBE_ID);
 if(!item||!seed||!unsorted(seed.category)||!['职业发展','Career development'].includes(item.category))return unchanged;
 // Only an untouched, otherwise unclassified sample is eligible. Manual category
 // writes register categories; confirmed runs retain organization/undo metadata.
 // Ambiguous histories and edited records are left intact.
 if(items.some(x=>x.id!==ADOBE_ID&&!unsorted(x.category))||!sameRecord(item,seed))return unchanged;
 const prior=knowledge.corrections?.['adobe-career-20261115'];
 if(prior&&!unsorted(prior.itemBefore?.category))return unchanged;
 const next=structuredClone(knowledge);
 next.corrections={...(next.corrections||{}),[revision]:{itemBefore:structuredClone(item),reason:'Removed the category shipped in the sample; organization requires confirmation.'}};
 return {items:items.map(x=>x.id===ADOBE_ID?{...x,category:'未分类'}:x),knowledge:next,changed:true};
}
