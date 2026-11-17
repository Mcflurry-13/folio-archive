// Lightweight local shortlist. No claim of semantic/vector retrieval.
export function shortlist(items,task,limit=60){
 const textful=items.filter(x=>x.content?.trim()||x.note?.trim());if(textful.length<=limit)return textful;
 const q=task.toLowerCase();const words=q.match(/[a-z0-9]{2,}/g)||[];const han=[...(q.match(/[\p{Script=Han}]+/gu)||[])].flatMap(s=>Array.from({length:Math.max(0,s.length-1)},(_,i)=>s.slice(i,i+2)));const terms=[...new Set([...words,...han])];
 return textful.map((x,i)=>{const title=(x.title+' '+x.category+' '+x.note).toLowerCase(),body=(x.content||'').toLowerCase();return {x,i,score:terms.reduce((n,t)=>n+(title.includes(t)?4:0)+(body.includes(t)?1:0),0)};}).sort((a,b)=>b.score-a.score||a.i-b.i).slice(0,limit).map(o=>o.x);
}
