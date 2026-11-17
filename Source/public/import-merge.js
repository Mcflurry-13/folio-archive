import {mergeItems} from './data.js';
export function mergeImports(existing,incoming,fillEmpty=false){
 let completed=0;let list=existing;
 if(fillEmpty){list=existing.map(old=>{if(old.content?.trim())return old;const fresh=incoming.find(x=>x.content?.trim()&&((x.id&&x.id===old.id)||(x.url&&x.url===old.url)));if(!fresh)return old;completed++;return {...old,content:fresh.content};});}
 return {...mergeItems(list,incoming),completed};
}
