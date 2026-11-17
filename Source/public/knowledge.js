export function eligibleEvidence(text){return String(text).replace(/https?:\/\/[^\s)]+/g,'').replace(/#[^\s#]+/g,'').replace(/^(?:原文链接|作者|收藏专辑|专辑排列|图片链接|视频链接)[:：].*$/gm,'').replace(/[^\p{L}\p{N}]/gu,'').length>=4;}
// Derived views only: never rewrite saved source content.
export function fingerprint(x){let h=2166136261;for(const c of JSON.stringify([x.content||'',x.note||'',x.category||'']))h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0).toString(16);}
export function sourceView(x){
 const raw=String(x.content||'');const isExport=/^(?:原文链接|来源|Source)\s*[:：]/mi.test(raw)&&/^---\s*$/m.test(raw);
 const parts=raw.split(/^---\s*$/m);let body=isExport?(parts[1]||''):raw;
 const generated=/含 AI 建议|Includes AI suggestions|Made in Find inspiration|在“找灵感”中生成/.test(x.note||'');
 const eligible=eligibleEvidence(body);if(!eligible)body='';else body=body.trim();
 const note=generated?'':String(x.note||'').trim();
 return {id:x.id,title:x.title,url:x.url||'',category:x.category||'',body:generated?'':body,note,generated,hash:fingerprint(x),mediaLinks:(raw.match(/https?:\/\/[^\s)]+/g)||[]).length,status:generated?'ai-suggestion':body?'text':note?'user-note':'missing'};
}
// Topic membership narrows the authorized pool. Evidence always comes from the note text.
export function inTopicScope(items, scope) {
 const key = value => value.normalize('NFKC').trim().toLowerCase();
 const requested = (scope?.names || []).map(key);
 const distinct = [...new Map(items.map(item => [item.id, item])).values()];
 if (!scope || scope.mode === 'unrestricted') return distinct;
 if (!requested.length) return [];
 return distinct.filter(item => {
  const labels = new Set((item.topics || []).map(key));
  if (scope.mode === 'all') return requested.every(name => labels.has(name));
  return scope.mode === 'any' && requested.some(name => labels.has(name));
 });
}
export function chunks(items){return items.flatMap(x=>{const v=sourceView(x);const blocks=[];for(const [kind,text] of [['source',v.body],['user_note',v.note]]){for(let offset=0;offset<text.length;offset+=3500)blocks.push({id:v.id,blockId:`${v.id}:${kind}:${offset}`,kind,text:text.slice(offset,offset+4000),title:v.title,category:v.category,...(x.topics?.length?{topics:x.topics}:{}),hash:v.hash});}return blocks;});}
export function batches(blocks,size=16){const out=[];for(let i=0;i<blocks.length;i+=size)out.push(blocks.slice(i,i+size));return out;}
export function validateBundle(b){
 if(!b||b.format!=='folio-task-v1'||!Array.isArray(b.materials)||b.materials.length>200||!b.task||typeof b.task.goal!=='string'||!Array.isArray(b.allowedIds))throw Error('Invalid Folio task bundle');
 const ids=b.materials.map(x=>x.id);if(new Set(ids).size!==ids.length||new Set(b.allowedIds).size!==ids.length||ids.some(id=>!b.allowedIds.includes(id)))throw Error('Invalid authorized scope');
 for(const x of b.materials)if(typeof x.id!=='string'||typeof x.content!=='string'||typeof x.title!=='string'||x.content.length>100000)throw Error('Invalid material');
 if(b.draft!==undefined&&(typeof b.draft!=='string'||b.draft.length>20000))throw Error('Invalid draft');
 for(const r of b.recommendations||[])if((r.evidence||[]).some(e=>!ids.includes(e.id)))throw Error('Recommendation outside authorized scope');
 return b;
}
export function makeBundle(task,items,result,includeNotes=true){const selected=items.filter(x=>task.selectedIds.includes(x.id)&&!task.excludedIds.includes(x.id));const ids=selected.map(x=>x.id);return validateBundle({format:'folio-task-v1',createdAt:new Date().toISOString(),access:'read-only snapshot',allowedIds:ids,task:Object.fromEntries(['id','revision','goal','constraints','preferences','confirmedDirections','rejectedDirections','unresolvedQuestions'].map(k=>[k,task[k]??''])),materials:selected.map(x=>({id:x.id,title:x.title,url:x.url||'',content:sourceView(x).body,note:includeNotes?sourceView(x).note:'',contentHash:fingerprint(x)})),draft:result?.draft||'',recommendations:(result?.recommendations||[]).filter(r=>(r.evidence||[]).every(e=>ids.includes(e.id)&&(includeNotes||e.kind!=='user_note'))).map(r=>({...r,kind:'AI suggestion'})),missing:result?.missing||[],notice:'Snapshot only. No live browser access. Exported copies cannot be remotely revoked.'});}
